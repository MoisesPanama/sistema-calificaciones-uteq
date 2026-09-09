// =========================================================
// routes/psicologo.js — vista de rendimiento para psicologo
// Muestra promedios por QUIMESTRE (todos los periodos)
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/psicologo/rendimiento — estudiantes con promedio por quimestre
router.get('/rendimiento', requireAuth, requireRole('psicologo'), async (req, res) => {
    try {
        // Obtener todos los periodos
        const periodosRes = await pool.query(
            'SELECT id_periodo, nombre FROM periodos_academicos ORDER BY fecha_inicio'
        );
        const periodos = periodosRes.rows;

        // Obtener estudiantes con sus promedios por materia y periodo
        const resultado = await pool.query(`
            SELECT 
                e.id_estudiante,
                e.nombres,
                e.apellidos,
                e.cedula,
                pa.id_periodo,
                pa.nombre AS periodo_nombre,
                mt.nombre AS materia,
                mm.promedio,
                mm.estado
            FROM estudiantes e
            JOIN matriculas m ON m.id_estudiante = e.id_estudiante
            JOIN matricula_materias mm ON mm.id_matricula = m.id_matricula
            JOIN materias mt ON mt.id_materia = mm.id_materia
            JOIN periodos_academicos pa ON pa.id_periodo = m.id_periodo
            WHERE mm.promedio IS NOT NULL
            ORDER BY e.apellidos, e.nombres, pa.fecha_inicio, mt.nombre
        `);

        // Agrupar por estudiante
        const mapaEstudiantes = new Map();
        for (const row of resultado.rows) {
            const key = row.id_estudiante;
            if (!mapaEstudiantes.has(key)) {
                mapaEstudiantes.set(key, {
                    id_estudiante: row.id_estudiante,
                    nombres: row.nombres,
                    apellidos: row.apellidos,
                    cedula: row.cedula,
                    quimestres: {}
                });
            }
            const est = mapaEstudiantes.get(key);
            if (!est.quimestres[row.id_periodo]) {
                est.quimestres[row.id_periodo] = {
                    nombre: row.periodo_nombre,
                    materias: [],
                    promedio: null
                };
            }
            est.quimestres[row.id_periodo].materias.push({
                materia: row.materia,
                promedio: row.promedio,
                estado: row.estado
            });
        }

        // Calcular promedio general por quimestre
        const estudiantes = [];
        for (const est of mapaEstudiantes.values()) {
            const逐 = [];
            for (const [idPeriodo, datos] of Object.entries(est.quimestres)) {
                const suma = datos.materias.reduce((s, m) => s + Number(m.promedio), 0);
                datos.promedio = Math.round((suma / datos.materias.length) * 100) / 100;
                const bajo = datos.materias.filter(m => m.promedio < 7).length;
                datos.bajo_rendimiento = bajo;
                datos.alerta = bajo > 0 ? `Bajo rendimiento en ${bajo} materia(s)` : null;
            }
            // Calcular promedio general (promedio de los quimestres)
            const vals = Object.values(est.quimestres).map(q => q.promedio);
            const promedioGeneral = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;

            estudiantes.push({
                ...est,
                promedio_general: promedioGeneral,
                estado_rendimiento: promedioGeneral < 5 ? 'Critico' :
                                   promedioGeneral < 7 ? 'Bajo' :
                                   promedioGeneral < 8.5 ? 'Normal' : 'Destacado'
            });
        }

        // Ordenar por promedio general ascendente
        estudiantes.sort((a, b) => (a.promedio_general || 0) - (b.promedio_general || 0));

        res.json({ periodos, estudiantes });
    } catch (error) {
        console.error('Error al obtener rendimiento:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el rendimiento: ' + error.message });
    }
});

// GET /api/psicologo/estudiante/:id — detalle de un estudiante por quimestre
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
                pa.nombre AS periodo,
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
            JOIN periodos_academicos pa ON pa.id_periodo = m.id_periodo
            WHERE m.id_estudiante = $1
              AND mm.promedio IS NOT NULL
            ORDER BY pa.fecha_inicio, mt.nombre
        `, [req.params.id]);

        res.json({
            estudiante: infoBasica.rows[0],
            materias: materias.rows
        });
    } catch (error) {
        console.error('Error al obtener detalle del estudiante:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el detalle: ' + error.message });
    }
});

module.exports = router;
