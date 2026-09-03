// =========================================================
// routes/reportes.js
// Reporte de promedios del PERIODO ACTIVO (fijo), filtrable
// por curso y materia. Usa sp_reporte_promedios_curso_materia
// (funcion con CURSOR explicito) + escala oficial.
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getPeriodoActivo } = require('../helpers/contexto');

router.get('/reportes', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        if (!periodoActivo) {
            return res.status(500).render('error', { mensaje: 'No hay periodos registrados.' });
        }

        const periodos = await pool.query(
            'SELECT id_periodo, nombre FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );

        const idPeriodoSeleccionado = req.query.id_periodo || String(periodoActivo.id_periodo);
        const idCursoSeleccionado = req.query.id_curso || '';
        const idMateriaSeleccionada = req.query.id_materia || '';

        const cursos = await pool.query(
            `SELECT id_curso, nombre, paralelo FROM cursos
             WHERE id_periodo = $1 ORDER BY nombre, paralelo`,
            [idPeriodoSeleccionado]
        );
        const materias = await pool.query(
            'SELECT id_materia, nombre FROM materias ORDER BY nombre'
        );

        let reporte = [];
        let mensajeSinDatos = null;

        try {
            const resultado = await pool.query(
                'SELECT * FROM sp_reporte_promedios_curso_materia($1, $2, $3)',
                [
                    idPeriodoSeleccionado,
                    idCursoSeleccionado === '' ? null : Number(idCursoSeleccionado),
                    idMateriaSeleccionada === '' ? null : Number(idMateriaSeleccionada)
                ]
            );
            reporte = resultado.rows;
        } catch (error) {
            if (error.code === 'P0001') {
                mensajeSinDatos = 'No hay datos suficientes para generar el reporte: no hay estudiantes matriculados en este periodo con esos filtros.';
            } else {
                throw error;
            }
        }

        res.render('reportes/index', {
            periodoActivo,
            periodos: periodos.rows,
            cursos: cursos.rows,
            materias: materias.rows,
            reporte,
            mensajeSinDatos,
            idPeriodoSeleccionado,
            idCursoSeleccionado: String(idCursoSeleccionado || ''),
            idMateriaSeleccionada: String(idMateriaSeleccionada || '')
        });

    } catch (error) {
        console.error('Error al generar reporte:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo generar el reporte.' });
    }
});

module.exports = router;
