// =========================================================
// routes/asignaciones.js — asignar materias y cursos a
// profesores por periodo (solo admin). Un profesor puede
// llevar N materias/cursos; cada materia en un curso/periodo
// la dicta UN solo profesor (UNIQUE en BD -> 409).
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole, setUsuarioAuditoria } = require('../middleware/auth');
const { getPeriodoActivo } = require('../helpers/contexto');

// GET /api/asignaciones?id_periodo= -> asignaciones del periodo
router.get('/', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        const idPeriodo = req.query.id_periodo || (periodoActivo && periodoActivo.id_periodo);
        if (!idPeriodo) return res.json({ asignaciones: [] });
        const r = await pool.query(
            `SELECT pmp.id_asignacion, pmp.id_profesor, pmp.id_materia, pmp.id_curso, pmp.id_periodo,
                    (u.nombres || ' ' || u.apellidos) AS profesor,
                    m.nombre AS materia, c.nombre AS curso, c.paralelo
             FROM profesor_materia_periodo pmp
             JOIN profesores pr ON pr.id_profesor = pmp.id_profesor
             JOIN usuarios u ON u.id_usuario = pr.id_usuario
             JOIN materias m ON m.id_materia = pmp.id_materia
             LEFT JOIN cursos c ON c.id_curso = pmp.id_curso
             WHERE pmp.id_periodo = $1
             ORDER BY u.apellidos, u.nombres, m.nombre`,
            [idPeriodo]
        );
        res.json({ asignaciones: r.rows });
    } catch (error) {
        console.error('Error al listar asignaciones:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar las asignaciones.' });
    }
});

// GET /api/asignaciones/opciones?id_periodo= -> profesores,
// materias y cursos para los selects del formulario
router.get('/opciones', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        const idPeriodo = req.query.id_periodo || (periodoActivo && periodoActivo.id_periodo);
        const [profesores, materias, cursos] = await Promise.all([
            pool.query(
                `SELECT pr.id_profesor, (u.nombres || ' ' || u.apellidos) AS nombre
                 FROM profesores pr JOIN usuarios u ON u.id_usuario = pr.id_usuario
                 ORDER BY u.apellidos, u.nombres`
            ),
            pool.query('SELECT id_materia, nombre FROM materias ORDER BY nombre'),
            idPeriodo
                ? pool.query(
                    'SELECT id_curso, nombre, paralelo FROM cursos WHERE id_periodo = $1 ORDER BY nombre, paralelo',
                    [idPeriodo])
                : { rows: [] }
        ]);
        res.json({ profesores: profesores.rows, materias: materias.rows, cursos: cursos.rows });
    } catch (error) {
        console.error('Error al cargar opciones:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar las opciones.' });
    }
});

// POST /api/asignaciones -> asignar (admin)
router.post('/', requireAuth, requireRole('administrador'), async (req, res) => {
    const { id_profesor, id_materia, id_periodo, id_curso } = req.body || {};
    if (!id_profesor || !id_materia || !id_periodo) {
        return res.status(400).json({ error: 'Profesor, materia y periodo son obligatorios.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            `INSERT INTO profesor_materia_periodo (id_profesor, id_materia, id_periodo, id_curso)
             VALUES ($1, $2, $3, $4) RETURNING id_asignacion`,
            [id_profesor, id_materia, id_periodo, id_curso || null]
        );
        await client.query('COMMIT');
        res.status(201).json({ ok: true, id_asignacion: r.rows[0].id_asignacion });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505' || error.code === '23503') {
            return res.status(409).json({
                error: 'No se pudo asignar: esa materia en ese curso/periodo ya la dicta otro profesor (o algún dato no existe).'
            });
        }
        res.status(500).json({ error: 'No se pudo guardar la asignacion.' });
    } finally {
        client.release();
    }
});

// DELETE /api/asignaciones/:id -> quitar asignacion (admin)
router.delete('/:id', requireAuth, requireRole('administrador'), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            'DELETE FROM profesor_materia_periodo WHERE id_asignacion = $1 RETURNING id_asignacion',
            [req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Asignacion no encontrada.' });
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Asignacion eliminada correctamente.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al eliminar asignacion:', error.message);
        res.status(500).json({ error: 'No se pudo eliminar la asignacion.' });
    } finally {
        client.release();
    }
});

module.exports = router;
