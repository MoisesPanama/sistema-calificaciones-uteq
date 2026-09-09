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

// Carga estudiantes matriculados + notas existentes (reutilizable)
async function cargarTabla(idPeriodo, idMateria, idCurso) {
    let estudiantes = [];
    const notasExistentes = {};
    if (!idMateria) return { estudiantes, notasExistentes };

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
    return { estudiantes, notasExistentes };
}

// GET /api/calificaciones/contexto -> todo lo que necesita la pantalla
router.get('/contexto', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        if (!periodoActivo) {
            return res.status(500).json({ error: 'No hay periodos registrados. Cree y active uno primero.' });
        }
        const idPeriodo = req.query.id_periodo || periodoActivo.id_periodo;
        const materias = await getMateriasPermitidas(pool, req.session.usuario, idPeriodo);
        const cursos = await getCursosPermitidos(pool, req.session.usuario, idPeriodo);
        const tiposRes = await pool.query(
            `SELECT id_tipo_evaluacion, nombre, categoria, es_examen
             FROM tipos_evaluacion ORDER BY nombre`
        );

        const idMateria = req.query.id_materia || '';
        const idCurso = req.query.id_curso || '';

        let periodoNombre = periodoActivo.nombre;
        if (String(idPeriodo) !== String(periodoActivo.id_periodo)) {
            const rp = await pool.query(
                'SELECT nombre FROM periodos_academicos WHERE id_periodo = $1',
                [idPeriodo]
            );
            if (rp.rows.length > 0) periodoNombre = rp.rows[0].nombre;
        }

        const { estudiantes, notasExistentes } = await cargarTabla(idPeriodo, idMateria, idCurso);

        res.json({
            periodoActivo,
            idPeriodo: String(idPeriodo),
            periodoNombre,
            materias,
            cursos,
            tiposEvaluacion: tiposRes.rows,
            estudiantes,
            notasExistentes
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

// POST /api/calificaciones/lote -> guarda la tabla masiva en transaccion
router.post('/lote', requireAuth, async (req, res) => {
    const { id_periodo, id_materia, notas } = req.body || {};

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
        await setUsuarioAuditoria(req.session.usuario.id_usuario);
        await client.query('BEGIN');
        for (const e of entradas) {
            const valor = Number(String(e.crudo).replace(',', '.'));
            if (!Number.isFinite(valor)) {
                throw new Error('Valor no numerico para el estudiante ' + e.idEst + ': "' + e.crudo + '"');
            }
            await client.query(
                'CALL sp_registrar_calificacion($1, $2, $3, $4, $5, $6)',
                [e.idEst, id_materia, id_periodo, e.idTipo, valor, req.session.usuario.id_usuario]
            );
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: `Se guardaron ${entradas.length} calificaciones.`, total: entradas.length });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al guardar lote de calificaciones:', error.message);
        if (error.code === 'P0001' || /no tiene asignada|no esta matriculado|fuera de rango/i.test(error.message)) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'No se pudieron guardar las calificaciones.' });
    } finally {
        client.release();
    }
});

// POST /api/calificaciones -> registro individual
router.post('/', requireAuth, async (req, res) => {
    const { id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor } = req.body || {};
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
        await setUsuarioAuditoria(req.session.usuario.id_usuario);
        await pool.query(
            'CALL sp_registrar_calificacion($1, $2, $3, $4, $5, $6)',
            [id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, numerico, req.session.usuario.id_usuario]
        );
        res.status(201).json({ ok: true, mensaje: 'Calificacion registrada correctamente.' });
    } catch (error) {
        console.error('Error al registrar calificacion:', error.message);
        if (error.code === 'P0001' || /no tiene asignada|no esta matriculado|fuera de rango/i.test(error.message)) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'No se pudo registrar la calificacion.' });
    }
});

module.exports = router;
