// =========================================================
// routes/calificaciones.js
// Registro de calificaciones (usa sp_registrar_calificacion)
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');

// GET /calificaciones/nueva -> formulario de registro
router.get('/calificaciones/nueva', requireAuth, async (req, res) => {
    try {
        const periodos = await pool.query(
            'SELECT id_periodo, nombre FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );
        const materias = await pool.query(
            'SELECT id_materia, nombre FROM materias ORDER BY nombre'
        );
        const tiposEvaluacion = await pool.query(
            'SELECT id_tipo_evaluacion, nombre FROM tipos_evaluacion ORDER BY nombre'
        );

        const idPeriodoSeleccionado = req.query.id_periodo || '';
        let estudiantes = [];

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

        res.render('calificaciones/nueva', {
            periodos: periodos.rows,
            materias: materias.rows,
            tiposEvaluacion: tiposEvaluacion.rows,
            estudiantes,
            idPeriodoSeleccionado,
            errores: []
        });

    } catch (error) {
        console.error('Error al cargar formulario de calificaciones:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar el formulario de calificaciones.' });
    }
});

// POST /calificaciones -> registra una calificacion
router.post('/calificaciones', requireAuth, async (req, res) => {
    const { id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor } = req.body;
    const errores = [];

    if (!id_estudiante) errores.push('Debe seleccionar un estudiante.');
    if (!id_materia) errores.push('Debe seleccionar una materia.');
    if (!id_periodo) errores.push('Debe seleccionar un periodo.');
    if (!id_tipo_evaluacion) errores.push('Debe seleccionar un tipo de evaluacion.');
    if (!valor || valor.trim() === '') errores.push('Debe ingresar una calificacion.');

    if (errores.length === 0 && isNaN(Number(valor))) {
        errores.push('La calificacion debe ser un numero.');
    }

    if (errores.length > 0) {
        return await recargarFormularioConError(req, res, errores, id_periodo);
    }

    try {
        await setUsuarioAuditoria(req.session.usuario.id_usuario);

        await pool.query(
            'CALL sp_registrar_calificacion($1, $2, $3, $4, $5, $6)',
            [id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, req.session.usuario.id_usuario]
        );

        res.redirect('/calificaciones/nueva?id_periodo=' + id_periodo + '&exito=1');

    } catch (error) {
        console.error('Error al registrar calificacion:', error.message);

        // P0001 = codigo generico de RAISE EXCEPTION dentro del procedimiento
        let mensaje = 'No se pudo registrar la calificacion.';
        if (error.code === 'P0001') {
            mensaje = error.message;
        }

        await recargarFormularioConError(req, res, [mensaje], id_periodo);
    }
});

// Funcion auxiliar: vuelve a cargar todos los selects y re-renderiza con errores
async function recargarFormularioConError(req, res, errores, idPeriodoSeleccionado) {
    const periodos = await pool.query(
        'SELECT id_periodo, nombre FROM periodos_academicos ORDER BY fecha_inicio DESC'
    );
    const materias = await pool.query(
        'SELECT id_materia, nombre FROM materias ORDER BY nombre'
    );
    const tiposEvaluacion = await pool.query(
        'SELECT id_tipo_evaluacion, nombre FROM tipos_evaluacion ORDER BY nombre'
    );

    let estudiantes = [];
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

    res.render('calificaciones/nueva', {
        periodos: periodos.rows,
        materias: materias.rows,
        tiposEvaluacion: tiposEvaluacion.rows,
        estudiantes,
        idPeriodoSeleccionado: idPeriodoSeleccionado || '',
        errores
    });
}

module.exports = router;