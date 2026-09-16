// =========================================================
// routes/actividades.js — Actividades de evaluacion (insumos)
// ---------------------------------------------------------
// El docente CREA actividades (tarea, leccion, taller,
// debate, proyecto, examen...) y califica SOBRE cada una.
// Los promedios se recalculan solos (trigger BD).
//
// GET    /api/actividades?                         lista + stats
// POST   /api/actividades                          crear
// PUT    /api/actividades/:id                      editar
// DELETE /api/actividades/:id                      borrar (409 si tiene notas)
// GET    /api/actividades/:id/promedios?id_periodo resumen del parcial
// GET    /api/actividades/tipos                    tipos permitidos
// ---------------------------------------------------------
// Profesor: solo SUS materias asignadas (403 si no).
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
const { validarContextoEvaluativo } = require('./calificaciones');

// Tipos calificables salen de la BD (helpers/tipos): nada
// hardcodeado por id, ordenados con examen al ultimo.
const { tiposCalificables } = require('../helpers/tipos');

async function materiaPermitida(usuario, idPeriodo, idMateria) {
    const materias = await getMateriasPermitidas(pool, usuario, idPeriodo);
    return materias.some((m) => String(m.id_materia) === String(idMateria));
}

// GET /api/actividades/tipos -> catalogo para el formulario
router.get('/tipos', requireAuth, async (req, res) => {
    try {
        res.json({ tipos: await tiposCalificables(pool) });
    } catch (error) {
        console.error('Error al listar tipos de actividad:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los tipos de actividad.' });
    }
});

// GET /api/actividades -> lista con n° calificados y promedio
router.get('/', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        if (!periodoActivo) {
            return res.status(500).json({ error: 'No hay periodos registrados.' });
        }
        const idPeriodo = req.query.id_periodo || req.session.periodoSeleccionado || periodoActivo.id_periodo;
        const { id_materia, id_ciclo, id_parcial, id_curso } = req.query;
        if (!id_materia) return res.status(400).json({ error: 'Debe seleccionar una materia.' });

        if (!(await materiaPermitida(req.session.usuario, idPeriodo, id_materia))) {
            return res.status(403).json({ error: 'No tiene asignada esta materia en el periodo.' });
        }

        const conds = ['a.id_materia = $1', 'a.id_periodo = $2', 'a.activo = TRUE'];
        const params = [id_materia, idPeriodo];
        if (id_ciclo) { conds.push(`a.id_ciclo = $${params.length + 1}`); params.push(id_ciclo); }
        if (id_parcial) { conds.push(`a.id_parcial = $${params.length + 1}`); params.push(id_parcial); }
        if (id_curso) { conds.push(`a.id_curso = $${params.length + 1}`); params.push(id_curso); }

        const r = await pool.query(
            `SELECT a.id_actividad, a.nombre, a.descripcion, a.fecha_actividad,
                    a.fecha_limite,
                    a.id_tipo_evaluacion, te.nombre AS tipo_nombre,
                    te.categoria AS tipo_categoria, te.es_examen,
                    a.id_ciclo, a.id_parcial, a.id_curso, a.estado,
                    COUNT(DISTINCT c.id_estudiante)::int AS n_calificados,
                    ROUND(AVG(c.valor), 2) AS promedio
             FROM actividades a
             JOIN tipos_evaluacion te ON te.id_tipo_evaluacion = a.id_tipo_evaluacion
             LEFT JOIN calificaciones c ON c.id_actividad = a.id_actividad
             WHERE ${conds.join(' AND ')}
             GROUP BY a.id_actividad, te.nombre, te.categoria, te.es_examen
             ORDER BY a.fecha_actividad, a.id_actividad`,
            params
        );
        res.json({ actividades: r.rows });
    } catch (error) {
        console.error('Error al listar actividades:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar las actividades.' });
    }
});

// POST /api/actividades -> crear (el docente crea sus insumos)
router.post('/', requireAuth, async (req, res) => {
    const {
        id_materia, id_periodo, id_ciclo, id_parcial, id_curso,
        id_tipo_evaluacion, nombre, descripcion, fecha_actividad, fecha_limite
    } = req.body || {};
    const errores = [];
    if (!id_materia) errores.push('Debe seleccionar una materia.');
    if (!id_periodo) errores.push('Falta el periodo.');
    if (!id_tipo_evaluacion) errores.push('Debe elegir el tipo de actividad (tarea, leccion, taller...).');
    if (!nombre || !String(nombre).trim()) errores.push('La actividad necesita un nombre (p. ej. "Leccion escrita 1").');
    const fechaEmision = fecha_actividad || new Date().toISOString().slice(0, 10);
    if (fecha_limite && String(fecha_limite) < String(fechaEmision)) {
        errores.push('La fecha limite no puede ser anterior a la fecha de la actividad.');
    }
    if (errores.length > 0) return res.status(400).json({ error: errores.join(' '), errores });

    if (!(await materiaPermitida(req.session.usuario, id_periodo, id_materia))) {
        return res.status(403).json({ error: 'No tiene asignada esta materia en el periodo.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const { idParcial, idCiclo } = await validarContextoEvaluativo(client, id_periodo, id_parcial, id_ciclo);

        const rTipo = await client.query(
            `SELECT id_tipo_evaluacion, nombre, categoria
             FROM tipos_evaluacion
             WHERE id_tipo_evaluacion = $1
               AND NOT es_legacy AND categoria IN ('formativa', 'sumativa')`,
            [id_tipo_evaluacion]
        );
        if (rTipo.rows.length === 0) {
            const error = new Error('El tipo de actividad no es valido para calificar.');
            error.status = 400;
            throw error;
        }

        let numCurso = null;
        if (id_curso !== undefined && id_curso !== null && id_curso !== '') {
            const rCur = await client.query(
                'SELECT id_curso FROM cursos WHERE id_curso = $1 AND id_periodo = $2',
                [id_curso, id_periodo]
            );
            if (rCur.rows.length === 0) {
                const error = new Error('El curso no pertenece al periodo.');
                error.status = 400;
                throw error;
            }
            numCurso = Number(id_curso);
        }

        const r = await client.query(
            `INSERT INTO actividades
                 (id_materia, id_periodo, id_ciclo, id_parcial, id_curso,
                  id_tipo_evaluacion, nombre, descripcion, fecha_actividad, fecha_limite, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING id_actividad, nombre`,
            [
                id_materia, id_periodo, idCiclo, idParcial, numCurso,
                id_tipo_evaluacion, String(nombre).trim(),
                descripcion ? String(descripcion).trim() : null,
                fechaEmision,
                fecha_limite || null,
                req.session.usuario.id_usuario
            ]
        );
        await client.query('COMMIT');
        res.status(201).json({ ok: true, mensaje: 'Actividad creada. Ya puede registrar las notas.', actividad: r.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.status) return res.status(error.status).json({ error: error.message });
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe una actividad con ese nombre en este parcial.' });
        }
        console.error('Error al crear actividad:', error.message);
        res.status(500).json({ error: 'No se pudo crear la actividad.' });
    } finally {
        client.release();
    }
});

// PUT /api/actividades/:id -> editar datos basicos
// Bloqueado si esta cerrada (reabrir primero, solo admin).
router.put('/:id', requireAuth, async (req, res) => {
    const { nombre, descripcion, fecha_actividad, fecha_limite } = req.body || {};
    try {
        const r = await pool.query(
            'SELECT id_actividad, id_materia, id_periodo, creado_por, estado, fecha_actividad FROM actividades WHERE id_actividad = $1 AND activo = TRUE',
            [req.params.id]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Actividad no encontrada.' });
        const act = r.rows[0];
        if (act.estado === 'cerrada') {
            return res.status(409).json({ error: 'La actividad esta cerrada: reabra antes de editar.' });
        }
        const esAdmin = req.session.usuario.nombre_rol === 'administrador';
        if (!esAdmin && String(act.creado_por) !== String(req.session.usuario.id_usuario)) {
            return res.status(403).json({ error: 'Solo quien creo la actividad (o el administrador) puede editarla.' });
        }
        if (!(await materiaPermitida(req.session.usuario, act.id_periodo, act.id_materia))) {
            return res.status(403).json({ error: 'No tiene asignada esta materia en el periodo.' });
        }
        const nuevaEmision = fecha_actividad || act.fecha_actividad;
        if (fecha_limite && String(fecha_limite) < String(nuevaEmision).slice(0, 10)) {
            return res.status(400).json({ error: 'La fecha limite no puede ser anterior a la fecha de la actividad.' });
        }
        await pool.query(
            `UPDATE actividades SET nombre = COALESCE($1, nombre),
             descripcion = $2, fecha_actividad = COALESCE($3, fecha_actividad),
             fecha_limite = $4
             WHERE id_actividad = $5`,
            [
                nombre ? String(nombre).trim() : null,
                descripcion !== undefined ? (descripcion ? String(descripcion).trim() : null) : undefined,
                fecha_actividad || null,
                fecha_limite !== undefined ? (fecha_limite || null) : undefined,
                req.params.id
            ]
        );
        res.json({ ok: true, mensaje: 'Actividad actualizada.' });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe una actividad con ese nombre en este parcial.' });
        }
        console.error('Error al editar actividad:', error.message);
        res.status(500).json({ error: 'No se pudo actualizar la actividad.' });
    }
});

// DELETE /api/actividades/:id -> borrar (409 si ya tiene notas)
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const r = await pool.query(
            'SELECT id_actividad, id_materia, id_periodo, creado_por, estado FROM actividades WHERE id_actividad = $1 AND activo = TRUE',
            [req.params.id]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Actividad no encontrada.' });
        const act = r.rows[0];
        const esAdmin = req.session.usuario.nombre_rol === 'administrador';
        if (act.estado === 'cerrada') {
            return res.status(409).json({ error: 'La actividad esta cerrada: reabra antes de borrar.' });
        }
        if (!esAdmin && String(act.creado_por) !== String(req.session.usuario.id_usuario)) {
            return res.status(403).json({ error: 'Solo quien creo la actividad (o el administrador) puede borrarla.' });
        }
        if (!(await materiaPermitida(req.session.usuario, act.id_periodo, act.id_materia))) {
            return res.status(403).json({ error: 'No tiene asignada esta materia en el periodo.' });
        }
        const rNotas = await pool.query(
            'SELECT COUNT(*)::int AS total FROM calificaciones WHERE id_actividad = $1',
            [req.params.id]
        );
        if (rNotas.rows[0].total > 0) {
            return res.status(409).json({
                error: `La actividad ya tiene ${rNotas.rows[0].total} nota(s) registrada(s): no se puede borrar.`
            });
        }
        const rEnt = await pool.query(
            `SELECT COUNT(*)::int AS total FROM entregas
             WHERE id_actividad = $1 AND estado <> 'pendiente'`,
            [req.params.id]
        );
        if (rEnt.rows[0].total > 0) {
            return res.status(409).json({
                error: 'La actividad ya tiene entregas en curso: no se puede borrar.'
            });
        }
        await pool.query('DELETE FROM actividades WHERE id_actividad = $1', [req.params.id]);
        res.json({ ok: true, mensaje: 'Actividad eliminada.' });
    } catch (error) {
        console.error('Error al borrar actividad:', error.message);
        res.status(500).json({ error: 'No se pudo eliminar la actividad.' });
    }
});

// Cursos visibles para el usuario sobre una actividad:
// - si la actividad fija curso, solo ese (403 si el docente no lo tiene);
// - admin: todo; docente: sus cursos permitidos (null = todos).
async function cursosVisibles(act, usuario) {
    const esAdmin = usuario.nombre_rol === 'administrador';
    if (act.id_curso) {
        if (!esAdmin) {
            const permitidos = await getCursosPermitidos(pool, usuario, act.id_periodo);
            if (!permitidos.some((c) => String(c.id_curso) === String(act.id_curso))) {
                const error = new Error('No tiene asignado ese curso.');
                error.status = 403;
                throw error;
            }
        }
        return { fijo: act.id_curso };
    }
    if (esAdmin) return { todos: true };
    const permitidos = await getCursosPermitidos(pool, usuario, act.id_periodo);
    return { ids: permitidos.map((c) => c.id_curso) };
}

// Aplica el filtro de curso a una consulta sobre matriculas m.
// pushParams: agrega params y devuelve la clausula (con $N correctos).
function filtroCursoMatriculas(vis, pushParams) {
    if (vis.fijo) {
        const n = pushParams(vis.fijo);
        return ` AND (m.id_curso = $${n} OR m.id_curso IS NULL)`;
    }
    if (vis.ids && vis.ids.length > 0) {
        const n = pushParams(vis.ids);
        return ` AND (m.id_curso = ANY($${n}) OR m.id_curso IS NULL)`;
    }
    return '';
}
// POST /api/actividades/:id/estado { estado } -> cambiar estado.
// Flujo: borrador -> publicada -> cerrada. Reabrir (cerrada ->
// publicada) solo admin. Calificar exige publicada (lo valida el SP).
router.post('/:id/estado', requireAuth, async (req, res) => {
    const { estado } = req.body || {};
    const VALIDOS = ['borrador', 'publicada', 'cerrada'];
    if (!VALIDOS.includes(estado)) {
        return res.status(400).json({ error: 'Estado no valido: borrador, publicada o cerrada.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            'SELECT id_actividad, id_materia, id_periodo, id_curso, creado_por, estado FROM actividades WHERE id_actividad = $1 AND activo = TRUE',
            [req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Actividad no encontrada.' });
        }
        const act = r.rows[0];
        const esAdmin = req.session.usuario.nombre_rol === 'administrador';
        if (!esAdmin && String(act.creado_por) !== String(req.session.usuario.id_usuario)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Solo quien creo la actividad (o el administrador) puede cambiar su estado.' });
        }
        if (!(await materiaPermitida(req.session.usuario, act.id_periodo, act.id_materia))) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'No tiene asignada esta materia en el periodo.' });
        }
        if (act.estado === 'cerrada' && estado !== 'publicada') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Cerrada solo puede reabrirse a publicada.' });
        }
        if (act.estado === 'cerrada' && estado === 'publicada' && !esAdmin) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Solo el administrador puede reabrir una actividad cerrada.' });
        }
        await client.query('UPDATE actividades SET estado = $1 WHERE id_actividad = $2', [estado, req.params.id]);
        let pendientes = 0;
        if (estado === 'publicada') {
            // Al publicar se generan las entregas pendientes de la
            // nomina visible (idempotente por UNIQUE).
            try {
                const vis = await cursosVisibles({ ...act, estado }, req.session.usuario);
                const paramsR = [act.id_periodo];
                let filtroR = '';
                if (vis.fijo) {
                    paramsR.push(vis.fijo);
                    filtroR = ` AND (m.id_curso = $${paramsR.length} OR m.id_curso IS NULL)`;
                } else if (vis.ids && vis.ids.length > 0) {
                    paramsR.push(vis.ids);
                    filtroR = ` AND (m.id_curso = ANY($${paramsR.length}) OR m.id_curso IS NULL)`;
                }
                const rIns = await client.query(
                    `INSERT INTO entregas (id_actividad, id_estudiante)
                     SELECT $1, m.id_estudiante FROM matriculas m
                     WHERE m.id_periodo = $${paramsR.length + 1}${filtroR}
                     ON CONFLICT DO NOTHING`,
                    [req.params.id, ...paramsR]
                );
                pendientes = rIns.rowCount;
            } catch (e) {
                console.error('No se pudieron generar entregas:', e.message);
            }
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: `Actividad ${estado}.`, pendientes });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al cambiar estado:', error.message);
        res.status(500).json({ error: 'No se pudo cambiar el estado.' });
    } finally {
        client.release();
    }
});

// GET /api/actividades/:id/promedios -> resumen por estudiante del parcial
// (n° insumos y promedios formativos/sumativos + promedio del
// parcial via fn oficial; los promedios se calculan solos).
router.get('/:id/promedios', requireAuth, async (req, res) => {
    try {
        const rAct = await pool.query(
            `SELECT a.*, te.categoria AS tipo_categoria
             FROM actividades a
             JOIN tipos_evaluacion te ON te.id_tipo_evaluacion = a.id_tipo_evaluacion
             WHERE a.id_actividad = $1 AND a.activo = TRUE`,
            [req.params.id]
        );
        if (rAct.rows.length === 0) return res.status(404).json({ error: 'Actividad no encontrada.' });
        const act = rAct.rows[0];
        if (!(await materiaPermitida(req.session.usuario, act.id_periodo, act.id_materia))) {
            return res.status(403).json({ error: 'No tiene asignada esta materia en el periodo.' });
        }

        const params = [act.id_periodo, act.id_materia];
        const push = (v) => { params.push(v); return params.length; };
        let filtroCurso = '';
        try {
            filtroCurso = filtroCursoMatriculas(await cursosVisibles(act, req.session.usuario), push);
        } catch (error) {
            if (error.status) return res.status(error.status).json({ error: error.message });
            throw error;
        }

        let filtroParcial = 'AND c.id_parcial IS NULL';
        let exprParcial = 'NULL';
        if (act.id_parcial) {
            const n = push(act.id_parcial);
            filtroParcial = `AND c.id_parcial = $${n}`;
            exprParcial = `$${n}`;
        }

        const r = await pool.query(
            `SELECT e.id_estudiante, e.nombres, e.apellidos,
                    COUNT(CASE WHEN te.categoria = 'formativa' AND NOT te.es_examen
                        THEN 1 END)::int AS n_formativas,
                    ROUND(AVG(CASE WHEN te.categoria = 'formativa' AND NOT te.es_examen
                        THEN c.valor END), 2) AS avg_formativas,
                    COUNT(CASE WHEN te.categoria = 'sumativa' AND NOT te.es_examen
                        THEN 1 END)::int AS n_sumativas,
                    ROUND(AVG(CASE WHEN te.categoria = 'sumativa' AND NOT te.es_examen
                        THEN c.valor END), 2) AS avg_sumativas,
                    fn_promedio_parcial(e.id_estudiante, $2, $1, ${exprParcial}) AS promedio_parcial
             FROM matriculas m
             JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
             LEFT JOIN calificaciones c
               ON c.id_estudiante = e.id_estudiante
              AND c.id_materia = $2 AND c.id_periodo = $1 ${filtroParcial}
             LEFT JOIN actividades ac ON ac.id_actividad = c.id_actividad
             LEFT JOIN tipos_evaluacion te
               ON te.id_tipo_evaluacion = COALESCE(ac.id_tipo_evaluacion, c.id_tipo_evaluacion)
             WHERE m.id_periodo = $1${filtroCurso}
             GROUP BY e.id_estudiante, e.nombres, e.apellidos
             ORDER BY e.apellidos, e.nombres`,
            params
        );
        res.json({ actividad: act, estudiantes: r.rows });
    } catch (error) {
        console.error('Error al calcular promedios:', error.message);
        res.status(500).json({ error: 'No se pudieron calcular los promedios.' });
    }
});

// GET /api/actividades/:id/notas -> planilla para calificar:
// estudiantes visibles + nota actual de CADA uno en la actividad.
router.get('/:id/notas', requireAuth, async (req, res) => {
    try {
        const rAct = await pool.query(
            `SELECT a.*, te.nombre AS tipo_nombre, te.categoria AS tipo_categoria
             FROM actividades a
             JOIN tipos_evaluacion te ON te.id_tipo_evaluacion = a.id_tipo_evaluacion
             WHERE a.id_actividad = $1 AND a.activo = TRUE`,
            [req.params.id]
        );
        if (rAct.rows.length === 0) return res.status(404).json({ error: 'Actividad no encontrada.' });
        const act = rAct.rows[0];
        if (!(await materiaPermitida(req.session.usuario, act.id_periodo, act.id_materia))) {
            return res.status(403).json({ error: 'No tiene asignada esta materia en el periodo.' });
        }

        const params = [act.id_periodo];
        const push = (v) => { params.push(v); return params.length; };
        let filtroCurso = '';
        try {
            filtroCurso = filtroCursoMatriculas(await cursosVisibles(act, req.session.usuario), push);
        } catch (error) {
            if (error.status) return res.status(error.status).json({ error: error.message });
            throw error;
        }
        params.push(act.id_actividad);
        const r = await pool.query(
            `SELECT e.id_estudiante, e.nombres, e.apellidos, c.valor AS nota,
                    en.id_entrega, en.estado AS entrega_estado
             FROM matriculas m
             JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
             LEFT JOIN calificaciones c
               ON c.id_actividad = $${params.length} AND c.id_estudiante = e.id_estudiante
             LEFT JOIN entregas en
               ON en.id_actividad = $${params.length} AND en.id_estudiante = e.id_estudiante
             WHERE m.id_periodo = $1${filtroCurso}
             ORDER BY e.apellidos, e.nombres`,
            params
        );
        res.json({ actividad: act, estudiantes: r.rows });
    } catch (error) {
        console.error('Error al cargar planilla:', error.message);
        res.status(500).json({ error: 'No se pudo cargar la planilla de notas.' });
    }
});

module.exports = router;
