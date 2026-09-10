// =========================================================
// routes/consulta.js — GET /api/consulta (notas por estudiante)
// Usa fn_promedio_materia y fn_promedio_general.
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getPeriodoActivo } = require('../helpers/contexto');

function evaluarEscala(nota) {
    if (nota == null) return 'S/N';
    if (nota >= 9.0) return 'AD';
    if (nota >= 7.0) return 'A';
    if (nota >= 5.0) return 'B';
    if (nota >= 3.0) return 'C';
    return 'D';
}

// Escala oficial con fallback local (igual que el detalle).
async function escalaOficial(conn, promedio) {
    try {
        const r = await conn.query('SELECT fn_escala_cualitativa($1) AS escala', [promedio]);
        if (r.rows[0]?.escala) return r.rows[0].escala;
    } catch (_) { /* usa escala local */ }
    return evaluarEscala(promedio);
}

// GET /api/consulta/materia/:id_materia?id_estudiante=&id_periodo=
// Promedio de UN estudiante en UNA materia con desglose por
// parcial/ciclo/anual + minimo de insumos (Fase 7).
router.get('/materia/:id_materia', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        if (!periodoActivo) {
            return res.status(500).json({ error: 'No hay periodos registrados.' });
        }
        const idPeriodo = req.query.id_periodo || req.session.periodoSeleccionado || String(periodoActivo.id_periodo);
        const idEstudiante = req.query.id_estudiante || '';
        const idMateria = req.params.id_materia;
        if (!idEstudiante) {
            return res.status(400).json({ error: 'Falta id_estudiante.' });
        }

        const rMat = await pool.query(
            'SELECT id_materia, nombre FROM materias WHERE id_materia = $1',
            [idMateria]
        );
        if (rMat.rows.length === 0) {
            return res.status(404).json({ error: 'Materia no encontrada.' });
        }
        const rEst = await pool.query(
            `SELECT e.id_estudiante, e.nombres, e.apellidos
             FROM estudiantes e
             JOIN matriculas m ON m.id_estudiante = e.id_estudiante
             WHERE e.id_estudiante = $1 AND m.id_periodo = $2`,
            [idEstudiante, idPeriodo]
        );
        if (rEst.rows.length === 0) {
            return res.status(404).json({ error: 'El estudiante no esta matriculado en este periodo.' });
        }

        // Representante: solo sus hijos.
        if (req.session.usuario.nombre_rol === 'representante') {
            const rep = await pool.query(
                `SELECT 1 FROM estudiantes e
                 JOIN representantes r ON r.id_representante = e.id_representante
                 WHERE e.id_estudiante = $1 AND r.id_usuario = $2`,
                [idEstudiante, req.session.usuario.id_usuario]
            );
            if (rep.rows.length === 0) {
                return res.status(403).json({ error: 'Solo puedes consultar a tus representados.' });
            }
        }

        // Minimo de insumos configurado para la materia (Fase 7).
        const rMin = await pool.query('SELECT fn_minimo_insumos_materia($1) AS minimo', [idMateria]);
        const minimoInsumos = rMin.rows[0].minimo;

        let promedio = null;
        let mensajeSinNotas = null;
        try {
            const rProm = await pool.query(
                'SELECT fn_promedio_materia($1, $2, $3) AS promedio',
                [idEstudiante, idMateria, idPeriodo]
            );
            promedio = rProm.rows[0].promedio;
        } catch (error) {
            if (error.code === 'P0001') {
                mensajeSinNotas = 'Este estudiante no tiene calificaciones registradas en esta materia y periodo.';
            } else {
                throw error;
            }
        }
        const escala = await escalaOficial(pool, promedio);

        // Insumos por parcial (una sola llamada, se indexa por ciclo+parcial).
        const rIns = await pool.query(
            'SELECT * FROM fn_insumos_faltantes($1, $2, $3, $4)',
            [idEstudiante, idMateria, idPeriodo, minimoInsumos]
        );
        const insumosPorClave = {};
        for (const f of rIns.rows) {
            insumosPorClave[f.ciclo + '||' + f.parcial] = f;
        }

        const rCiclos = await pool.query(
            `SELECT id_ciclo, nombre, tipo, peso, peso_formativa, peso_sumativa
             FROM ciclos_evaluativos WHERE id_periodo = $1 ORDER BY orden`,
            [idPeriodo]
        );
        const ciclos = [];
        for (const c of rCiclos.rows) {
            const rPC = await pool.query(
                'SELECT fn_promedio_ciclo($1, $2, $3, $4) AS promedio',
                [idEstudiante, idMateria, idPeriodo, c.id_ciclo]
            );
            const promCiclo = rPC.rows[0].promedio;
            const rPar = await pool.query(
                'SELECT id_parcial, nombre, orden FROM parciales WHERE id_ciclo = $1 ORDER BY orden',
                [c.id_ciclo]
            );
            const parciales = [];
            for (const p of rPar.rows) {
                const rPP = await pool.query(
                    'SELECT fn_promedio_parcial($1, $2, $3, $4) AS promedio',
                    [idEstudiante, idMateria, idPeriodo, p.id_parcial]
                );
                const ins = insumosPorClave[c.nombre + '||' + p.nombre] || {};
                parciales.push({
                    id_parcial: p.id_parcial,
                    nombre: p.nombre,
                    promedio: rPP.rows[0].promedio,
                    escala: await escalaOficial(pool, rPP.rows[0].promedio),
                    n_insumos: ins.n_insumos != null ? Number(ins.n_insumos) : null,
                    minimo: minimoInsumos,
                    faltan: ins.faltan != null ? Number(ins.faltan) : null
                });
            }
            ciclos.push({
                id_ciclo: c.id_ciclo,
                nombre: c.nombre,
                tipo: c.tipo,
                peso: c.peso,
                peso_formativa: c.peso_formativa,
                peso_sumativa: c.peso_sumativa,
                promedio: promCiclo,
                escala: await escalaOficial(pool, promCiclo),
                parciales
            });
        }

        res.json({
            periodoActivo,
            idPeriodo: String(idPeriodo),
            materia: rMat.rows[0],
            estudiante: rEst.rows[0],
            minimo_insumos: minimoInsumos,
            promedio,
            escala,
            ciclos,
            mensajeSinNotas
        });
    } catch (error) {
        console.error('Error en consulta por materia:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el promedio de la materia.' });
    }
});

router.get('/', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        if (!periodoActivo) {
            return res.status(500).json({ error: 'No hay periodos registrados.' });
        }

        const periodos = await pool.query(
            'SELECT id_periodo, nombre FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );

        const idPeriodo = req.query.id_periodo || req.session.periodoSeleccionado || String(periodoActivo.id_periodo);
        const idEstudiante = req.query.id_estudiante || '';
        const idMateria = req.query.id_materia || '';

        const periodoSel = periodos.rows.find(p => String(p.id_periodo) === String(idPeriodo));
        const periodoNombre = periodoSel ? periodoSel.nombre : periodoActivo.nombre;

        // Filtrar estudiantes segun rol
        let sqlEst = `SELECT e.id_estudiante, e.nombres, e.apellidos
                     FROM matriculas m
                     JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
                     WHERE m.id_periodo = $1`;
        const paramsEst = [idPeriodo];

        // Representante: solo ver sus hijos
        if (req.session.usuario.nombre_rol === 'representante') {
            const repResult = await pool.query(
                'SELECT id_representante FROM representantes WHERE id_usuario = $1',
                [req.session.usuario.id_usuario]
            );
            if (repResult.rows.length > 0) {
                sqlEst += ' AND e.id_representante = $2';
                paramsEst.push(repResult.rows[0].id_representante);
            } else {
                sqlEst += ' AND 1 = 0';
            }
        }

        sqlEst += ' ORDER BY e.apellidos, e.nombres';
        const resultadoEst = await pool.query(sqlEst, paramsEst);

        let materiasFiltro = [];
        let materias = [];
        let promedioGeneral = null;
        let promedioMateriaSel = null;
        let escalaMateriaSel = null;
        let mensajeSinNotas = null;

        if (idEstudiante) {
            const rMat = await pool.query(
                `SELECT DISTINCT mat.id_materia, mat.nombre
                 FROM calificaciones c
                 JOIN materias mat ON mat.id_materia = c.id_materia
                 WHERE c.id_estudiante = $1 AND c.id_periodo = $2
                 ORDER BY mat.nombre`,
                [idEstudiante, idPeriodo]
            );
            materiasFiltro = rMat.rows;

            let sqlNotas = `SELECT c.id_materia, mat.nombre AS materia,
                                   te.nombre AS tipo_evaluacion, c.valor
                            FROM calificaciones c
                            JOIN materias mat ON mat.id_materia = c.id_materia
                            JOIN tipos_evaluacion te ON te.id_tipo_evaluacion = c.id_tipo_evaluacion
                            WHERE c.id_estudiante = $1 AND c.id_periodo = $2`;
            const params = [idEstudiante, idPeriodo];
            if (idMateria) {
                sqlNotas += ' AND c.id_materia = $3';
                params.push(idMateria);
            }
            sqlNotas += ' ORDER BY mat.nombre, te.nombre';
            const resultadoNotas = await pool.query(sqlNotas, params);

            const materiasMap = new Map();
            resultadoNotas.rows.forEach(function(fila) {
                if (!materiasMap.has(fila.id_materia)) {
                    materiasMap.set(fila.id_materia, {
                        id_materia: fila.id_materia,
                        nombre: fila.materia,
                        parciales: [],
                        promedio: null,
                        escala: null
                    });
                }
                materiasMap.get(fila.id_materia).parciales.push({
                    tipo: fila.tipo_evaluacion,
                    valor: fila.valor
                });
            });
            materias = Array.from(materiasMap.values());

            for (const materia of materias) {
                const resultadoProm = await pool.query(
                    'SELECT fn_promedio_materia($1, $2, $3) AS promedio',
                    [idEstudiante, materia.id_materia, idPeriodo]
                );
                materia.promedio = resultadoProm.rows[0].promedio;
                materia.escala = await escalaOficial(pool, materia.promedio);
                if (String(materia.id_materia) === String(idMateria)) {
                    promedioMateriaSel = materia.promedio;
                    escalaMateriaSel = materia.escala;
                }
            }

            try {
                const resultadoGeneral = await pool.query(
                    'SELECT fn_promedio_general($1, $2) AS promedio',
                    [idEstudiante, idPeriodo]
                );
                promedioGeneral = resultadoGeneral.rows[0].promedio;
            } catch (error) {
                if (error.code === 'P0001') {
                    mensajeSinNotas = 'Este estudiante no tiene calificaciones registradas en este periodo.';
                } else {
                    throw error;
                }
            }
        }

        res.json({
            periodoActivo,
            periodoNombre,
            periodos: periodos.rows,
            estudiantes: resultadoEst.rows,
            materiasFiltro,
            materias,
            promedioGeneral,
            promedioMateriaSel,
            escalaMateriaSel,
            mensajeSinNotas,
            idPeriodo: String(idPeriodo),
            idEstudiante: String(idEstudiante || ''),
            idMateria: String(idMateria || '')
        });
    } catch (error) {
        console.error('Error en consulta de calificaciones:', error.message);
        res.status(500).json({ error: 'No se pudo cargar la consulta de calificaciones.' });
    }
});

module.exports = router;
