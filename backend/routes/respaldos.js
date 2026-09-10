// =========================================================
// routes/respaldos.js — respaldos de base de datos
// =========================================================

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
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

// Estado del respaldo programado
let cronJob = null;
let programadoActivo = false;
let horaProgramada = null;

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
    try {
        const resultado = await new Promise((resolve, reject) => {
            ejecutarRespald((err, data) => err ? reject(err) : resolve(data));
        });
        res.json({ ok: true, mensaje: 'Respaldo creado correctamente.', respaldo: resultado });
    } catch (error) {
        console.error('Error al crear respaldo manual:', error.message);
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
            if (err) console.error('[Respaldo programado] Error:', err.message);
            else console.log(`[Respaldo programado] Respaldo creado: ${data.nombre}`);
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
