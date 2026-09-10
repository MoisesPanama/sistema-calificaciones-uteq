// =========================================================
// routes/periodos.js — GET /api/periodos, POST, POST /:id/activar
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole, setUsuarioAuditoria } = require('../middleware/auth');
const { getPeriodoActivo } = require('../helpers/contexto');
const { getAllPeriodos } = require('../helpers/periodos');

// GET /api/periodos -> { periodos, periodoActivo }
router.get('/', requireAuth, async (req, res) => {
    try {
        const periodos = await getAllPeriodos();
        const periodoActivo = await getPeriodoActivo();
        res.json({ periodos, periodoActivo });
    } catch (error) {
        console.error('Error al listar periodos:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el listado de periodos.' });
    }
});

// POST /api/periodos { nombre, fecha_inicio, fecha_fin }
router.post('/', requireAuth, async (req, res) => {
    const { nombre, fecha_inicio, fecha_fin } = req.body || {};
    const errores = [];
    if (!nombre || String(nombre).trim() === '') errores.push('El nombre del periodo es obligatorio.');
    if (!fecha_inicio) errores.push('La fecha de inicio es obligatoria.');
    if (!fecha_fin) errores.push('La fecha de fin es obligatoria.');
    if (errores.length > 0) {
        return res.status(400).json({ error: errores.join(' '), errores });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
            const r = await client.query(
                'INSERT INTO periodos_academicos (nombre, fecha_inicio, fecha_fin) VALUES ($1, $2, $3) RETURNING id_periodo',
                [nombre, fecha_inicio, fecha_fin]
            );
            await client.query('COMMIT');
            res.status(201).json({ ok: true, id_periodo: r.rows[0].id_periodo });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error al crear periodo:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un periodo registrado con ese nombre.' });
        } else if (error.code === '23514') {
            return res.status(400).json({ error: 'La fecha de fin debe ser posterior a la fecha de inicio.' });
        }
        res.status(500).json({ error: 'No se pudo guardar el periodo.' });
    }
});

// POST /api/periodos/:id/editar
router.post('/:id/editar', requireAuth, requireRole('administrador'), async (req, res) => {
    const { nombre, fecha_inicio, fecha_fin } = req.body || {};
    const errores = [];
    if (!nombre || String(nombre).trim() === '') errores.push('El nombre del periodo es obligatorio.');
    if (!fecha_inicio) errores.push('La fecha de inicio es obligatoria.');
    if (!fecha_fin) errores.push('La fecha de fin es obligatoria.');
    if (errores.length > 0) {
        return res.status(400).json({ error: errores.join(' '), errores });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
            const r = await client.query(
                'UPDATE periodos_academicos SET nombre = $1, fecha_inicio = $2, fecha_fin = $3 WHERE id_periodo = $4 RETURNING id_periodo',
                [nombre, fecha_inicio, fecha_fin, req.params.id]
            );
            await client.query('COMMIT');
            if (r.rows.length === 0) {
                return res.status(404).json({ error: 'Periodo no encontrado.' });
            }
            res.json({ ok: true, mensaje: 'Periodo actualizado correctamente.' });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error al editar periodo:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un periodo registrado con ese nombre.' });
        }
        res.status(500).json({ error: 'No se pudo editar el periodo.' });
    }
});

// POST /api/periodos/:id/activar -> fija el periodo activo (solo admin).
// El trigger trg_solo_un_periodo_activo desactiva los demas.
router.post('/:id/activar', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
            const r = await client.query(
                'UPDATE periodos_academicos SET activo = TRUE WHERE id_periodo = $1 RETURNING nombre',
                [req.params.id]
            );
            await client.query('COMMIT');
            if (r.rows.length === 0) {
                return res.status(404).json({ error: 'Periodo no encontrado.' });
            }
            res.json({ ok: true, mensaje: `Periodo "${r.rows[0].nombre}" activado. Todo el sistema opera ahora sobre este periodo.` });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error al activar periodo:', error.message);
        res.status(500).json({ error: 'No se pudo activar el periodo.' });
    }
});

module.exports = router;
