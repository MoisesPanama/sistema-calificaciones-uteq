// =========================================================
// routes/consulta.js
// Consulta de calificaciones por estudiante en el PERIODO
// ACTIVO (fijo), con desglose por materia + PROMEDIO DE LA
// MATERIA EN ESPECIFICO (no solo el general) y escala oficial.
// Usa fn_promedio_materia y fn_promedio_general.
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getPeriodoActivo } = require('../helpers/contexto');

router.get('/calificaciones/consulta', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        if (!periodoActivo) {
            return res.status(500).render('error', { mensaje: 'No hay periodos registrados.' });
        }

        const periodos = await pool.query(
            'SELECT id_periodo, nombre FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );

        // Por defecto: periodo fijo = activo
        const idPeriodoSeleccionado = req.query.id_periodo || String(periodoActivo.id_periodo);
        const idEstudianteSeleccionado = req.query.id_estudiante || '';
        const idMateriaSeleccionada = req.query.id_materia || '';

        let estudiantes = [];
        let materias = [];
        let promedioGeneral = null;
        let promedioMateriaSel = null;
        let escalaMateriaSel = null;
        let mensajeSinNotas = null;

        // Estudiantes matriculados en el periodo
        const resultadoEst = await pool.query(
            `SELECT e.id_estudiante, e.nombres, e.apellidos
             FROM matriculas m
             JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
             WHERE m.id_periodo = $1
             ORDER BY e.apellidos, e.nombres`,
            [idPeriodoSeleccionado]
        );
        estudiantes = resultadoEst.rows;

        // Materias con notas del estudiante (para el filtro)
        let materiasFiltro = [];
        if (idEstudianteSeleccionado) {
            const rMat = await pool.query(
                `SELECT DISTINCT mat.id_materia, mat.nombre
                 FROM calificaciones c
                 JOIN materias mat ON mat.id_materia = c.id_materia
                 WHERE c.id_estudiante = $1 AND c.id_periodo = $2
                 ORDER BY mat.nombre`,
                [idEstudianteSeleccionado, idPeriodoSeleccionado]
            );
            materiasFiltro = rMat.rows;
        }

        // Reporte de notas del estudiante
        if (idEstudianteSeleccionado) {
            let sqlNotas = `SELECT c.id_materia, mat.nombre AS materia,
                                   te.nombre AS tipo_evaluacion, c.valor
                            FROM calificaciones c
                            JOIN materias mat ON mat.id_materia = c.id_materia
                            JOIN tipos_evaluacion te ON te.id_tipo_evaluacion = c.id_tipo_evaluacion
                            WHERE c.id_estudiante = $1 AND c.id_periodo = $2`;
            const params = [idEstudianteSeleccionado, idPeriodoSeleccionado];
            if (idMateriaSeleccionada) {
                sqlNotas += ' AND c.id_materia = $3';
                params.push(idMateriaSeleccionada);
            }
            sqlNotas += ' ORDER BY mat.nombre, te.nombre';

            const resultadoNotas = await pool.query(sqlNotas, params);

            // Agrupar las notas por materia en memoria (JS)
            const materiasMap = new Map();
            resultadoNotas.rows.forEach(function(fila) {
                if (!materiasMap.has(fila.id_materia)) {
                    materiasMap.set(fila.id_materia, {
                        id_materia: fila.id_materia,
                        nombre: fila.materia,
                        parciales: [],
                        promedio: null,
                        escala: null
                    });
                }
                materiasMap.get(fila.id_materia).parciales.push({
                    tipo: fila.tipo_evaluacion,
                    valor: fila.valor
                });
            });
            materias = Array.from(materiasMap.values());

            // Promedio por materia (ESPECIFICA, no solo general)
            for (const materia of materias) {
                const resultadoProm = await pool.query(
                    'SELECT fn_promedio_materia($1, $2, $3) AS promedio',
                    [idEstudianteSeleccionado, materia.id_materia, idPeriodoSeleccionado]
                );
                materia.promedio = resultadoProm.rows[0].promedio;
                const rEsc = await pool.query(
                    'SELECT fn_escala_cualitativa($1) AS escala',
                    [materia.promedio]
                );
                materia.escala = rEsc.rows[0].escala;

                if (String(materia.id_materia) === String(idMateriaSeleccionada)) {
                    promedioMateriaSel = materia.promedio;
                    escalaMateriaSel = materia.escala;
                }
            }

            // Promedio general del periodo
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
            periodoActivo,
            periodos: periodos.rows,
            estudiantes,
            materiasFiltro,
            materias,
            promedioGeneral,
            promedioMateriaSel,
            escalaMateriaSel,
            mensajeSinNotas,
            idPeriodoSeleccionado,
            idEstudianteSeleccionado,
            idMateriaSeleccionada: String(idMateriaSeleccionada || '')
        });

    } catch (error) {
        console.error('Error en consulta de calificaciones:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar la consulta de calificaciones.' });
    }
});

module.exports = router;
