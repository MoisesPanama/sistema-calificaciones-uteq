// =========================================================
// routes/dashboard.js
// Pantalla de inicio con resumen general del sistema
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

router.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const [estudiantes, materias, periodos, calificaciones] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM estudiantes WHERE activo = TRUE'),
            pool.query('SELECT COUNT(*) FROM materias'),
            pool.query('SELECT COUNT(*) FROM periodos_academicos'),
            pool.query('SELECT COUNT(*) FROM calificaciones')
        ]);

        res.render('dashboard', {
            totalEstudiantes: estudiantes.rows[0].count,
            totalMaterias: materias.rows[0].count,
            totalPeriodos: periodos.rows[0].count,
            totalCalificaciones: calificaciones.rows[0].count
        });

    } catch (error) {
        console.error('Error en dashboard:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar el resumen del sistema.' });
    }
});

module.exports = router;