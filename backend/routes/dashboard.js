// =========================================================
// routes/dashboard.js — GET /api/dashboard (resumen POR ROL)
// Contadores base para todos + bloques especificos:
//  admin: ultimos eventos de auditoria + ultimo respaldo.
//  profesor: mis materias (con estudiantes) + ultimas notas.
//  representante: mis hijos con promedios del periodo.
//  psicologo: conteos por rendimiento del periodo activo.
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getPeriodoActivo, getMateriasPermitidas } = require('../helpers/contexto');

router.get('/', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        const idPeriodo = periodoActivo ? periodoActivo.id_periodo : null;
        const rol = req.session.usuario.nombre_rol;
        const out = { periodoActivo, rol };

        const [estudiantes, materias, periodos, calificaciones] = await Promise.all([
            pool.query('SELECT COUNT(*) AS n FROM estudiantes WHERE activo = TRUE'),
            pool.query('SELECT COUNT(*) AS n FROM materias'),
            pool.query('SELECT COUNT(*) AS n FROM periodos_academicos'),
            pool.query('SELECT COUNT(*) AS n FROM calificaciones')
        ]);
        out.contadores = {
            totalEstudiantes: Number(estudiantes.rows[0].n),
            totalMaterias: Number(materias.rows[0].n),
            totalPeriodos: Number(periodos.rows[0].n),
            totalCalificaciones: Number(calificaciones.rows[0].n)
        };

        if (rol === 'administrador') {
            const eventos = await pool.query(
                `SELECT a.tabla_afectada, a.operacion, a.fecha_evento,
                        u.nombres AS usuario_nombres, u.apellidos AS usuario_apellidos
                 FROM auditoria a
                 LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario_app
                 WHERE a.tabla_afectada NOT IN ('matricula_materias', 'sesiones')
                 ORDER BY a.fecha_evento DESC LIMIT 5`
            );
            let ultimoRespaldo = null;
            try {
                const r = await pool.query(
                    `SELECT fecha, tipo, nombre_archivo, exito FROM respaldo_logs
                     ORDER BY fecha DESC LIMIT 1`
                );
                ultimoRespaldo = r.rows[0] || null;
            } catch (_) { /* migracion 14 pendiente */ }
            out.ultimosEventos = eventos.rows;
            out.ultimoRespaldo = ultimoRespaldo;
        }

        if (rol === 'profesor' && idPeriodo) {
            const rProf = await pool.query(
                'SELECT id_profesor FROM profesores WHERE id_usuario = $1',
                [req.session.usuario.id_usuario]
            );
            const idProfesor = rProf.rows.length > 0 ? rProf.rows[0].id_profesor : null;
            const materias = await getMateriasPermitidas(pool, req.session.usuario, idPeriodo);
            const misMaterias = [];
            for (const m of materias) {
                const rEst = await pool.query(
                    `SELECT COUNT(DISTINCT m.id_estudiante)::int AS n
                     FROM matriculas m
                     JOIN profesor_materia_periodo pmp ON pmp.id_periodo = m.id_periodo
                     WHERE m.id_periodo = $1 AND pmp.id_materia = $2 AND pmp.id_profesor = $3
                       AND (pmp.id_curso IS NULL OR pmp.id_curso = m.id_curso OR m.id_curso IS NULL)`,
                    [idPeriodo, m.id_materia, idProfesor]
                );
                misMaterias.push({ id_materia: m.id_materia, nombre: m.nombre, n_estudiantes: rEst.rows[0].n });
            }
            const ultimas = await pool.query(
                `SELECT c.valor, c.fecha_registro, e.nombres, e.apellidos, mat.nombre AS materia
                 FROM calificaciones c
                 JOIN estudiantes e ON e.id_estudiante = c.id_estudiante
                 JOIN materias mat ON mat.id_materia = c.id_materia
                 WHERE c.registrado_por = $1
                 ORDER BY c.fecha_registro DESC LIMIT 5`,
                [req.session.usuario.id_usuario]
            );
            const totalMias = await pool.query(
                'SELECT COUNT(*) AS n FROM calificaciones WHERE registrado_por = $1',
                [req.session.usuario.id_usuario]
            );
            out.misMaterias = misMaterias;
            out.ultimasNotas = ultimas.rows;
            out.totalNotasMias = Number(totalMias.rows[0].n);
        }

        if (rol === 'representante') {
            const rRep = await pool.query(
                'SELECT id_representante FROM representantes WHERE id_usuario = $1',
                [req.session.usuario.id_usuario]
            );
            const hijos = [];
            if (rRep.rows.length > 0 && idPeriodo) {
                const rHijos = await pool.query(
                    `SELECT DISTINCT e.id_estudiante, e.nombres, e.apellidos
                     FROM estudiantes e
                     JOIN matriculas m ON m.id_estudiante = e.id_estudiante
                     WHERE e.id_representante = $1 AND m.id_periodo = $2
                     ORDER BY e.apellidos, e.nombres`,
                    [rRep.rows[0].id_representante, idPeriodo]
                );
                for (const h of rHijos.rows) {
                    let promedio = null;
                    try {
                        const rP = await pool.query(
                            'SELECT fn_promedio_general($1, $2) AS promedio',
                            [h.id_estudiante, idPeriodo]
                        );
                        promedio = rP.rows[0].promedio;
                    } catch (_) { /* sin notas */ }
                    hijos.push({ ...h, promedio });
                }
            }
            out.hijos = hijos;
        }

        if (rol === 'psicologo' && idPeriodo) {
            const r = await pool.query(
                `SELECT COUNT(DISTINCT CASE WHEN mm.promedio < 7 THEN m.id_estudiante END)::int AS bajos,
                        COUNT(DISTINCT CASE WHEN mm.promedio >= 7 THEN m.id_estudiante END)::int AS bien,
                        COUNT(DISTINCT m.id_estudiante)::int AS evaluados
                 FROM matricula_materias mm
                 JOIN matriculas m ON m.id_matricula = mm.id_matricula
                 WHERE m.id_periodo = $1 AND mm.promedio IS NOT NULL`,
                [idPeriodo]
            );
            out.rendimiento = r.rows[0];
        }

        res.json(out);
    } catch (error) {
        console.error('Error en dashboard:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el resumen del sistema.' });
    }
});

module.exports = router;
