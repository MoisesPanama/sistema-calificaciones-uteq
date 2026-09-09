// =========================================================
// routes/calificaciones.js
// Registro de calificaciones (usa sp_registrar_calificacion)
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');
const { getPeriodoActivo, getAllPeriodos } = require('../helpers/periodos');

// GET /calificaciones/nueva -> formulario de registro
router.get('/calificaciones/nueva', requireAuth, async (req, res) => {
    try {
        const periodos = await getAllPeriodos();
        const periodoActivo = await getPeriodoActivo();

        const idPeriodoSeleccionado = res.locals.periodoSeleccionado || '';

        let materias = [];
        let tiposEvaluacion = [];
        let estudiantes = [];

        if (idPeriodoSeleccionado) {
            // Si es profesor, solo mostrar materias asignadas a el
            let consultaMaterias;
            if (req.session.usuario.nombre_rol === 'profesor') {
                // Obtener el id_profesor del usuario logueado
                const profRes = await pool.query(
                    'SELECT id_profesor FROM profesores WHERE id_usuario = $1',
                    [req.session.usuario.id_usuario]
                );

                if (profRes.rows.length > 0) {
                    consultaMaterias = pool.query(
                        `SELECT DISTINCT m.id_materia, m.nombre
                         FROM materias m
                         JOIN profesor_materia_periodo pmp ON pmp.id_materia = m.id_materia
                         WHERE pmp.id_periodo = $1 AND pmp.id_profesor = $2
                         ORDER BY m.nombre`,
                        [idPeriodoSeleccionado, profRes.rows[0].id_profesor]
                    );
                } else {
                    consultaMaterias = Promise.resolve({ rows: [] });
                }
            } else {
                // Admin ve todas las materias del periodo
                consultaMaterias = pool.query(
                    `SELECT DISTINCT m.id_materia, m.nombre
                     FROM materias m
                     JOIN profesor_materia_periodo pmp ON pmp.id_materia = m.id_materia
                     WHERE pmp.id_periodo = $1
                     ORDER BY m.nombre`,
                    [idPeriodoSeleccionado]
                );
            }

            const [materiasRes, tiposRes] = await Promise.all([
                consultaMaterias,
                pool.query(
                    'SELECT id_tipo_evaluacion, nombre FROM tipos_evaluacion ORDER BY nombre'
                )
            ]);
            materias = materiasRes.rows;
            tiposEvaluacion = tiposRes.rows;

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
            periodos,
            materias,
            tiposEvaluacion,
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

    // Validar que el profesor solo pueda registrar notas en sus materias
    if (errores.length === 0 && req.session.usuario.nombre_rol === 'profesor') {
        const profRes = await pool.query(
            'SELECT id_profesor FROM profesores WHERE id_usuario = $1',
            [req.session.usuario.id_usuario]
        );

        if (profRes.rows.length > 0) {
            const asignacion = await pool.query(
                `SELECT 1 FROM profesor_materia_periodo
                 WHERE id_profesor = $1 AND id_materia = $2 AND id_periodo = $3`,
                [profRes.rows[0].id_profesor, id_materia, id_periodo]
            );

            if (asignacion.rows.length === 0) {
                errores.push('No tiene permiso para registrar calificaciones en esta materia.');
            }
        }
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

        let mensaje = 'No se pudo registrar la calificacion.';
        if (error.code === 'P0001') {
            mensaje = error.message;
        }

        await recargarFormularioConError(req, res, [mensaje], id_periodo);
    }
});

// Funcion auxiliar: vuelve a cargar todos los selects y re-renderiza con errores
async function recargarFormularioConError(req, res, errores, idPeriodoSeleccionado) {
    const periodos = await getAllPeriodos();

    let materias = [];
    let tiposEvaluacion = [];

    if (idPeriodoSeleccionado) {
        const [materiasRes, tiposRes] = await Promise.all([
            pool.query(
                `SELECT DISTINCT m.id_materia, m.nombre
                 FROM materias m
                 JOIN profesor_materia_periodo pmp ON pmp.id_materia = m.id_materia
                 WHERE pmp.id_periodo = $1
                 ORDER BY m.nombre`,
                [idPeriodoSeleccionado]
            ),
            pool.query(
                'SELECT id_tipo_evaluacion, nombre FROM tipos_evaluacion ORDER BY nombre'
            )
        ]);
        materias = materiasRes.rows;
        tiposEvaluacion = tiposRes.rows;
    }

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
        periodos,
        materias,
        tiposEvaluacion,
        estudiantes,
        idPeriodoSeleccionado: idPeriodoSeleccionado || '',
        errores
    });
}

module.exports = router;