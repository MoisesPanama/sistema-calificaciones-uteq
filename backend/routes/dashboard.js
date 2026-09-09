// =========================================================
// routes/dashboard.js — GET /api/dashboard (resumen general)
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
    try {
        const [estudiantes, materias, periodos, calificaciones] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM estudiantes WHERE activo = TRUE'),
            pool.query('SELECT COUNT(*) FROM materias'),
            pool.query('SELECT COUNT(*) FROM periodos_academicos'),
            pool.query('SELECT COUNT(*) FROM calificaciones')
        ]);

        res.json({
            totalEstudiantes: Number(estudiantes.rows[0].count),
            totalMaterias: Number(materias.rows[0].count),
            totalPeriodos: Number(periodos.rows[0].count),
            totalCalificaciones: Number(calificaciones.rows[0].count)
        });

    } catch (error) {
        console.error('Error en dashboard:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el resumen del sistema.' });
    }
});

module.exports = router;
