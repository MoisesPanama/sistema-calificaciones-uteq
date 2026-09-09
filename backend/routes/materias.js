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
            'SELECT id_materia, nombre, descripcion FROM materias ORDER BY nombre'
        );
        res.json({ materias: resultado.rows });
    } catch (error) {
        console.error('Error al listar materias:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el listado de materias.' });
    }
});

// POST /api/materias { nombre, descripcion } -> crea una nueva materia
router.post('/', requireAuth, async (req, res) => {
    const { nombre, descripcion } = req.body || {};
    if (!nombre || String(nombre).trim() === '') {
        return res.status(400).json({ error: 'El nombre de la materia es obligatorio.' });
    }

    try {
        await setUsuarioAuditoria(req.session.usuario.id_usuario);
        const r = await pool.query(
            'INSERT INTO materias (nombre, descripcion) VALUES ($1, $2) RETURNING id_materia',
            [nombre, descripcion || null]
        );
        res.status(201).json({ ok: true, id_materia: r.rows[0].id_materia });
    } catch (error) {
        console.error('Error al crear materia:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe una materia registrada con ese nombre.' });
        }
        res.status(500).json({ error: 'No se pudo guardar la materia.' });
    }
});

module.exports = router;
