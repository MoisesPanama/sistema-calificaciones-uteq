// =========================================================
// routes/psicologo.js — vista de rendimiento para psicologo
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/psicologo/rendimiento — lista de estudiantes con promedio y alertas
router.get('/rendimiento', requireAuth, requireRole('psicologo'), async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT 
                e.id_estudiante,
                e.nombres,
                e.apellidos,
                e.cedula,
                COALESCE(c.nombre, '') AS curso,
                COALESCE(c.paralelo, '') AS paralelo,
                ROUND(AVG(mm.promedio)::numeric, 2) AS promedio_general,
                COUNT(mm.id_detalle) AS materias_inscritas,
                SUM(CASE WHEN mm.promedio < 7 THEN 1 ELSE 0 END) AS materias_bajo_rendimiento,
                SUM(CASE WHEN mm.promedio >= 9 THEN 1 ELSE 0 END) AS materias_excelencia
            FROM estudiantes e
            JOIN matriculas m ON m.id_estudiante = e.id_estudiante
            LEFT JOIN cursos c ON c.id_curso = m.id_curso
            JOIN matricula_materias mm ON mm.id_matricula = m.id_matricula
            WHERE m.id_periodo = (SELECT id_periodo FROM periodos_academicos WHERE activo = TRUE LIMIT 1)
              AND mm.promedio IS NOT NULL
            GROUP BY e.id_estudiante, e.nombres, e.apellidos, e.cedula, c.nombre, c.paralelo
            ORDER BY promedio_general ASC
        `);

        const estudiantes = resultado.rows.map(e => ({
            ...e,
            estado_rendimiento: e.promedio_general < 5 ? 'Critico' :
                               e.promedio_general < 7 ? 'Bajo' :
                               e.promedio_general < 8.5 ? 'Normal' : 'Destacado',
            alerta_bajo_rendimiento: e.materias_bajo_rendimiento > 0,
            mensaje_alerta: e.materias_bajo_rendimiento > 0
                ? `Bajo rendimiento en ${e.materias_bajo_rendimiento} materia(s)`
                : null
        }));

        res.json({ estudiantes });
    } catch (error) {
        console.error('Error al obtener rendimiento:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el rendimiento.' });
    }
});

// GET /api/psicologo/estudiante/:id — detalle de un estudiante
router.get('/estudiante/:id', requireAuth, requireRole('psicologo'), async (req, res) => {
    try {
        const infoBasica = await pool.query(`
            SELECT e.id_estudiante, e.nombres, e.apellidos, e.cedula, e.fecha_nacimiento,
                   r.nombres AS rep_nombres, r.apellidos AS rep_apellidos, r.telefono AS rep_telefono
            FROM estudiantes e
            LEFT JOIN representantes r ON r.id_representante = e.id_representante
            WHERE e.id_estudiante = $1
        `, [req.params.id]);

        if (infoBasica.rows.length === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado.' });
        }

        const materias = await pool.query(`
            SELECT 
                mt.nombre AS materia,
                mm.promedio,
                mm.estado,
                CASE 
                    WHEN mm.promedio < 4 THEN 'En Inicio'
                    WHEN mm.promedio < 7 THEN 'En Proceso'
                    WHEN mm.promedio < 9 THEN 'Logro Esperado'
                    ELSE 'Logro Destacado'
                END AS escala
            FROM matricula_materias mm
            JOIN matriculas m ON m.id_matricula = mm.id_matricula
            JOIN materias mt ON mt.id_materia = mm.id_materia
            WHERE m.id_estudiante = $1
              AND m.id_periodo = (SELECT id_periodo FROM periodos_academicos WHERE activo = TRUE LIMIT 1)
              AND mm.promedio IS NOT NULL
            ORDER BY mm.promedio ASC
        `, [req.params.id]);

        res.json({
            estudiante: infoBasica.rows[0],
            materias: materias.rows
        });
    } catch (error) {
        console.error('Error al obtener detalle del estudiante:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el detalle.' });
    }
});

module.exports = router;
