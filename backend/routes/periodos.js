// =========================================================
// routes/periodos.js — GET /api/periodos, POST, POST /:id/activar
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole, setUsuarioAuditoria } = require('../middleware/auth');
const { getPeriodoActivo } = require('../helpers/contexto');

// GET /api/periodos -> { periodos, periodoActivo }
router.get('/', requireAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT id_periodo, nombre, fecha_inicio, fecha_fin, activo FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );
        const periodoActivo = await getPeriodoActivo();
        res.json({ periodos: resultado.rows, periodoActivo });
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
        await setUsuarioAuditoria(req.session.usuario.id_usuario);
        const r = await pool.query(
            'INSERT INTO periodos_academicos (nombre, fecha_inicio, fecha_fin) VALUES ($1, $2, $3) RETURNING id_periodo',
            [nombre, fecha_inicio, fecha_fin]
        );
        res.status(201).json({ ok: true, id_periodo: r.rows[0].id_periodo });
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

// POST /api/periodos/:id/activar -> fija el periodo activo (solo admin).
// El trigger trg_solo_un_periodo_activo desactiva los demas.
router.post('/:id/activar', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        await setUsuarioAuditoria(req.session.usuario.id_usuario);
        const r = await pool.query(
            'UPDATE periodos_academicos SET activo = TRUE WHERE id_periodo = $1 RETURNING nombre',
            [req.params.id]
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ error: 'Periodo no encontrado.' });
        }
        res.json({ ok: true, mensaje: `Periodo "${r.rows[0].nombre}" activado. Todo el sistema opera ahora sobre este periodo.` });
    } catch (error) {
        console.error('Error al activar periodo:', error.message);
        res.status(500).json({ error: 'No se pudo activar el periodo.' });
    }
});

module.exports = router;
