// =========================================================
// routes/reportes.js
// Reporte de promedios por periodo (interfaz #9)
// Usa sp_reporte_promedios_periodo (funcion con cursor)
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getPeriodoActivo, getAllPeriodos } = require('../helpers/periodos');

router.get('/reportes', requireAuth, async (req, res) => {
    try {
        const periodos = await getAllPeriodos();
        const periodoActivo = await getPeriodoActivo();

        const idPeriodoSeleccionado = res.locals.periodoSeleccionado || '';
        let reporte = [];
        let mensajeSinDatos = null;

        if (idPeriodoSeleccionado) {
            try {
                const resultado = await pool.query(
                    'SELECT * FROM sp_reporte_promedios_periodo($1)',
                    [idPeriodoSeleccionado]
                );
                reporte = resultado.rows;
            } catch (error) {
                if (error.code === 'P0001') {
                    mensajeSinDatos = 'No hay datos suficientes para generar el reporte: no hay estudiantes matriculados en este periodo.';
                } else {
                    throw error;
                }
            }
        }

        res.render('reportes/index', {
            periodos,
            reporte,
            mensajeSinDatos,
            idPeriodoSeleccionado
        });

    } catch (error) {
        console.error('Error al generar reporte:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo generar el reporte.' });
    }
});

module.exports = router;