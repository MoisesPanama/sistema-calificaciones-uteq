// =========================================================
// routes/consulta.js — GET /api/consulta (notas por estudiante)
// Usa fn_promedio_materia y fn_promedio_general.
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getPeriodoActivo, getProfesorId, getEstudianteId, esAdmin } = require('../helpers/contexto');
const { leerPaginacion, respuestaPaginada } = require('../helpers/paginacion');

// Rol estudiante: SOLO ve sus propias notas. Devuelve su
// id_estudiante o null si el usuario no esta vinculado.
// El frontend nunca decide esto: se impone en el backend.
async function idPropioEstudiante(req) {
    if (req.session.usuario.nombre_rol !== 'estudiante') return undefined;
    return await getEstudianteId(pool, req.session.usuario.id_usuario);
}

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
        let idEstudiante = req.query.id_estudiante || '';
        const idMateria = req.params.id_materia;
        // Estudiante: ignora el parametro y usa el propio siempre.
        const propioMateria = await idPropioEstudiante(req);
        if (propioMateria !== undefined) {
            if (!propioMateria) {
                return res.status(403).json({ error: 'Tu usuario no esta vinculado a ningun estudiante.' });
            }
            idEstudiante = String(propioMateria);
        }
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

// GET /api/consulta/grupos?id_periodo= — bloques Materia＋Paralelo
// del periodo con conteo de estudiantes. Profesor: solo sus
// asignaciones. Estudiante: solo sus materias. El resto ve todos
// (el detalle filtra por rol).
router.get('/grupos', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        if (!periodoActivo) {
            return res.status(500).json({ error: 'No hay periodos registrados.' });
        }
        const idPeriodo = req.query.id_periodo || req.session.periodoSeleccionado || String(periodoActivo.id_periodo);
        const params = [idPeriodo];
        let filtroExtra = '';
        if (!esAdmin(req.session.usuario)) {
            if (req.session.usuario.nombre_rol === 'profesor') {
                const idProfesor = await getProfesorId(pool, req.session.usuario.id_usuario);
                if (!idProfesor) return res.json({ idPeriodo: String(idPeriodo), periodoNombre: periodoActivo.nombre, grupos: [] });
                params.push(idProfesor);
                filtroExtra = ` AND pmp.id_profesor = $${params.length}`;
            } else if (req.session.usuario.nombre_rol === 'estudiante') {
                const idPropio = await getEstudianteId(pool, req.session.usuario.id_usuario);
                if (!idPropio) return res.json({ idPeriodo: String(idPeriodo), periodoNombre: periodoActivo.nombre, grupos: [] });
                params.push(idPropio);
                filtroExtra = ` AND EXISTS (
                    SELECT 1 FROM matriculas m2
                    WHERE m2.id_periodo = pmp.id_periodo AND m2.id_estudiante = $${params.length}
                      AND (pmp.id_curso IS NULL OR m2.id_curso IS NULL OR m2.id_curso = pmp.id_curso)
                )`;
            }
        }
        const r = await pool.query(
            `SELECT m.id_materia, m.nombre AS materia,
                    c.id_curso, c.nombre AS curso, c.paralelo,
                    COUNT(DISTINCT CASE
                        WHEN pmp.id_curso IS NULL OR mat.id_curso IS NULL OR mat.id_curso = pmp.id_curso
                        THEN mat.id_estudiante END)::int AS n_estudiantes
             FROM profesor_materia_periodo pmp
             JOIN materias m ON m.id_materia = pmp.id_materia
             LEFT JOIN cursos c ON c.id_curso = pmp.id_curso
             LEFT JOIN matriculas mat ON mat.id_periodo = pmp.id_periodo
             WHERE pmp.id_periodo = $1${filtroExtra}
             GROUP BY m.id_materia, m.nombre, c.id_curso, c.nombre, c.paralelo
             ORDER BY m.nombre, c.nombre NULLS FIRST, c.paralelo NULLS FIRST`,
            params
        );
        const periodoSel = await pool.query(
            'SELECT nombre FROM periodos_academicos WHERE id_periodo = $1', [idPeriodo]
        );
        res.json({
            idPeriodo: String(idPeriodo),
            periodoNombre: periodoSel.rows[0]?.nombre || periodoActivo.nombre,
            grupos: r.rows
        });
    } catch (error) {
        console.error('Error al listar grupos:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los grupos.' });
    }
});

// GET /api/consulta/grupo?id_materia=&id_periodo=&id_curso=&page=
// Nomina paginada (10) del bloque. Profesor: solo sus grupos.
// Representante: solo sus hijos. Estudiante: solo el mismo.
router.get('/grupo', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        if (!periodoActivo) {
            return res.status(500).json({ error: 'No hay periodos registrados.' });
        }
        const idPeriodo = req.query.id_periodo || req.session.periodoSeleccionado || String(periodoActivo.id_periodo);
        const idMateria = req.query.id_materia || '';
        const idCurso = req.query.id_curso || '';
        if (!idMateria) return res.status(400).json({ error: 'Falta id_materia.' });

        // El bloque debe existir como asignacion del periodo.
        const rAsg = await pool.query(
            `SELECT id_profesor FROM profesor_materia_periodo
             WHERE id_periodo = $1 AND id_materia = $2
               AND (( $3 = '' AND id_curso IS NULL) OR (id_curso = NULLIF($3, '')::int))`,
            [idPeriodo, idMateria, idCurso]
        );
        if (rAsg.rows.length === 0) {
            return res.status(404).json({ error: 'Ese grupo (materia y paralelo) no existe en el periodo.' });
        }
        if (req.session.usuario.nombre_rol === 'profesor') {
            const idProfesor = await getProfesorId(pool, req.session.usuario.id_usuario);
            const propia = rAsg.rows.some((a) => String(a.id_profesor) === String(idProfesor));
            if (!propia) {
                return res.status(403).json({ error: 'Ese grupo no te esta asignado.' });
            }
        }

        let where = 'WHERE mat.id_periodo = $1';
        const params = [idPeriodo];
        if (idCurso !== '') {
            where += ` AND (mat.id_curso = $${params.length + 1} OR mat.id_curso IS NULL)`;
            params.push(idCurso);
        }
        if (req.session.usuario.nombre_rol === 'representante') {
            const rep = await pool.query(
                'SELECT id_representante FROM representantes WHERE id_usuario = $1',
                [req.session.usuario.id_usuario]
            );
            if (rep.rows.length > 0) {
                where += ` AND e.id_representante = $${params.length + 1}`;
                params.push(rep.rows[0].id_representante);
            } else {
                where += ' AND 1 = 0';
            }
        }
        if (req.session.usuario.nombre_rol === 'estudiante') {
            const idPropio = await getEstudianteId(pool, req.session.usuario.id_usuario);
            if (idPropio) {
                where += ` AND e.id_estudiante = $${params.length + 1}`;
                params.push(idPropio);
            } else {
                where += ' AND 1 = 0';
            }
        }
        const countResult = await pool.query(
            `SELECT COUNT(DISTINCT e.id_estudiante) AS total
             FROM matriculas mat
             JOIN estudiantes e ON e.id_estudiante = mat.id_estudiante
             ${where}`,
            params
        );
        const total = parseInt(countResult.rows[0].total);
        const { page, limit, offset } = leerPaginacion(req.query, { porDefecto: 10, minimo: 5 });
        const rEst = await pool.query(
            `SELECT DISTINCT e.id_estudiante, e.nombres, e.apellidos,
                    cu.nombre AS curso, cu.paralelo
             FROM matriculas mat
             JOIN estudiantes e ON e.id_estudiante = mat.id_estudiante
             LEFT JOIN cursos cu ON cu.id_curso = mat.id_curso
             ${where}
             ORDER BY e.apellidos, e.nombres
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );
        const rMat = await pool.query('SELECT nombre FROM materias WHERE id_materia = $1', [idMateria]);
        res.json({
            ...respuestaPaginada(rEst.rows, { page, limit, total }),
            idPeriodo: String(idPeriodo),
            idMateria: String(idMateria),
            idCurso: String(idCurso || ''),
            materia: rMat.rows[0]?.nombre || ''
        });
    } catch (error) {
        console.error('Error al cargar nomina del grupo:', error.message);
        res.status(500).json({ error: 'No se pudo cargar la nomina.' });
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
        let idEstudiante = req.query.id_estudiante || '';
        const idMateria = req.query.id_materia || '';

        // Estudiante: ignora el parametro y usa el propio siempre.
        // Sin vinculo estudiante-usuario no ve ningun detalle.
        const propioDetalle = await idPropioEstudiante(req);
        if (propioDetalle !== undefined) {
            idEstudiante = propioDetalle ? String(propioDetalle) : '';
        }

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
        let materiasTotales = 0;
        let materiasConNotas = 0;

        if (idEstudiante) {
            // Curso del estudiante en el periodo (puede ser NULL).
            const rCur = await pool.query(
                'SELECT id_curso FROM matriculas WHERE id_estudiante = $1 AND id_periodo = $2',
                [idEstudiante, idPeriodo]
            );
            const idCursoEst = rCur.rows.length > 0 ? rCur.rows[0].id_curso : null;

            // Materias DEL ESTUDIANTE: asignadas en el periodo y de su
            // curso (o generales sin curso). No todas las materias son
            // de todos los estudiantes: la matricula sola no basta.
            const rMat = await pool.query(
                `SELECT DISTINCT mat.id_materia, mat.nombre
                 FROM profesor_materia_periodo pmp
                 JOIN materias mat ON mat.id_materia = pmp.id_materia
                 WHERE pmp.id_periodo = $1
                   AND (pmp.id_curso IS NULL OR pmp.id_curso = $2 OR $2 IS NULL)
                 ORDER BY mat.nombre`,
                [idPeriodo, idCursoEst]
            );
            materiasFiltro = rMat.rows;
            materiasTotales = rMat.rows.length;
            const idMateriaValida = idMateria !== '' &&
                rMat.rows.some((m) => String(m.id_materia) === String(idMateria))
                ? idMateria : '';

            let sqlNotas = `SELECT c.id_materia, mat.nombre AS materia,
                                   te.nombre AS tipo_evaluacion, c.valor
                            FROM calificaciones c
                            JOIN materias mat ON mat.id_materia = c.id_materia
                            JOIN tipos_evaluacion te ON te.id_tipo_evaluacion = c.id_tipo_evaluacion
                            WHERE c.id_estudiante = $1 AND c.id_periodo = $2`;
            const params = [idEstudiante, idPeriodo];
            if (idMateriaValida !== '') {
                sqlNotas += ' AND c.id_materia = $3';
                params.push(idMateriaValida);
            }
            sqlNotas += ' ORDER BY mat.nombre, te.nombre';
            const resultadoNotas = await pool.query(sqlNotas, params);

            // Se parte de TODAS sus materias (aunque no tengan notas)
            // para mostrar "Sin calificar" en vez de ocultarlas.
            const materiasMap = new Map();
            const baseMaterias = idMateriaValida !== ''
                ? rMat.rows.filter((m) => String(m.id_materia) === String(idMateriaValida))
                : rMat.rows;
            baseMaterias.forEach(function(m) {
                materiasMap.set(m.id_materia, {
                    id_materia: m.id_materia,
                    nombre: m.nombre,
                    parciales: [],
                    promedio: null,
                    escala: 'Sin calificar',
                    sin_notas: true
                });
            });
            resultadoNotas.rows.forEach(function(fila) {
                if (!materiasMap.has(fila.id_materia)) {
                    return;
                }
                materiasMap.get(fila.id_materia).parciales.push({
                    tipo: fila.tipo_evaluacion,
                    valor: fila.valor
                });
            });
            materias = Array.from(materiasMap.values());

            for (const materia of materias) {
                try {
                    const resultadoProm = await pool.query(
                        'SELECT fn_promedio_materia($1, $2, $3) AS promedio',
                        [idEstudiante, materia.id_materia, idPeriodo]
                    );
                    materia.promedio = resultadoProm.rows[0].promedio;
                    materia.escala = await escalaOficial(pool, materia.promedio);
                    materia.sin_notas = false;
                    materiasConNotas += 1;
                } catch (error) {
                    // P0001 = sin calificaciones: se queda "Sin calificar".
                    if (error.code !== 'P0001') {
                        throw error;
                    }
                }
                if (String(materia.id_materia) === String(idMateriaValida)) {
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
            materiasTotales,
            materiasConNotas,
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
