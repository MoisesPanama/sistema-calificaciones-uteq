// =========================================================
// routes/materias.js — GET /api/materias, POST /api/materias
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');

// GET /api/materias -> listado
router.get('/', requireAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT id_materia, nombre, descripcion, periodos_semanales FROM materias ORDER BY nombre'
        );
        res.json({ materias: resultado.rows });
    } catch (error) {
        console.error('Error al listar materias:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el listado de materias.' });
    }
});

// Periodos pedagogicos semanales (PEI): entero positivo opcional.
function validarPeriodosSemanales(v) {
    if (v === undefined || v === null || v === '') return { ok: true, valor: null };
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return { ok: false };
    return { ok: true, valor: n };
}

// POST /api/materias { nombre, descripcion } -> crea una nueva materia
router.post('/', requireAuth, async (req, res) => {
    const { nombre, descripcion, periodos_semanales } = req.body || {};
    if (!nombre || String(nombre).trim() === '') {
        return res.status(400).json({ error: 'El nombre de la materia es obligatorio.' });
    }
    const ps = validarPeriodosSemanales(periodos_semanales);
    if (!ps.ok) {
        return res.status(400).json({ error: 'Los periodos semanales deben ser un entero mayor que cero.' });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
            const r = await client.query(
                'INSERT INTO materias (nombre, descripcion, periodos_semanales) VALUES ($1, $2, $3) RETURNING id_materia',
                [nombre, descripcion || null, ps.valor]
            );
            await client.query('COMMIT');
            res.status(201).json({ ok: true, id_materia: r.rows[0].id_materia });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error al crear materia:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe una materia registrada con ese nombre.' });
        }
        res.status(500).json({ error: 'No se pudo guardar la materia.' });
    }
});

// POST /api/materias/:id/editar
router.post('/:id/editar', requireAuth, async (req, res) => {
    const { nombre, descripcion, periodos_semanales } = req.body || {};
    if (!nombre || String(nombre).trim() === '') {
        return res.status(400).json({ error: 'El nombre de la materia es obligatorio.' });
    }
    const ps = validarPeriodosSemanales(periodos_semanales);
    if (!ps.ok) {
        return res.status(400).json({ error: 'Los periodos semanales deben ser un entero mayor que cero.' });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
            const r = await client.query(
                'UPDATE materias SET nombre = $1, descripcion = $2, periodos_semanales = $3 WHERE id_materia = $4 RETURNING id_materia',
                [nombre, descripcion || null, ps.valor, req.params.id]
            );
            await client.query('COMMIT');
            if (r.rows.length === 0) {
                return res.status(404).json({ error: 'Materia no encontrada.' });
            }
            res.json({ ok: true, mensaje: 'Materia actualizada correctamente.' });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error al editar materia:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe una materia registrada con ese nombre.' });
        }
        res.status(500).json({ error: 'No se pudo editar la materia.' });
    }
});

module.exports = router;
