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

// Tipos que pueden usarse como actividad (formativa/sumativa
// que cuentan para promedio; se excluyen los pseudo-tipos
// legacy Parcial 1/2 que eran contenedores, no insumos).
const TIPOS_ACTIVIDAD = [3, 4, 5, 6, 7, 8];
// 3 Examen Final, 4 Tarea, 5 Leccion, 6 Taller Grupal,
// 7 Proyecto Interdisciplinar, 8 Examen Quimestral

async function materiaPermitida(usuario, idPeriodo, idMateria) {
    const materias = await getMateriasPermitidas(pool, usuario, idPeriodo);
    return materias.some((m) => String(m.id_materia) === String(idMateria));
}

// GET /api/actividades/tipos -> catalogo para el formulario
router.get('/tipos', requireAuth, async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT id_tipo_evaluacion, nombre, categoria, es_examen
             FROM tipos_evaluacion
             WHERE id_tipo_evaluacion = ANY($1)
             ORDER BY categoria DESC, nombre`,
            [TIPOS_ACTIVIDAD]
        );
        res.json({ tipos: r.rows });
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
                    a.id_tipo_evaluacion, te.nombre AS tipo_nombre,
                    te.categoria AS tipo_categoria, te.es_examen,
                    a.id_ciclo, a.id_parcial, a.id_curso,
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
        id_tipo_evaluacion, nombre, descripcion, fecha_actividad
    } = req.body || {};
    const errores = [];
    if (!id_materia) errores.push('Debe seleccionar una materia.');
    if (!id_periodo) errores.push('Falta el periodo.');
    if (!id_tipo_evaluacion) errores.push('Debe elegir el tipo de actividad (tarea, leccion, taller...).');
    if (!nombre || !String(nombre).trim()) errores.push('La actividad necesita un nombre (p. ej. "Leccion escrita 1").');
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
             WHERE id_tipo_evaluacion = $1 AND id_tipo_evaluacion = ANY($2)`,
            [id_tipo_evaluacion, TIPOS_ACTIVIDAD]
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
                  id_tipo_evaluacion, nombre, descripcion, fecha_actividad, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING id_actividad, nombre`,
            [
                id_materia, id_periodo, idCiclo, idParcial, numCurso,
                id_tipo_evaluacion, String(nombre).trim(),
                descripcion ? String(descripcion).trim() : null,
                fecha_actividad || new Date().toISOString().slice(0, 10),
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
router.put('/:id', requireAuth, async (req, res) => {
    const { nombre, descripcion, fecha_actividad } = req.body || {};
    try {
        const r = await pool.query(
            'SELECT id_actividad, id_materia, id_periodo, creado_por FROM actividades WHERE id_actividad = $1 AND activo = TRUE',
            [req.params.id]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Actividad no encontrada.' });
        const act = r.rows[0];
        const esAdmin = req.session.usuario.nombre_rol === 'administrador';
        if (!esAdmin && String(act.creado_por) !== String(req.session.usuario.id_usuario)) {
            return res.status(403).json({ error: 'Solo quien creo la actividad (o el administrador) puede editarla.' });
        }
        if (!(await materiaPermitida(req.session.usuario, act.id_periodo, act.id_materia))) {
            return res.status(403).json({ error: 'No tiene asignada esta materia en el periodo.' });
        }
        await pool.query(
            `UPDATE actividades SET nombre = COALESCE($1, nombre),
             descripcion = $2, fecha_actividad = COALESCE($3, fecha_actividad)
             WHERE id_actividad = $4`,
            [
                nombre ? String(nombre).trim() : null,
                descripcion !== undefined ? (descripcion ? String(descripcion).trim() : null) : undefined,
                fecha_actividad || null,
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
            'SELECT id_actividad, id_materia, id_periodo, creado_por FROM actividades WHERE id_actividad = $1 AND activo = TRUE',
            [req.params.id]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Actividad no encontrada.' });
        const act = r.rows[0];
        const esAdmin = req.session.usuario.nombre_rol === 'administrador';
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
                    fn_promedio_parcial(e.id_estudiante, $1, $2, ${exprParcial}) AS promedio_parcial
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
            `SELECT e.id_estudiante, e.nombres, e.apellidos, c.valor AS nota
             FROM matriculas m
             JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
             LEFT JOIN calificaciones c
               ON c.id_actividad = $${params.length} AND c.id_estudiante = e.id_estudiante
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
