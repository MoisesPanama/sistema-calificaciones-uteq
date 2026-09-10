// =========================================================
// routes/ciclos.js — CRUD de ciclos evaluativos (Fase 6)
// Lectura: cualquier autenticado. Escritura: solo admin.
// Reglas: orden unico por periodo (UNIQUE en BD), no eliminar
// con notas asociadas (409), aviso (no bloqueo) si la suma de
// pesos del periodo se aleja de 1.00.
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole, setUsuarioAuditoria } = require('../middleware/auth');
const { getPeriodoActivo } = require('../helpers/contexto');

const TIPOS_CICLO = ['quimestre', 'trimestre', 'bimestre', 'semestre', 'otro'];

// Aviso (no bloqueo): la suma de pesos de los ciclos de un
// periodo deberia acercarse a 1.00 para el promedio anual.
async function advertenciaSumaPesos(conn, idPeriodo) {
    const r = await conn.query(
        'SELECT COALESCE(SUM(peso), 0) AS suma FROM ciclos_evaluativos WHERE id_periodo = $1',
        [idPeriodo]
    );
    const suma = Number(r.rows[0].suma);
    if (Math.abs(1 - suma) > 0.005) {
        return `La suma de pesos de los ciclos del periodo es ${suma.toFixed(2)} (deberia ser 1.00).`;
    }
    return null;
}

function validarCiclo(body) {
    const errores = [];
    if (!body.nombre || String(body.nombre).trim() === '') errores.push('El nombre del ciclo es obligatorio.');
    if (!body.id_periodo) errores.push('El periodo es obligatorio.');
    if (body.orden === undefined || body.orden === null || !Number.isInteger(Number(body.orden)) || Number(body.orden) <= 0) {
        errores.push('El orden debe ser un entero mayor que cero.');
    }
    if (body.peso === undefined || body.peso === null || isNaN(Number(body.peso)) || Number(body.peso) <= 0 || Number(body.peso) > 1) {
        errores.push('El peso debe estar entre 0.01 y 1.00.');
    }
    if (body.tipo && !TIPOS_CICLO.includes(body.tipo)) {
        errores.push('Tipo de ciclo no valido: ' + TIPOS_CICLO.join(', ') + '.');
    }
    return errores;
}

// GET /api/ciclos?id_periodo= -> listado del periodo (activo por defecto)
router.get('/', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        const idPeriodo = req.query.id_periodo || (periodoActivo && periodoActivo.id_periodo);
        if (!idPeriodo) return res.json({ ciclos: [] });
        const r = await pool.query(
            `SELECT c.id_ciclo, c.nombre, c.tipo, c.orden, c.peso, c.id_periodo,
                    (SELECT COUNT(*) FROM parciales p WHERE p.id_ciclo = c.id_ciclo)::int AS n_parciales
             FROM ciclos_evaluativos c
             WHERE c.id_periodo = $1
             ORDER BY c.orden`,
            [idPeriodo]
        );
        res.json({ ciclos: r.rows });
    } catch (error) {
        console.error('Error al listar ciclos:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los ciclos evaluativos.' });
    }
});

// POST /api/ciclos -> crear (admin)
router.post('/', requireAuth, requireRole('administrador'), async (req, res) => {
    const { nombre, tipo, orden, peso, id_periodo } = req.body || {};
    const errores = validarCiclo(req.body || {});
    if (errores.length > 0) return res.status(400).json({ error: errores.join(' '), errores });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            'INSERT INTO ciclos_evaluativos (id_periodo, nombre, tipo, orden, peso) VALUES ($1, $2, $3, $4, $5) RETURNING id_ciclo',
            [id_periodo, String(nombre).trim(), tipo || 'quimestre', Number(orden), Number(peso)]
        );
        const advertencia = await advertenciaSumaPesos(client, id_periodo);
        await client.query('COMMIT');
        res.status(201).json({ ok: true, id_ciclo: r.rows[0].id_ciclo, advertencia });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al crear ciclo:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un ciclo con ese orden o nombre en el periodo.' });
        }
        res.status(500).json({ error: 'No se pudo guardar el ciclo.' });
    } finally {
        client.release();
    }
});

// PUT /api/ciclos/:id -> editar (admin)
router.put('/:id', requireAuth, requireRole('administrador'), async (req, res) => {
    const { nombre, tipo, orden, peso } = req.body || {};
    const errores = validarCiclo({ ...req.body, id_periodo: req.body.id_periodo || 1 });
    const erroresSinPeriodo = errores.filter((e) => e !== 'El periodo es obligatorio.');
    if (erroresSinPeriodo.length > 0) return res.status(400).json({ error: erroresSinPeriodo.join(' '), errores: erroresSinPeriodo });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            'UPDATE ciclos_evaluativos SET nombre = $1, tipo = $2, orden = $3, peso = $4 WHERE id_ciclo = $5 RETURNING id_ciclo, id_periodo',
            [String(nombre).trim(), tipo || 'quimestre', Number(orden), Number(peso), req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Ciclo no encontrado.' });
        }
        const advertencia = await advertenciaSumaPesos(client, r.rows[0].id_periodo);
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Ciclo actualizado correctamente.', advertencia });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al editar ciclo:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un ciclo con ese orden o nombre en el periodo.' });
        }
        res.status(500).json({ error: 'No se pudo editar el ciclo.' });
    } finally {
        client.release();
    }
});

// DELETE /api/ciclos/:id -> eliminar (admin), bloqueado con notas
router.delete('/:id', requireAuth, requireRole('administrador'), async (req, res) => {
    const client = await pool.connect();
    try {
        const uso = await client.query(
            `SELECT (SELECT COUNT(*) FROM calificaciones WHERE id_ciclo = $1)::int AS notas_ciclo,
                    (SELECT COUNT(*) FROM calificaciones WHERE id_parcial IN
                        (SELECT id_parcial FROM parciales WHERE id_ciclo = $1))::int AS notas_parciales`,
            [req.params.id]
        );
        if (uso.rows[0].notas_ciclo > 0 || uso.rows[0].notas_parciales > 0) {
            return res.status(409).json({
                error: 'No se puede eliminar: el ciclo (o sus parciales) tiene calificaciones registradas.'
            });
        }
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query('DELETE FROM ciclos_evaluativos WHERE id_ciclo = $1 RETURNING id_ciclo', [req.params.id]);
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Ciclo no encontrado.' });
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Ciclo eliminado correctamente (sus parciales sin notas se eliminaron en cascada).' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al eliminar ciclo:', error.message);
        res.status(500).json({ error: 'No se pudo eliminar el ciclo.' });
    } finally {
        client.release();
    }
});

module.exports = router;
