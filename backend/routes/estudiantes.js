// =========================================================
// routes/estudiantes.js
// Listado, busqueda, creacion y edicion de estudiantes
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');

// GET /estudiantes -> listado con buscador
router.get('/estudiantes', requireAuth, async (req, res) => {
    try {
        const busqueda = req.query.q || '';

        const resultado = await pool.query(
            `SELECT e.id_estudiante, e.cedula, e.nombres, e.apellidos,
                    e.fecha_nacimiento, e.activo,
                    r.nombres AS rep_nombres, r.apellidos AS rep_apellidos
             FROM estudiantes e
             JOIN representantes r ON r.id_representante = e.id_representante
             WHERE (e.nombres ILIKE $1 OR e.apellidos ILIKE $1 OR e.cedula ILIKE $1)
             ORDER BY e.apellidos, e.nombres`,
            [`%${busqueda}%`]
        );

        res.render('estudiantes/list', {
            estudiantes: resultado.rows,
            busqueda
        });

    } catch (error) {
        console.error('Error al listar estudiantes:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar el listado de estudiantes.' });
    }
});

module.exports = router;