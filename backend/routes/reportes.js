// =========================================================
// routes/reportes.js — GET /api/reportes (cursor explicito)
// Usa sp_reporte_promedios_curso_materia + escala oficial.
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
        const idCurso = req.query.id_curso || '';
        const idMateria = req.query.id_materia || '';

        const cursos = await pool.query(
            `SELECT id_curso, nombre, paralelo FROM cursos
             WHERE id_periodo = $1 ORDER BY nombre, paralelo`,
            [idPeriodo]
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
                    idPeriodo,
                    idCurso === '' ? null : Number(idCurso),
                    idMateria === '' ? null : Number(idMateria)
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

        res.json({
            periodoActivo,
            periodos: periodos.rows,
            cursos: cursos.rows,
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
