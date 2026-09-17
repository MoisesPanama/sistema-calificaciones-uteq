// =========================================================
// routes/reportes.js — GET /api/reportes
// Promedios por estudiante en el periodo, con filtros
// opcionales de curso y materia.
// UNA SOLA VERDAD (M8): usa fn_promedio_reporte (alias de la
// oficial) y fn_promedio_general, igual que consulta/boletin.
// Antes calculaba a mano (pesos muertos, sin 80/20) y daba
// otro numero que el boletin para el mismo estudiante.
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getPeriodoActivo, periodoDe } = require('../helpers/contexto');
const { leerPaginacion, respuestaPaginada } = require('../helpers/paginacion');

// Promedio via BD (null si P0001 = sin notas). Nunca a mano.
async function promedioOficial(conn, idEstudiante, idMateria, idPeriodo) {
    try {
        const r = idMateria
            ? await conn.query('SELECT fn_promedio_reporte($1, $2, $3) AS promedio', [idEstudiante, idMateria, idPeriodo])
            : await conn.query('SELECT fn_promedio_general($1, $2) AS promedio', [idEstudiante, idPeriodo]);
        return r.rows[0] ? r.rows[0].promedio : null;
    } catch (error) {
        if (error.code === 'P0001') return null;
        throw error;
    }
}

// Escala oficial con fallback local (igual que consulta).
async function escalaOficial(conn, promedio) {
    try {
        const r = await conn.query('SELECT fn_escala_cualitativa($1) AS escala', [promedio]);
        if (r.rows[0]?.escala) return r.rows[0].escala;
    } catch (_) { /* usa escala local */ }
    if (promedio == null) return 'S/N';
    if (promedio >= 9.0) return 'AD';
    if (promedio >= 7.0) return 'A';
    if (promedio >= 5.0) return 'B';
    if (promedio >= 3.0) return 'C';
    return 'D';
}

// El estudiante NO entra aqui: tiene su consulta propia.
// (psicologo tampoco: usa su vista de rendimiento).
router.get('/', requireAuth, requireRole('administrador', 'profesor', 'representante'), async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        if (!periodoActivo) {
            return res.status(500).json({ error: 'No hay periodos registrados.' });
        }

        const periodos = await pool.query(
            'SELECT id_periodo, nombre FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );

        const idPeriodo = await periodoDe(req);
        const idCurso = req.query.id_curso || '';
        const idMateria = req.query.id_materia || '';

        const periodoSel = periodos.rows.find(p => String(p.id_periodo) === String(idPeriodo));
        const periodoNombre = periodoSel ? periodoSel.nombre : periodoActivo.nombre;

        let cursos = [];
        try {
            const rCursos = await pool.query(
                `SELECT id_curso, nombre, paralelo FROM cursos
                 WHERE id_periodo = $1 ORDER BY nombre, paralelo`,
                [idPeriodo]
            );
            cursos = rCursos.rows;
        } catch (_) { /* cursos table may not exist yet */ }

        const materias = await pool.query(
            'SELECT id_materia, nombre FROM materias ORDER BY nombre'
        );

        let reporte = [];
        let mensajeSinDatos = null;
        let paginacion = null;

        try {
            let whereEst = 'WHERE m.id_periodo = $1';
            const paramsEst = [idPeriodo];

            // Representante: solo ver sus hijos
            if (req.session.usuario.nombre_rol === 'representante') {
                const repResult = await pool.query(
                    'SELECT id_representante FROM representantes WHERE id_usuario = $1',
                    [req.session.usuario.id_usuario]
                );
                if (repResult.rows.length > 0) {
                    whereEst += ' AND e.id_representante = $' + (paramsEst.length + 1);
                    paramsEst.push(repResult.rows[0].id_representante);
                } else {
                    whereEst += ' AND 1 = 0';
                }
            }

            if (idCurso) {
                whereEst += ' AND m.id_curso = $' + (paramsEst.length + 1);
                paramsEst.push(idCurso);
            }

            const countResult = await pool.query(
                `SELECT COUNT(*) AS total
                 FROM matriculas m
                 JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
                 ${whereEst}`,
                paramsEst
            );
            const total = parseInt(countResult.rows[0].total);

            if (total === 0) {
                mensajeSinDatos = 'No hay estudiantes matriculados en este periodo con esos filtros.';
            } else {
                // Se pagina la lista de estudiantes y solo se calculan
                // los promedios de la pagina pedida (evita traer cientos
                // de filas + N queries de promedio de una sola vez).
                const { page, limit, offset } = leerPaginacion(req.query, { porDefecto: 10, minimo: 5 });
                const rEst = await pool.query(
                    `SELECT e.id_estudiante, e.nombres, e.apellidos
                     FROM matriculas m
                     JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
                     ${whereEst}
                     ORDER BY e.apellidos, e.nombres
                     LIMIT $${paramsEst.length + 1} OFFSET $${paramsEst.length + 2}`,
                    [...paramsEst, limit, offset]
                );
                paginacion = { page, limit, total, totalPages: Math.ceil(total / limit) };
                for (const est of rEst.rows) {
                    const promedio = await promedioOficial(pool, est.id_estudiante, idMateria || null, idPeriodo);
                    const escala = await escalaOficial(pool, promedio);
                    reporte.push({
                        id_estudiante: est.id_estudiante,
                        nombres: est.nombres,
                        apellidos: est.apellidos,
                        promedio: promedio,
                        escala: escala
                    });
                }
                reporte.sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1));
            }
        } catch (error) {
            mensajeSinDatos = 'No hay datos suficientes para generar el reporte.';
        }

        res.json({
            periodoActivo,
            periodoNombre,
            periodos: periodos.rows,
            cursos,
            materias: materias.rows,
            ...(paginacion
                ? respuestaPaginada(reporte, paginacion)
                : { datos: [], paginacion: null }),
            mensajeSinDatos,
            idPeriodo: String(idPeriodo),
            idCurso: String(idCurso || ''),
            idMateria: String(idMateria || '')
        });
    } catch (error) {
        console.error('Error al generar reporte:', error.message);
        res.status(500).json({ error: 'No se pudo generar el reporte.' });
    }
});

module.exports = router;
