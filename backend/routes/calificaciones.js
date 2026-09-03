// =========================================================
// routes/calificaciones.js
// Registro de calificaciones sobre el PERIODO ACTIVO (fijo).
// - Profesor: solo ve y califica SUS materias/cursos
//   asignados (profesor_materia_periodo).
// - Al elegir materia + curso se cargan TODOS los
//   estudiantes matriculados en tabla masiva (un submit).
// - Usa sp_registrar_calificacion (upsert + validaciones).
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');
const {
    getPeriodoActivo,
    getMateriasPermitidas,
    getCursosPermitidos
} = require('../helpers/contexto');

// GET /calificaciones/nueva -> tabla masiva por materia+curso
router.get('/calificaciones/nueva', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        if (!periodoActivo) {
            return res.status(500).render('error', { mensaje: 'No hay periodos registrados. Cree y active uno primero.' });
        }

        // Periodo fijo = activo. Admin puede consultar historicos
        // pasando ?id_periodo=; el resto siempre usa el activo.
        const idPeriodo = req.query.id_periodo || periodoActivo.id_periodo;

        const materias = await getMateriasPermitidas(pool, req.session.usuario, idPeriodo);
        const cursos = await getCursosPermitidos(pool, req.session.usuario, idPeriodo);
        const tiposRes = await pool.query(
            `SELECT id_tipo_evaluacion, nombre, categoria, es_examen
             FROM tipos_evaluacion ORDER BY nombre`
        );

        const idMateria = req.query.id_materia || '';
        const idCurso = req.query.id_curso || '';
        const exito = req.query.exito || null;

        let estudiantes = [];
        let notasExistentes = {};
        let periodoNombre = periodoActivo.nombre;
        if (String(idPeriodo) !== String(periodoActivo.id_periodo)) {
            const rp = await pool.query(
                'SELECT nombre FROM periodos_academicos WHERE id_periodo = $1',
                [idPeriodo]
            );
            if (rp.rows.length > 0) periodoNombre = rp.rows[0].nombre;
        }

        // Con materia + curso elegidos: cargar TODOS los estudiantes
        // matriculados (del curso si se filtra) + sus notas actuales.
        if (idMateria) {
            let sqlEst = `SELECT e.id_estudiante, e.nombres, e.apellidos,
                                 m.id_curso, c.nombre AS curso_nombre, c.paralelo
                          FROM matriculas m
                          JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
                          LEFT JOIN cursos c ON c.id_curso = m.id_curso
                          WHERE m.id_periodo = $1`;
            const params = [idPeriodo];
            if (idCurso) {
                sqlEst += ' AND m.id_curso = $2';
                params.push(idCurso);
            }
            sqlEst += ' ORDER BY e.apellidos, e.nombres';
            const rEst = await pool.query(sqlEst, params);
            estudiantes = rEst.rows;

            if (estudiantes.length > 0) {
                const ids = estudiantes.map((e) => e.id_estudiante);
                const rNotas = await pool.query(
                    `SELECT id_estudiante, id_tipo_evaluacion, valor
                     FROM calificaciones
                     WHERE id_periodo = $1 AND id_materia = $2
                       AND id_estudiante = ANY($3)`,
                    [idPeriodo, idMateria, ids]
                );
                rNotas.rows.forEach((n) => {
                    if (!notasExistentes[n.id_estudiante]) notasExistentes[n.id_estudiante] = {};
                    notasExistentes[n.id_estudiante][n.id_tipo_evaluacion] = n.valor;
                });
            }
        }

        res.render('calificaciones/nueva', {
            periodoActivo,
            idPeriodoSeleccionado: String(idPeriodo),
            periodoNombre,
            materias,
            cursos,
            tiposEvaluacion: tiposRes.rows,
            estudiantes,
            notasExistentes,
            idMateriaSeleccionada: String(idMateria || ''),
            idCursoSeleccionado: String(idCurso || ''),
            exito,
            errores: []
        });

    } catch (error) {
        console.error('Error al cargar formulario de calificaciones:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar el formulario de calificaciones.' });
    }
});

// POST /calificaciones/lote -> guarda la tabla masiva completa
// en una transaccion (todas o ninguna).
router.post('/calificaciones/lote', requireAuth, async (req, res) => {
    const { id_periodo, id_materia, notas } = req.body;
    const errores = [];

    if (!id_periodo) errores.push('Falta el periodo.');
    if (!id_materia) errores.push('Debe seleccionar una materia.');

    // Verificar que la materia sea permitida para este usuario
    let materiasPermitidas = [];
    if (id_periodo) {
        materiasPermitidas = await getMateriasPermitidas(pool, req.session.usuario, id_periodo);
        if (id_materia && !materiasPermitidas.some((m) => String(m.id_materia) === String(id_materia))) {
            errores.push('No tiene asignada esta materia en el periodo: no puede registrar estas notas.');
        }
    }

    const entradas = [];
    if (notas && typeof notas === 'object') {
        Object.keys(notas).forEach((idEst) => {
            const porTipo = notas[idEst];
            if (porTipo && typeof porTipo === 'object') {
                Object.keys(porTipo).forEach((idTipo) => {
                    const crudo = String(porTipo[idTipo] == null ? '' : porTipo[idTipo]).trim();
                    if (crudo !== '') entradas.push({ idEst, idTipo, crudo });
                });
            }
        });
    }
    if (entradas.length === 0 && errores.length === 0) {
        errores.push('No ingreso ninguna calificacion.');
    }

    if (errores.length > 0) {
        return recargarTablaConError(req, res, errores, id_periodo, id_materia, req.body.id_curso || '');
    }

    const client = await pool.connect();
    try {
        await setUsuarioAuditoria(req.session.usuario.id_usuario);
        await client.query('BEGIN');

        for (const e of entradas) {
            const valor = Number(e.crudo.replace(',', '.'));
            if (!Number.isFinite(valor)) {
                throw new Error('Valor no numerico para el estudiante ' + e.idEst + ': "' + e.crudo + '"');
            }
            await client.query(
                'CALL sp_registrar_calificacion($1, $2, $3, $4, $5, $6)',
                [e.idEst, id_materia, id_periodo, e.idTipo, valor, req.session.usuario.id_usuario]
            );
        }

        await client.query('COMMIT');
        res.redirect('/calificaciones/nueva?id_periodo=' + id_periodo +
            '&id_materia=' + id_materia +
            (req.body.id_curso ? '&id_curso=' + req.body.id_curso : '') +
            '&exito=' + encodeURIComponent('Se guardaron ' + entradas.length + ' calificaciones.'));

    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al guardar lote de calificaciones:', error.message);
        let mensaje = 'No se pudieron guardar las calificaciones.';
        if (error.code === 'P0001' || /no tiene asignada|no esta matriculado|fuera de rango/i.test(error.message)) {
            mensaje = error.message;
        }
        await recargarTablaConError(req, res, [mensaje], id_periodo, id_materia, req.body.id_curso || '');
    } finally {
        client.release();
    }
});

// POST /calificaciones -> registro individual (compatibilidad:
// formulario antiguo de una nota por vez).
router.post('/calificaciones', requireAuth, async (req, res) => {
    const { id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor } = req.body;
    const errores = [];

    if (!id_estudiante) errores.push('Debe seleccionar un estudiante.');
    if (!id_materia) errores.push('Debe seleccionar una materia.');
    if (!id_periodo) errores.push('Debe seleccionar un periodo.');
    if (!id_tipo_evaluacion) errores.push('Debe seleccionar un tipo de evaluacion.');
    if (!valor || String(valor).trim() === '') errores.push('Debe ingresar una calificacion.');

    if (errores.length === 0 && isNaN(Number(String(valor).replace(',', '.')))) {
        errores.push('La calificacion debe ser un numero.');
    }

    if (errores.length === 0) {
        const permitidas = await getMateriasPermitidas(pool, req.session.usuario, id_periodo);
        if (!permitidas.some((m) => String(m.id_materia) === String(id_materia))) {
            errores.push('No tiene asignada esta materia en el periodo: no puede registrar la nota.');
        }
    }

    if (errores.length > 0) {
        return recargarTablaConError(req, res, errores, id_periodo, id_materia, req.body.id_curso || '');
    }

    try {
        await setUsuarioAuditoria(req.session.usuario.id_usuario);

        await pool.query(
            'CALL sp_registrar_calificacion($1, $2, $3, $4, $5, $6)',
            [id_estudiante, id_materia, id_periodo, id_tipo_evaluacion,
             Number(String(valor).replace(',', '.')), req.session.usuario.id_usuario]
        );

        res.redirect('/calificaciones/nueva?id_periodo=' + id_periodo +
            '&id_materia=' + id_materia +
            (req.body.id_curso ? '&id_curso=' + req.body.id_curso : '') +
            '&exito=1');

    } catch (error) {
        console.error('Error al registrar calificacion:', error.message);
        let mensaje = 'No se pudo registrar la calificacion.';
        if (error.code === 'P0001' || /no tiene asignada|no esta matriculado|fuera de rango/i.test(error.message)) {
            mensaje = error.message;
        }
        await recargarTablaConError(req, res, [mensaje], id_periodo, id_materia, req.body.id_curso || '');
    }
});

// Re-render de la tabla masiva con errores (sin perder contexto)
async function recargarTablaConError(req, res, errores, idPeriodo, idMateria, idCurso) {
    try {
        const periodoActivo = await getPeriodoActivo();
        const materias = idPeriodo
            ? await getMateriasPermitidas(pool, req.session.usuario, idPeriodo)
            : [];
        const cursos = idPeriodo
            ? await getCursosPermitidos(pool, req.session.usuario, idPeriodo)
            : [];
        const tiposRes = await pool.query(
            `SELECT id_tipo_evaluacion, nombre, categoria, es_examen
             FROM tipos_evaluacion ORDER BY nombre`
        );

        let estudiantes = [];
        let notasExistentes = {};
        if (idPeriodo && idMateria) {
            let sqlEst = `SELECT e.id_estudiante, e.nombres, e.apellidos,
                                 m.id_curso, c.nombre AS curso_nombre, c.paralelo
                          FROM matriculas m
                          JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
                          LEFT JOIN cursos c ON c.id_curso = m.id_curso
                          WHERE m.id_periodo = $1`;
            const params = [idPeriodo];
            if (idCurso) {
                sqlEst += ' AND m.id_curso = $2';
                params.push(idCurso);
            }
            sqlEst += ' ORDER BY e.apellidos, e.nombres';
            const rEst = await pool.query(sqlEst, params);
            estudiantes = rEst.rows;

            if (estudiantes.length > 0) {
                const ids = estudiantes.map((e) => e.id_estudiante);
                const rNotas = await pool.query(
                    `SELECT id_estudiante, id_tipo_evaluacion, valor
                     FROM calificaciones
                     WHERE id_periodo = $1 AND id_materia = $2
                       AND id_estudiante = ANY($3)`,
                    [idPeriodo, idMateria, ids]
                );
                rNotas.rows.forEach((n) => {
                    if (!notasExistentes[n.id_estudiante]) notasExistentes[n.id_estudiante] = {};
                    notasExistentes[n.id_estudiante][n.id_tipo_evaluacion] = n.valor;
                });
            }
        }

        // Preservar lo que el usuario acababa de escribir
        if (req.body.notas && typeof req.body.notas === 'object') {
            Object.keys(req.body.notas).forEach((idEst) => {
                const porTipo = req.body.notas[idEst];
                if (porTipo && typeof porTipo === 'object') {
                    if (!notasExistentes[idEst]) notasExistentes[idEst] = {};
                    Object.keys(porTipo).forEach((idTipo) => {
                        if (String(porTipo[idTipo]).trim() !== '') {
                            notasExistentes[idEst][idTipo] = porTipo[idTipo];
                        }
                    });
                }
            });
        }

        res.render('calificaciones/nueva', {
            periodoActivo,
            idPeriodoSeleccionado: String(idPeriodo || (periodoActivo ? periodoActivo.id_periodo : '')),
            periodoNombre: periodoActivo ? periodoActivo.nombre : '',
            materias,
            cursos,
            tiposEvaluacion: tiposRes.rows,
            estudiantes,
            notasExistentes,
            idMateriaSeleccionada: String(idMateria || ''),
            idCursoSeleccionado: String(idCurso || ''),
            exito: null,
            errores
        });
    } catch (e) {
        console.error('Error al recargar formulario:', e.message);
        res.status(500).render('error', { mensaje: 'No se pudo recargar el formulario.' });
    }
}

module.exports = router;
