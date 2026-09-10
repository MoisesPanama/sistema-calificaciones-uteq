const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');
const { getPeriodoActivo } = require('../helpers/contexto');
const { leerPaginacion, respuestaPaginada } = require('../helpers/paginacion');

// GET /api/matriculas?id_periodo=&id_curso=&q=&page=&limit=
router.get('/', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        const idPeriodo = req.query.id_periodo || req.session.periodoSeleccionado || String(periodoActivo?.id_periodo || '');
        const idCurso = req.query.id_curso || '';
        const q = (req.query.q || '').trim();
        const { page, limit, offset } = leerPaginacion(req.query, { porDefecto: 15, minimo: 5 });

        let where = 'WHERE m.id_periodo = $1';
        const params = [idPeriodo];

        if (idCurso !== '') {
            params.push(idCurso);
            where += ` AND m.id_curso = $${params.length}`;
        }

        if (q) {
            params.push(`%${q}%`);
            where += ` AND (e.nombres ILIKE $${params.length} OR e.apellidos ILIKE $${params.length}
                       OR e.cedula ILIKE $${params.length} OR (e.nombres || ' ' || e.apellidos) ILIKE $${params.length})`;
        }

        const countResult = await pool.query(
            `SELECT COUNT(*)::int AS total
             FROM matriculas m
             JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
             ${where}`, params
        );
        const total = countResult.rows[0].total;

        const r = await pool.query(
            `SELECT m.id_matricula, m.id_estudiante, m.id_periodo, m.id_curso,
                    e.cedula, e.nombres, e.apellidos, e.activo,
                    c.nombre AS curso_nombre, c.paralelo
             FROM matriculas m
             JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
             LEFT JOIN cursos c ON c.id_curso = m.id_curso
             ${where}
             ORDER BY e.apellidos, e.nombres
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );

        res.json(respuestaPaginada(r.rows, { page, limit, total }));
    } catch (error) {
        console.error('Error al listar matriculas:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar las matriculas.' });
    }
});

// GET /api/matriculas/opciones?id_periodo= — estudiantes no matriculados + cursos
router.get('/opciones', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        const idPeriodo = req.query.id_periodo || req.session.periodoSeleccionado || String(periodoActivo?.id_periodo || '');

        const rEst = await pool.query(
            `SELECT e.id_estudiante, e.cedula, e.nombres, e.apellidos
             FROM estudiantes e
             WHERE e.activo = true
               AND NOT EXISTS (
                 SELECT 1 FROM matriculas m
                 WHERE m.id_estudiante = e.id_estudiante AND m.id_periodo = $1
               )
             ORDER BY e.apellidos, e.nombres`,
            [idPeriodo]
        );

        const rCur = await pool.query(
            `SELECT id_curso, nombre, paralelo
             FROM cursos WHERE id_periodo = $1
             ORDER BY nombre, paralelo`,
            [idPeriodo]
        );

        res.json({
            estudiantes: rEst.rows,
            cursos: rCur.rows
        });
    } catch (error) {
        console.error('Error al cargar opciones de matriculas:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar las opciones.' });
    }
});

// POST /api/matriculas/ — matricular estudiante
router.post('/', requireAuth, async (req, res) => {
    const { id_estudiante, id_periodo, id_curso } = req.body || {};
    if (!id_estudiante || !id_periodo) {
        return res.status(400).json({ error: 'Falta id_estudiante o id_periodo.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);

        const r = await client.query(
            `INSERT INTO matriculas (id_estudiante, id_periodo, id_curso)
             VALUES ($1, $2, $3)
             RETURNING id_matricula`,
            [id_estudiante, id_periodo, id_curso || null]
        );

        await client.query('COMMIT');
        res.status(201).json({ ok: true, id_matricula: r.rows[0].id_matricula });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al matricular:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'El estudiante ya esta matriculado en este periodo.' });
        }
        res.status(500).json({ error: 'No se pudo matricular al estudiante.' });
    } finally {
        client.release();
    }
});

// DELETE /api/matriculas/:id — desmatricular
router.delete('/:id', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);

        const r = await client.query(
            'DELETE FROM matriculas WHERE id_matricula = $1 RETURNING id_matricula',
            [req.params.id]
        );
        await client.query('COMMIT');

        if (r.rowCount === 0) {
            return res.status(404).json({ error: 'Matricula no encontrada.' });
        }
        res.json({ ok: true });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al desmatricular:', error.message);
        res.status(500).json({ error: 'No se pudo eliminar la matricula.' });
    } finally {
        client.release();
    }
});

module.exports = router;
