// =========================================================
// routes/tipos_evaluacion.js
// CRUD de tipos de evaluacion (maestro de datos)
// Solo administrador puede gestionar
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /tipos-evaluacion -> listado
router.get('/tipos-evaluacion', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT id_tipo_evaluacion, nombre, peso FROM tipos_evaluacion ORDER BY id_tipo_evaluacion'
        );

        res.render('tipos_evaluacion/index', {
            tiposEvaluacion: resultado.rows,
            errores: []
        });

    } catch (error) {
        console.error('Error al listar tipos de evaluacion:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar el listado de tipos de evaluacion.' });
    }
});

// POST /tipos-evaluacion -> crea un nuevo tipo
router.post('/tipos-evaluacion', requireAuth, requireRole('administrador'), async (req, res) => {
    const { nombre, peso } = req.body;
    const errores = [];

    if (!nombre || nombre.trim() === '') {
        errores.push('El nombre del tipo de evaluacion es obligatorio.');
    }
    if (!peso || isNaN(Number(peso))) {
        errores.push('El peso debe ser un numero.');
    } else {
        const pesoNum = Number(peso);
        if (pesoNum <= 0 || pesoNum > 1) {
            errores.push('El peso debe estar entre 0.01 y 1.00.');
        }
    }

    if (errores.length > 0) {
        const resultado = await pool.query(
            'SELECT id_tipo_evaluacion, nombre, peso FROM tipos_evaluacion ORDER BY id_tipo_evaluacion'
        );
        return res.render('tipos_evaluacion/index', {
            tiposEvaluacion: resultado.rows,
            errores
        });
    }

    try {
        await pool.query(
            'INSERT INTO tipos_evaluacion (nombre, peso) VALUES ($1, $2)',
            [nombre.trim(), Number(peso)]
        );

        res.redirect('/tipos-evaluacion');

    } catch (error) {
        console.error('Error al crear tipo de evaluacion:', error.message);

        let mensaje = 'No se pudo guardar el tipo de evaluacion.';
        if (error.code === '23505') {
            mensaje = 'Ya existe un tipo de evaluacion con ese nombre.';
        }

        const resultado = await pool.query(
            'SELECT id_tipo_evaluacion, nombre, peso FROM tipos_evaluacion ORDER BY id_tipo_evaluacion'
        );
        res.render('tipos_evaluacion/index', {
            tiposEvaluacion: resultado.rows,
            errores: [mensaje]
        });
    }
});

// POST /tipos-evaluacion/:id/eliminar -> elimina un tipo
router.post('/tipos-evaluacion/:id/eliminar', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM tipos_evaluacion WHERE id_tipo_evaluacion = $1',
            [req.params.id]
        );
        res.redirect('/tipos-evaluacion');

    } catch (error) {
        console.error('Error al eliminar tipo de evaluacion:', error.message);

        let mensaje = 'No se pudo eliminar el tipo de evaluacion.';
        if (error.code === '23503') {
            mensaje = 'No se puede eliminar: existen calificaciones que usan este tipo de evaluacion.';
        }

        const resultado = await pool.query(
            'SELECT id_tipo_evaluacion, nombre, peso FROM tipos_evaluacion ORDER BY id_tipo_evaluacion'
        );
        res.render('tipos_evaluacion/index', {
            tiposEvaluacion: resultado.rows,
            errores: [mensaje]
        });
    }
});

module.exports = router;
