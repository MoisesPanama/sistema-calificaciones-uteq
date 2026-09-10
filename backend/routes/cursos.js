// =========================================================
// routes/cursos.js — CRUD de cursos (maestro de datos, Fase 6)
// Lectura: cualquier autenticado. Escritura: solo admin.
// Regla: no se elimina un curso con matriculas o asignaciones
// (409); no existe borrado fisico con notas asociadas.
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole, setUsuarioAuditoria } = require('../middleware/auth');
const { getPeriodoActivo } = require('../helpers/contexto');

async function existePeriodo(conn, idPeriodo) {
    const r = await conn.query('SELECT id_periodo FROM periodos_academicos WHERE id_periodo = $1', [idPeriodo]);
    return r.rows.length > 0;
}

// GET /api/cursos?id_periodo= -> listado del periodo (activo por defecto)
router.get('/', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        const idPeriodo = req.query.id_periodo || (periodoActivo && periodoActivo.id_periodo);
        if (!idPeriodo) return res.json({ cursos: [] });
        const r = await pool.query(
            `SELECT c.id_curso, c.nombre, c.paralelo, c.id_periodo, c.id_tutor,
                    (p.nombres || ' ' || p.apellidos) AS tutor
             FROM cursos c
             LEFT JOIN profesores pr ON pr.id_profesor = c.id_tutor
             LEFT JOIN usuarios p ON p.id_usuario = pr.id_usuario
             WHERE c.id_periodo = $1
             ORDER BY c.nombre, c.paralelo`,
            [idPeriodo]
        );
        res.json({ cursos: r.rows });
    } catch (error) {
        console.error('Error al listar cursos:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los cursos.' });
    }
});

// GET /api/cursos/tutores -> profesores para el select de tutor
router.get('/tutores', requireAuth, async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT pr.id_profesor, (u.nombres || ' ' || u.apellidos) AS nombre
             FROM profesores pr
             JOIN usuarios u ON u.id_usuario = pr.id_usuario
             ORDER BY u.apellidos, u.nombres`
        );
        res.json({ tutores: r.rows });
    } catch (error) {
        console.error('Error al listar tutores:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los tutores.' });
    }
});

function validarCurso(body) {
    const errores = [];
    if (!body.nombre || String(body.nombre).trim() === '') errores.push('El nombre del curso es obligatorio.');
    if (!body.id_periodo) errores.push('El periodo es obligatorio.');
    return errores;
}

// POST /api/cursos -> crear (admin)
router.post('/', requireAuth, requireRole('administrador'), async (req, res) => {
    const { nombre, paralelo, id_periodo, id_tutor } = req.body || {};
    const errores = validarCurso(req.body || {});
    if (errores.length > 0) return res.status(400).json({ error: errores.join(' '), errores });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        if (!await existePeriodo(client, id_periodo)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'El periodo indicado no existe.' });
        }
        if (id_tutor) {
            const t = await client.query('SELECT id_profesor FROM profesores WHERE id_profesor = $1', [id_tutor]);
            if (t.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'El tutor indicado no existe.' });
            }
        }
        const r = await client.query(
            'INSERT INTO cursos (nombre, paralelo, id_periodo, id_tutor) VALUES ($1, $2, $3, $4) RETURNING id_curso',
            [String(nombre).trim(), paralelo || 'A', id_periodo, id_tutor || null]
        );
        await client.query('COMMIT');
        res.status(201).json({ ok: true, id_curso: r.rows[0].id_curso });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al crear curso:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe ese curso y paralelo en el periodo.' });
        }
        res.status(500).json({ error: 'No se pudo guardar el curso.' });
    } finally {
        client.release();
    }
});

// PUT /api/cursos/:id -> editar (admin)
router.put('/:id', requireAuth, requireRole('administrador'), async (req, res) => {
    const { nombre, paralelo, id_tutor } = req.body || {};
    if (!nombre || String(nombre).trim() === '') {
        return res.status(400).json({ error: 'El nombre del curso es obligatorio.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        if (id_tutor) {
            const t = await client.query('SELECT id_profesor FROM profesores WHERE id_profesor = $1', [id_tutor]);
            if (t.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'El tutor indicado no existe.' });
            }
        }
        const r = await client.query(
            'UPDATE cursos SET nombre = $1, paralelo = $2, id_tutor = $3 WHERE id_curso = $4 RETURNING id_curso',
            [String(nombre).trim(), paralelo || 'A', id_tutor || null, req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Curso no encontrado.' });
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Curso actualizado correctamente.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al editar curso:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe ese curso y paralelo en el periodo.' });
        }
        res.status(500).json({ error: 'No se pudo editar el curso.' });
    } finally {
        client.release();
    }
});

// DELETE /api/cursos/:id -> eliminar (admin), bloqueado con uso
router.delete('/:id', requireAuth, requireRole('administrador'), async (req, res) => {
    const client = await pool.connect();
    try {
        const uso = await client.query(
            `SELECT (SELECT COUNT(*) FROM matriculas WHERE id_curso = $1)::int AS matriculas,
                    (SELECT COUNT(*) FROM profesor_materia_periodo WHERE id_curso = $1)::int AS asignaciones`,
            [req.params.id]
        );
        if (uso.rows[0].matriculas > 0 || uso.rows[0].asignaciones > 0) {
            return res.status(409).json({
                error: 'No se puede eliminar: el curso tiene estudiantes matriculados o materias asignadas.'
            });
        }
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query('DELETE FROM cursos WHERE id_curso = $1 RETURNING id_curso', [req.params.id]);
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Curso no encontrado.' });
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Curso eliminado correctamente.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al eliminar curso:', error.message);
        res.status(500).json({ error: 'No se pudo eliminar el curso.' });
    } finally {
        client.release();
    }
});

module.exports = router;
