// =========================================================
// routes/consulta.js — GET /api/consulta (notas por estudiante)
// Usa fn_promedio_materia y fn_promedio_general.
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getPeriodoActivo } = require('../helpers/contexto');

router.get('/', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        if (!periodoActivo) {
            return res.status(500).json({ error: 'No hay periodos registrados.' });
        }

        const periodos = await pool.query(
            'SELECT id_periodo, nombre FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );

        const idPeriodo = req.query.id_periodo || String(periodoActivo.id_periodo);
        const idEstudiante = req.query.id_estudiante || '';
        const idMateria = req.query.id_materia || '';

        const resultadoEst = await pool.query(
            `SELECT e.id_estudiante, e.nombres, e.apellidos
             FROM matriculas m
             JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
             WHERE m.id_periodo = $1
             ORDER BY e.apellidos, e.nombres`,
            [idPeriodo]
        );

        let materiasFiltro = [];
        let materias = [];
        let promedioGeneral = null;
        let promedioMateriaSel = null;
        let escalaMateriaSel = null;
        let mensajeSinNotas = null;

        if (idEstudiante) {
            const rMat = await pool.query(
                `SELECT DISTINCT mat.id_materia, mat.nombre
                 FROM calificaciones c
                 JOIN materias mat ON mat.id_materia = c.id_materia
                 WHERE c.id_estudiante = $1 AND c.id_periodo = $2
                 ORDER BY mat.nombre`,
                [idEstudiante, idPeriodo]
            );
            materiasFiltro = rMat.rows;

            let sqlNotas = `SELECT c.id_materia, mat.nombre AS materia,
                                   te.nombre AS tipo_evaluacion, c.valor
                            FROM calificaciones c
                            JOIN materias mat ON mat.id_materia = c.id_materia
                            JOIN tipos_evaluacion te ON te.id_tipo_evaluacion = c.id_tipo_evaluacion
                            WHERE c.id_estudiante = $1 AND c.id_periodo = $2`;
            const params = [idEstudiante, idPeriodo];
            if (idMateria) {
                sqlNotas += ' AND c.id_materia = $3';
                params.push(idMateria);
            }
            sqlNotas += ' ORDER BY mat.nombre, te.nombre';
            const resultadoNotas = await pool.query(sqlNotas, params);

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

            for (const materia of materias) {
                const resultadoProm = await pool.query(
                    'SELECT fn_promedio_materia($1, $2, $3) AS promedio',
                    [idEstudiante, materia.id_materia, idPeriodo]
                );
                materia.promedio = resultadoProm.rows[0].promedio;
                const rEsc = await pool.query(
                    'SELECT fn_escala_cualitativa($1) AS escala',
                    [materia.promedio]
                );
                materia.escala = rEsc.rows[0].escala;
                if (String(materia.id_materia) === String(idMateria)) {
                    promedioMateriaSel = materia.promedio;
                    escalaMateriaSel = materia.escala;
                }
            }

            try {
                const resultadoGeneral = await pool.query(
                    'SELECT fn_promedio_general($1, $2) AS promedio',
                    [idEstudiante, idPeriodo]
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

        res.json({
            periodoActivo,
            periodos: periodos.rows,
            estudiantes: resultadoEst.rows,
            materiasFiltro,
            materias,
            promedioGeneral,
            promedioMateriaSel,
            escalaMateriaSel,
            mensajeSinNotas,
            idPeriodo: String(idPeriodo),
            idEstudiante: String(idEstudiante || ''),
            idMateria: String(idMateria || '')
        });
    } catch (error) {
        console.error('Error en consulta de calificaciones:', error.message);
        res.status(500).json({ error: 'No se pudo cargar la consulta de calificaciones.' });
    }
});

module.exports = router;
