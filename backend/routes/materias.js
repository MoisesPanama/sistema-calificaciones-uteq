// =========================================================
// routes/materias.js
// Listado y creacion de materias
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');

// GET /materias -> listado
router.get('/materias', requireAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT id_materia, nombre, descripcion FROM materias ORDER BY nombre'
        );

        res.render('materias/index', {
            materias: resultado.rows,
            errores: []
        });

    } catch (error) {
        console.error('Error al listar materias:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar el listado de materias.' });
    }
});

// POST /materias -> crea una nueva materia
router.post('/materias', requireAuth, async (req, res) => {
    const { nombre, descripcion } = req.body;
    const errores = [];

    if (!nombre || nombre.trim() === '') {
        errores.push('El nombre de la materia es obligatorio.');
    }

    if (errores.length > 0) {
        const resultado = await pool.query(
            'SELECT id_materia, nombre, descripcion FROM materias ORDER BY nombre'
        );
        return res.render('materias/index', {
            materias: resultado.rows,
            errores
        });
    }

    try {
        await setUsuarioAuditoria(req.session.usuario.id_usuario);

        await pool.query(
            'INSERT INTO materias (nombre, descripcion) VALUES ($1, $2)',
            [nombre, descripcion || null]
        );

        res.redirect('/materias');

    } catch (error) {
        console.error('Error al crear materia:', error.message);

        let mensaje = 'No se pudo guardar la materia.';
        if (error.code === '23505') {
            mensaje = 'Ya existe una materia registrada con ese nombre.';
        }

        const resultado = await pool.query(
            'SELECT id_materia, nombre, descripcion FROM materias ORDER BY nombre'
        );
        res.render('materias/index', {
            materias: resultado.rows,
            errores: [mensaje]
        });
    }
});

module.exports = router;