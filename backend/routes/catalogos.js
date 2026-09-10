// =========================================================
// routes/catalogos.js — datos de apoyo para los selects del
// frontend (periodo activo, cursos por periodo, tipos).
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getPeriodoActivo } = require('../helpers/contexto');

// GET /api/catalogos/periodo-activo
router.get('/periodo-activo', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        res.json({ periodoActivo: periodoActivo || null });
    } catch (error) {
        res.status(500).json({ error: 'No se pudo cargar el periodo activo.' });
    }
});

// GET /api/catalogos/cursos?id_periodo=
router.get('/cursos', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        const idPeriodo = req.query.id_periodo || (periodoActivo && periodoActivo.id_periodo);
        if (!idPeriodo) return res.json({ cursos: [] });
        const r = await pool.query(
            'SELECT id_curso, nombre, paralelo FROM cursos WHERE id_periodo = $1 ORDER BY nombre, paralelo',
            [idPeriodo]
        );
        res.json({ cursos: r.rows });
    } catch (error) {
        res.status(500).json({ error: 'No se pudieron cargar los cursos.' });
    }
});

// GET /api/catalogos/tipos-evaluacion
router.get('/tipos-evaluacion', requireAuth, async (req, res) => {
    try {
        const r = await pool.query(
            'SELECT id_tipo_evaluacion, nombre, peso FROM tipos_evaluacion ORDER BY nombre'
        );
        res.json({ tiposEvaluacion: r.rows });
    } catch (error) {
        res.status(500).json({ error: 'No se pudieron cargar los tipos de evaluacion.' });
    }
});

// GET /api/catalogos/ciclos?id_periodo= -> ciclos del periodo (Fase 5)
router.get('/ciclos', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        const idPeriodo = req.query.id_periodo || (periodoActivo && periodoActivo.id_periodo);
        if (!idPeriodo) return res.json({ ciclos: [] });
        const r = await pool.query(
            `SELECT id_ciclo, nombre, tipo, orden, peso
             FROM ciclos_evaluativos WHERE id_periodo = $1 ORDER BY orden`,
            [idPeriodo]
        );
        res.json({ ciclos: r.rows });
    } catch (error) {
        console.error('Error al cargar ciclos:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los ciclos evaluativos.' });
    }
});

// GET /api/catalogos/parciales?id_ciclo= -> parciales del ciclo (Fase 5)
router.get('/parciales', requireAuth, async (req, res) => {
    try {
        const idCiclo = req.query.id_ciclo || '';
        if (!idCiclo) return res.status(400).json({ error: 'Falta id_ciclo.' });
        const r = await pool.query(
            'SELECT id_parcial, nombre, orden FROM parciales WHERE id_ciclo = $1 ORDER BY orden',
            [idCiclo]
        );
        res.json({ parciales: r.rows });
    } catch (error) {
        console.error('Error al cargar parciales:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los parciales.' });
    }
});

module.exports = router;
