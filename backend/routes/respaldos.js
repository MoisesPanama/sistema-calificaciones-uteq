// =========================================================
// routes/respaldos.js — respaldos de base de datos
// =========================================================

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const pool = require('../config/db');
const { leerPaginacion, respuestaPaginada } = require('../helpers/paginacion');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// Configuracion de la DB desde .env
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;
const DB_NAME = process.env.DB_NAME || 'sistema_calificaciones';
const DB_USER = process.env.DB_USER || 'app_uteq';

// Maximo de archivos .sql a conservar (configurable, no hardcodeado).
// Al superar el limite se borran los mas antiguos (rotacion).
const MAX_RESPALDOS = Math.max(1, parseInt(process.env.RESPALDOS_MAX_ARCHIVOS) || 30);

// Estado del respaldo programado (en memoria: se pierde al
// reiniciar el servidor; ver README, seccion Respaldos).
let cronJob = null;
let programadoActivo = false;
let horaProgramada = null;

// Registra una ejecucion en respaldo_logs (migracion 14). Best-effort:
// si el log falla, no debe romper el flujo del respaldo.
async function registrarLog({ tipo, nombre, tamano, exito, detalle, idUsuario }) {
    try {
        await pool.query(
            `INSERT INTO respaldo_logs (tipo, nombre_archivo, tamano_bytes, exito, detalle, id_usuario_app)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [tipo, nombre || null, tamano ?? null, exito, detalle || null, idUsuario || null]
        );
    } catch (error) {
        console.error('No se pudo registrar el log del respaldo:', error.message);
    }
}

// Rotacion: conserva solo los MAX_RESPALDOS mas recientes.
function aplicarRotacion() {
    try {
        const archivos = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.sql'))
            .map(f => ({ nombre: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
        const sobrantes = archivos.slice(MAX_RESPALDOS);
        for (const s of sobrantes) {
            try {
                fs.unlinkSync(path.join(BACKUP_DIR, s.nombre));
            } catch (error) {
                console.error('No se pudo rotar el respaldo ' + s.nombre + ':', error.message);
            }
        }
        return sobrantes.length;
    } catch (error) {
        console.error('Error al aplicar rotacion de respaldos:', error.message);
        return 0;
    }
}

// Funcion para ejecutar pg_dump
function ejecutarRespald(callback) {
    const ahora = new Date();
    const nombre = `respaldo_${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}_${String(ahora.getHours()).padStart(2,'0')}${String(ahora.getMinutes()).padStart(2,'0')}${String(ahora.getSeconds()).padStart(2,'0')}.sql`;
    const archivo = path.join(BACKUP_DIR, nombre);

    const args = [
        '-h', DB_HOST,
        '-p', String(DB_PORT),
        '-U', DB_USER,
        '-d', DB_NAME,
        '--schema=colegio',
        '--no-owner',
        '--no-privileges',
        '-f', archivo
    ];

    const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' };

    execFile('pg_dump', args, { env, timeout: 60000 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Error en pg_dump:', error.message);
            return callback(error);
        }
        const stats = fs.statSync(archivo);
        callback(null, {
            nombre,
            archivo,
            tamano: stats.size,
            fecha: ahora.toISOString()
        });
    });
}

// GET /api/respaldos — listar respaldos
router.get('/', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        const archivos = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.sql'))
            .map(f => {
                const stats = fs.statSync(path.join(BACKUP_DIR, f));
                return {
                    nombre: f,
                    tamano: stats.size,
                    fecha: stats.mtime.toISOString()
                };
            })
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        res.json({
            respaldos: archivos,
            programado: {
                activo: programadoActivo,
                hora: horaProgramada
            }
        });
    } catch (error) {
        console.error('Error al listar respaldos:', error.message);
        res.status(500).json({ error: 'No se pudieron listar los respaldos.' });
    }
});

// POST /api/respaldos/manual — crear respaldo manual
router.post('/manual', requireAuth, requireRole('administrador'), async (req, res) => {
    const idUsuario = req.session.usuario.id_usuario;
    try {
        const resultado = await new Promise((resolve, reject) => {
            ejecutarRespald((err, data) => err ? reject(err) : resolve(data));
        });
        const purgados = aplicarRotacion();
        await registrarLog({
            tipo: 'manual', nombre: resultado.nombre, tamano: resultado.tamano,
            exito: true, detalle: purgados > 0 ? `Rotacion: ${purgados} archivo(s) antiguo(s) eliminado(s).` : null,
            idUsuario
        });
        res.json({ ok: true, mensaje: 'Respaldo creado correctamente.', respaldo: resultado, purgados });
    } catch (error) {
        console.error('Error al crear respaldo manual:', error.message);
        await registrarLog({ tipo: 'manual', exito: false, detalle: error.message, idUsuario });
        res.status(500).json({ error: 'No se pudo crear el respaldo. Verifique que pg_dump este disponible.' });
    }
});

// POST /api/respaldos/programar — configurar respaldo programado
router.post('/programar', requireAuth, requireRole('administrador'), async (req, res) => {
    const { hora, minutos, activo } = req.body || {};

    if (cronJob) {
        cronJob.stop();
        cronJob = null;
    }
    programadoActivo = false;
    horaProgramada = null;

    if (!activo) {
        return res.json({ ok: true, mensaje: 'Respaldo programado desactivado.', programado: { activo: false, hora: null } });
    }

    if (hora == null || minutos == null) {
        return res.status(400).json({ error: 'Debe especificar hora y minutos.' });
    }

    const cron = require('node-cron');
    const h = String(hora).padStart(2, '0');
    const m = String(minutos).padStart(2, '0');
    const expresion = `${m} ${h} * * *`;

    if (!cron.validate(expresion)) {
        return res.status(400).json({ error: 'Expresion de tiempo no valida.' });
    }

    cronJob = cron.schedule(expresion, () => {
        console.log(`[Respaldo programado] Ejecutando respaldo automatico a las ${h}:${m}`);
        ejecutarRespald((err, data) => {
            if (err) {
                console.error('[Respaldo programado] Error:', err.message);
                registrarLog({ tipo: 'programado', exito: false, detalle: err.message, idUsuario: null });
            } else {
                console.log(`[Respaldo programado] Respaldo creado: ${data.nombre}`);
                const purgados = aplicarRotacion();
                registrarLog({
                    tipo: 'programado', nombre: data.nombre, tamano: data.tamano,
                    exito: true, detalle: purgados > 0 ? `Rotacion: ${purgados} archivo(s) antiguo(s) eliminado(s).` : null,
                    idUsuario: null
                });
            }
        });
    });

    programadoActivo = true;
    horaProgramada = `${h}:${m}`;

    res.json({
        ok: true,
        mensaje: `Respaldo programado activado a las ${horaProgramada} diariamente.`,
        programado: { activo: true, hora: horaProgramada }
    });
});

// GET /api/respaldos/historial — log de ejecuciones (migracion 14).
// NULL en usuario = disparo programado (cron).
router.get('/historial', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        const { page, limit, offset } = leerPaginacion(req.query, { porDefecto: 10, minimo: 5 });
        const countResult = await pool.query('SELECT COUNT(*) AS total FROM respaldo_logs');
        const resultado = await pool.query(
            `SELECT l.id_log, l.fecha, l.tipo, l.nombre_archivo, l.tamano_bytes,
                    l.exito, l.detalle,
                    u.nombres AS usuario_nombres, u.apellidos AS usuario_apellidos
             FROM respaldo_logs l
             LEFT JOIN usuarios u ON u.id_usuario = l.id_usuario_app
             ORDER BY l.fecha DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        res.json(respuestaPaginada(resultado.rows, { page, limit, total: countResult.rows[0].total }));
    } catch (error) {
        console.error('Error al cargar historial de respaldos:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el historial de respaldos.' });
    }
});

// POST /api/respaldos/descargar — descargar respaldo
router.post('/descargar', requireAuth, requireRole('administrador'), async (req, res) => {
    const { nombre } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'Nombre del archivo requerido.' });

    const archivo = path.join(BACKUP_DIR, nombre);
    if (!archivo.startsWith(BACKUP_DIR) || !fs.existsSync(archivo)) {
        return res.status(404).json({ error: 'Respaldo no encontrado.' });
    }

    res.download(archivo, nombre);
});

// POST /api/respaldos/eliminar — eliminar respaldo
router.post('/eliminar', requireAuth, requireRole('administrador'), async (req, res) => {
    const { nombre } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'Nombre del archivo requerido.' });

    const archivo = path.join(BACKUP_DIR, nombre);
    if (!archivo.startsWith(BACKUP_DIR) || !fs.existsSync(archivo)) {
        return res.status(404).json({ error: 'Respaldo no encontrado.' });
    }

    try {
        fs.unlinkSync(archivo);
        res.json({ ok: true, mensaje: 'Respaldo eliminado.' });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo eliminar el respaldo.' });
    }
});

module.exports = router;
