// =========================================================
// routes/consulta.js
// Consulta de calificaciones por estudiante (interfaz #7)
// Usa fn_promedio_materia y fn_promedio_general
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

router.get('/calificaciones/consulta', requireAuth, async (req, res) => {
    try {
        const periodos = await pool.query(
            'SELECT id_periodo, nombre FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );

        const idPeriodoSeleccionado = req.query.id_periodo || '';
        const idEstudianteSeleccionado = req.query.id_estudiante || '';

        let estudiantes = [];
        let materias = [];
        let promedioGeneral = null;
        let mensajeSinNotas = null;

        // Si hay periodo elegido, cargar solo estudiantes matriculados ahi
        if (idPeriodoSeleccionado) {
            const resultadoEst = await pool.query(
                `SELECT e.id_estudiante, e.nombres, e.apellidos
                 FROM matriculas m
                 JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
                 WHERE m.id_periodo = $1
                 ORDER BY e.apellidos, e.nombres`,
                [idPeriodoSeleccionado]
            );
            estudiantes = resultadoEst.rows;
        }

        // Si ademas hay estudiante elegido, armar el reporte de notas
        if (idPeriodoSeleccionado && idEstudianteSeleccionado) {
            const resultadoNotas = await pool.query(
                `SELECT c.id_materia, mat.nombre AS materia,
                        te.nombre AS tipo_evaluacion, c.valor
                 FROM calificaciones c
                 JOIN materias mat ON mat.id_materia = c.id_materia
                 JOIN tipos_evaluacion te ON te.id_tipo_evaluacion = c.id_tipo_evaluacion
                 WHERE c.id_estudiante = $1 AND c.id_periodo = $2
                 ORDER BY mat.nombre, te.nombre`,
                [idEstudianteSeleccionado, idPeriodoSeleccionado]
            );

            // Agrupar las notas por materia en memoria (JS)
            const materiasMap = new Map();
            resultadoNotas.rows.forEach(function(fila) {
                if (!materiasMap.has(fila.id_materia)) {
                    materiasMap.set(fila.id_materia, {
                        id_materia: fila.id_materia,
                        nombre: fila.materia,
                        parciales: [],
                        promedio: null
                    });
                }
                materiasMap.get(fila.id_materia).parciales.push({
                    tipo: fila.tipo_evaluacion,
                    valor: fila.valor
                });
            });
            materias = Array.from(materiasMap.values());

            // Promedio por materia, usando fn_promedio_materia
            for (const materia of materias) {
                const resultadoProm = await pool.query(
                    'SELECT fn_promedio_materia($1, $2, $3) AS promedio',
                    [idEstudianteSeleccionado, materia.id_materia, idPeriodoSeleccionado]
                );
                materia.promedio = resultadoProm.rows[0].promedio;
            }

            // Promedio general, usando fn_promedio_general
            // Puede lanzar excepcion si el estudiante no tiene NINGUNA nota en el periodo
            try {
                const resultadoGeneral = await pool.query(
                    'SELECT fn_promedio_general($1, $2) AS promedio',
                    [idEstudianteSeleccionado, idPeriodoSeleccionado]
                );
                promedioGeneral = resultadoGeneral.rows[0].promedio;
            } catch (error) {
                if (error.code === 'P0001') {
                    mensajeSinNotas = 'Este estudiante no tiene calificaciones registradas en este periodo.';
                } else {
                    throw error;
                }
            }
        }

        res.render('calificaciones/consulta', {
            periodos: periodos.rows,
            estudiantes,
            materias,
            promedioGeneral,
            mensajeSinNotas,
            idPeriodoSeleccionado,
            idEstudianteSeleccionado
        });

    } catch (error) {
        console.error('Error en consulta de calificaciones:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar la consulta de calificaciones.' });
    }
});

module.exports = router;