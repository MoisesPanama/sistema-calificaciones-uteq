// =========================================================
// routes/calificaciones.js — API JSON sobre el PERIODO ACTIVO
// GET  /api/calificaciones/contexto?id_periodo&id_materia&id_curso
// POST /api/calificaciones/lote {id_periodo,id_materia,id_curso,notas}
// POST /api/calificaciones (individual)
// ---------------------------------------------------------
// Profesor: solo ve/califica SUS materias/cursos asignados.
// Usa sp_registrar_calificacion (upsert + validaciones).
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

// Tipos de evaluacion permitidos en el formulario de carga.
const TIPOS_PERMITIDOS = new Set([1, 2, 3, 4, 6, 9]);
// Parcial 1, Parcial 2, Parcial 3, Tarea, Taller Grupal, Evaluacion Diagnostica

// Carga estudiantes matriculados + notas existentes (reutilizable)
async function cargarTabla(idPeriodo, idMateria, idCurso, page, limit) {
    let estudiantes = [];
    const notasExistentes = {};
    if (!idMateria) return { estudiantes, notasExistentes, total: 0 };

    let sqlCount;
    let sqlEst;
    try {
        sqlCount = `SELECT COUNT(*)::int AS total
                  FROM matriculas m
                  JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
                  LEFT JOIN cursos c ON c.id_curso = m.id_curso
                  WHERE m.id_periodo = $1`;
        sqlEst = `SELECT e.id_estudiante, e.nombres, e.apellidos,
                         m.id_curso, COALESCE(c.nombre, 'Sin curso') AS curso_nombre, COALESCE(c.paralelo, '') AS paralelo
                  FROM matriculas m
                  JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
                  LEFT JOIN cursos c ON c.id_curso = m.id_curso
                  WHERE m.id_periodo = $1`;
        await pool.query(sqlEst + ' LIMIT 0', [idPeriodo]);
    } catch (_) {
        sqlCount = `SELECT COUNT(*)::int AS total
                  FROM matriculas m
                  JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
                  WHERE m.id_periodo = $1`;
        sqlEst = `SELECT e.id_estudiante, e.nombres, e.apellidos,
                         NULL AS id_curso, 'Sin curso' AS curso_nombre, '' AS paralelo
                  FROM matriculas m
                  JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
                  WHERE m.id_periodo = $1`;
    }
    const paramsCount = [idPeriodo];
    const paramsEst = [idPeriodo];
    let countIdx = 1;
    let estIdx = 1;
    if (idCurso) {
        sqlCount += ` AND m.id_curso = $${++countIdx}`;
        paramsCount.push(idCurso);
        sqlEst += ` AND m.id_curso = $${++estIdx}`;
        paramsEst.push(idCurso);
    }

    const countResult = await pool.query(sqlCount, paramsCount);
    const total = countResult.rows[0].total;

    sqlEst += ' ORDER BY e.apellidos, e.nombres';
    if (page && limit) {
        sqlEst += ` LIMIT $${++estIdx} OFFSET $${++estIdx}`;
        paramsEst.push(limit, (page - 1) * limit);
    }
    const rEst = await pool.query(sqlEst, paramsEst);
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
    return { estudiantes, notasExistentes, total };
}

// GET /api/calificaciones/contexto -> todo lo que necesita la pantalla
router.get('/contexto', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        if (!periodoActivo) {
            return res.status(500).json({ error: 'No hay periodos registrados. Cree y active uno primero.' });
        }
        const idPeriodo = req.query.id_periodo || req.session.periodoSeleccionado || periodoActivo.id_periodo;
        const materias = await getMateriasPermitidas(pool, req.session.usuario, idPeriodo);
        const cursos = await getCursosPermitidos(pool, req.session.usuario, idPeriodo);
        const tiposRes = await pool.query(
            `SELECT id_tipo_evaluacion, nombre, peso
             FROM tipos_evaluacion
             WHERE id_tipo_evaluacion = ANY($1)
             ORDER BY nombre`,
            [Array.from(TIPOS_PERMITIDOS)]
        );

        const idMateria = req.query.id_materia || '';
        const idCurso = req.query.id_curso || '';
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(5, parseInt(req.query.limit) || 10));

        let periodoNombre = periodoActivo.nombre;
        if (String(idPeriodo) !== String(periodoActivo.id_periodo)) {
            const rp = await pool.query(
                'SELECT nombre FROM periodos_academicos WHERE id_periodo = $1',
                [idPeriodo]
            );
            if (rp.rows.length > 0) periodoNombre = rp.rows[0].nombre;
        }

        const { estudiantes, notasExistentes, total } = await cargarTabla(idPeriodo, idMateria, idCurso, page, limit);

        res.json({
            periodoActivo,
            idPeriodo: String(idPeriodo),
            periodoNombre,
            materias,
            cursos,
            tiposEvaluacion: tiposRes.rows,
            estudiantes,
            notasExistentes,
            paginacion: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error('Error al cargar contexto de calificaciones:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el formulario de calificaciones.' });
    }
});

function extraerEntradas(notas) {
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
    return entradas;
}

// Valida el contexto evaluativo (Fase 5): el parcial debe existir y
// pertenecer (via su ciclo) al periodo; el ciclo debe ser del periodo.
// Devuelve { idParcial, idCiclo } normalizados (numero o null).
// Si solo viene parcial, el ciclo se deduce (igual que el SP).
async function validarContextoEvaluativo(conn, idPeriodo, idParcial, idCiclo) {
    const numParcial = idParcial === undefined || idParcial === null || idParcial === '' ? null : Number(idParcial);
    const numCiclo = idCiclo === undefined || idCiclo === null || idCiclo === '' ? null : Number(idCiclo);
    if ((idParcial != null && idParcial !== '' && !Number.isInteger(numParcial)) ||
        (idCiclo != null && idCiclo !== '' && !Number.isInteger(numCiclo))) {
        const error = new Error('El parcial o ciclo seleccionado no es valido.');
        error.status = 400;
        throw error;
    }
    let cicloDeducido = numCiclo;
    if (numParcial !== null) {
        const r = await conn.query(
            `SELECT p.id_parcial, p.id_ciclo
             FROM parciales p
             JOIN ciclos_evaluativos c ON c.id_ciclo = p.id_ciclo
             WHERE p.id_parcial = $1 AND c.id_periodo = $2`,
            [numParcial, idPeriodo]
        );
        if (r.rows.length === 0) {
            const error = new Error('El parcial seleccionado no pertenece al periodo activo.');
            error.status = 400;
            throw error;
        }
        cicloDeducido = r.rows[0].id_ciclo;
        if (numCiclo !== null && numCiclo !== cicloDeducido) {
            const error = new Error('El parcial no pertenece al ciclo seleccionado.');
            error.status = 400;
            throw error;
        }
    } else if (numCiclo !== null) {
        const r = await conn.query(
            'SELECT id_ciclo FROM ciclos_evaluativos WHERE id_ciclo = $1 AND id_periodo = $2',
            [numCiclo, idPeriodo]
        );
        if (r.rows.length === 0) {
            const error = new Error('El ciclo seleccionado no pertenece al periodo activo.');
            error.status = 400;
            throw error;
        }
    }
    return { idParcial: numParcial, idCiclo: cicloDeducido };
}

function responderErrorNegocio(res, error, mensajeDefecto) {
    if (error.status) {
        return res.status(error.status).json({ error: error.message });
    }
    if (error.code === 'P0001' || /no tiene asignada|no esta matriculado|fuera de rango/i.test(error.message)) {
        return res.status(400).json({ error: error.message });
    }
    console.error(mensajeDefecto + ':', error.message);
    res.status(500).json({ error: mensajeDefecto + '.' });
}

// POST /api/calificaciones/lote -> guarda la tabla masiva en transaccion
router.post('/lote', requireAuth, async (req, res) => {
    const { id_periodo, id_materia, notas, id_parcial, id_ciclo } = req.body || {};

    if (!id_periodo) return res.status(400).json({ error: 'Falta el periodo.' });
    if (!id_materia) return res.status(400).json({ error: 'Debe seleccionar una materia.' });

    const materiasPermitidas = await getMateriasPermitidas(pool, req.session.usuario, id_periodo);
    if (!materiasPermitidas.some((m) => String(m.id_materia) === String(id_materia))) {
        return res.status(403).json({ error: 'No tiene asignada esta materia en el periodo: no puede registrar estas notas.' });
    }

    const entradas = extraerEntradas(notas);
    if (entradas.length === 0) {
        return res.status(400).json({ error: 'No ingreso ninguna calificacion.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const { idParcial, idCiclo } = await validarContextoEvaluativo(client, id_periodo, id_parcial, id_ciclo);
        for (const e of entradas) {
            const valor = Number(String(e.crudo).replace(',', '.'));
            if (!Number.isFinite(valor)) {
                throw new Error('Valor no numerico para el estudiante ' + e.idEst + ': "' + e.crudo + '"');
            }
            await client.query(
                'CALL sp_registrar_calificacion($1, $2, $3, $4, $5, $6, $7, $8)',
                [e.idEst, id_materia, id_periodo, e.idTipo, valor, req.session.usuario.id_usuario, idParcial, idCiclo]
            );
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: `Se guardaron ${entradas.length} calificaciones.`, total: entradas.length });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        return responderErrorNegocio(res, error, 'No se pudieron guardar las calificaciones');
    } finally {
        client.release();
    }
});

// POST /api/calificaciones -> registro individual
router.post('/', requireAuth, async (req, res) => {
    const { id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, id_parcial, id_ciclo } = req.body || {};
    const errores = [];
    if (!id_estudiante) errores.push('Debe seleccionar un estudiante.');
    if (!id_materia) errores.push('Debe seleccionar una materia.');
    if (!id_periodo) errores.push('Debe seleccionar un periodo.');
    if (!id_tipo_evaluacion) errores.push('Debe seleccionar un tipo de evaluacion.');
    if (valor === undefined || valor === null || String(valor).trim() === '') errores.push('Debe ingresar una calificacion.');
    if (errores.length > 0) return res.status(400).json({ error: errores.join(' '), errores });

    const numerico = Number(String(valor).replace(',', '.'));
    if (isNaN(numerico)) return res.status(400).json({ error: 'La calificacion debe ser un numero.' });

    const permitidas = await getMateriasPermitidas(pool, req.session.usuario, id_periodo);
    if (!permitidas.some((m) => String(m.id_materia) === String(id_materia))) {
        return res.status(403).json({ error: 'No tiene asignada esta materia en el periodo: no puede registrar la nota.' });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
            const { idParcial, idCiclo } = await validarContextoEvaluativo(client, id_periodo, id_parcial, id_ciclo);
            await client.query(
                'CALL sp_registrar_calificacion($1, $2, $3, $4, $5, $6, $7, $8)',
                [id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, numerico, req.session.usuario.id_usuario, idParcial, idCiclo]
            );
            await client.query('COMMIT');
            res.status(201).json({ ok: true, mensaje: 'Calificacion registrada correctamente.' });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        return responderErrorNegocio(res, error, 'No se pudo registrar la calificacion');
    }
});

module.exports = router;
