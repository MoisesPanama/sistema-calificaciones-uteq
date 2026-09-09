// =========================================================
// routes/reportes.js — GET /api/reportes
// Promedios por estudiante en el periodo, con filtros
// opcionales de curso y materia.
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getPeriodoActivo } = require('../helpers/contexto');

function evaluarEscala(nota) {
    if (nota == null) return 'S/N';
    if (nota >= 9.0) return 'AD';
    if (nota >= 7.0) return 'A';
    if (nota >= 5.0) return 'B';
    if (nota >= 3.0) return 'C';
    return 'D';
}

router.get('/', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        if (!periodoActivo) {
            return res.status(500).json({ error: 'No hay periodos registrados.' });
        }

        const periodos = await pool.query(
            'SELECT id_periodo, nombre FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );

        const idPeriodo = req.query.id_periodo || req.session.periodoSeleccionado || String(periodoActivo.id_periodo);
        const idCurso = req.query.id_curso || '';
        const idMateria = req.query.id_materia || '';

        let cursos = [];
        try {
            const rCursos = await pool.query(
                `SELECT id_curso, nombre, paralelo FROM cursos
                 WHERE id_periodo = $1 ORDER BY nombre, paralelo`,
                [idPeriodo]
            );
            cursos = rCursos.rows;
        } catch (_) { /* cursos table may not exist yet */ }

        const materias = await pool.query(
            'SELECT id_materia, nombre FROM materias ORDER BY nombre'
        );

        let reporte = [];
        let mensajeSinDatos = null;

        try {
            let sqlEst = `SELECT e.id_estudiante, e.nombres, e.apellidos
                          FROM matriculas m
                          JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
                          WHERE m.id_periodo = $1`;
            const paramsEst = [idPeriodo];
            if (idCurso) {
                sqlEst += ' AND m.id_curso = $2';
                paramsEst.push(idCurso);
            }
            sqlEst += ' ORDER BY e.apellidos, e.nombres';
            const rEst = await pool.query(sqlEst, paramsEst);

            if (rEst.rows.length === 0) {
                mensajeSinDatos = 'No hay estudiantes matriculados en este periodo con esos filtros.';
            } else {
                for (const est of rEst.rows) {
                    let sqlProm = '';
                    let paramsProm = [];
                    if (idMateria) {
                        sqlProm = `SELECT ROUND(SUM(c.valor * te.peso) / NULLIF(SUM(te.peso), 0), 2) AS promedio
                                   FROM calificaciones c
                                   JOIN tipos_evaluacion te ON te.id_tipo_evaluacion = c.id_tipo_evaluacion
                                   WHERE c.id_estudiante = $1 AND c.id_periodo = $2 AND c.id_materia = $3`;
                        paramsProm = [est.id_estudiante, idPeriodo, idMateria];
                    } else {
                        sqlProm = `SELECT ROUND(
                            SUM(c.valor * te.peso) / NULLIF(SUM(te.peso), 0), 2
                           ) AS promedio
                           FROM calificaciones c
                           JOIN tipos_evaluacion te ON te.id_tipo_evaluacion = c.id_tipo_evaluacion
                           WHERE c.id_estudiante = $1 AND c.id_periodo = $2`;
                        paramsProm = [est.id_estudiante, idPeriodo];
                    }
                    const rProm = await pool.query(sqlProm, paramsProm);
                    const promedio = rProm.rows[0]?.promedio;
                    reporte.push({
                        id_estudiante: est.id_estudiante,
                        nombres: est.nombres,
                        apellidos: est.apellidos,
                        promedio: promedio,
                        escala: evaluarEscala(promedio)
                    });
                }
            }
        } catch (error) {
            mensajeSinDatos = 'No hay datos suficientes para generar el reporte.';
        }

        res.json({
            periodoActivo,
            periodos: periodos.rows,
            cursos,
            materias: materias.rows,
            reporte,
            mensajeSinDatos,
            idPeriodo: String(idPeriodo),
            idCurso: String(idCurso || ''),
            idMateria: String(idMateria || '')
        });
    } catch (error) {
        console.error('Error al generar reporte:', error.message);
        res.status(500).json({ error: 'No se pudo generar el reporte.' });
    }
});

module.exports = router;
