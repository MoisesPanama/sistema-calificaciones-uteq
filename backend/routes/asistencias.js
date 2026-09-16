// =========================================================
// routes/asistencias.js — Registro de faltas (S4 super plan).
// Solo se registran AUSENCIAS (presencia se asume); UNIQUE
// evita duplicar el mismo dia. Ven: admin, profesor,
// representante propio y estudiante propio. Escriben:
// admin y profesor con la materia asignada.
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');
const { getMateriasPermitidas, getEstudianteId } = require('../helpers/contexto');

async function materiaAsignada(usuario, idPeriodo, idMateria) {
    if (usuario.nombre_rol === 'administrador') return true;
    if (usuario.nombre_rol !== 'profesor') return false;
    const permitidas = await getMateriasPermitidas(pool, usuario, idPeriodo);
    return permitidas.some((m) => String(m.id_materia) === String(idMateria));
}

async function estudianteVisible(usuario, idEstudiante, idPeriodo) {
    if (['administrador', 'profesor'].includes(usuario.nombre_rol)) return true;
    if (usuario.nombre_rol === 'representante') {
        const r = await pool.query(
            `SELECT 1 FROM estudiantes e
             JOIN representantes r ON r.id_representante = e.id_representante
             WHERE e.id_estudiante = $1 AND r.id_usuario = $2`,
            [idEstudiante, usuario.id_usuario]
        );
        return r.rows.length > 0;
    }
    if (usuario.nombre_rol === 'estudiante') {
        return String(await getEstudianteId(pool, usuario.id_usuario)) === String(idEstudiante);
    }
    return false;
}

// GET /api/asistencias?id_estudiante=&id_materia=&id_periodo=
// Lista + resumen { total, justificadas }.
router.get('/', requireAuth, async (req, res) => {
    try {
        const { id_estudiante, id_materia, id_periodo } = req.query;
        if (!id_estudiante || !id_materia || !id_periodo) {
            return res.status(400).json({ error: 'Faltan id_estudiante, id_materia o id_periodo.' });
        }
        if (!await estudianteVisible(req.session.usuario, id_estudiante, id_periodo)) {
            return res.status(403).json({ error: 'No tienes acceso a estas faltas.' });
        }
        const r = await pool.query(
            `SELECT id_asistencia, fecha, motivo,
                    (u.nombres || ' ' || u.apellidos) AS registrada_por
             FROM asistencias a
             LEFT JOIN usuarios u ON u.id_usuario = a.registrado_por
             WHERE id_estudiante = $1 AND id_materia = $2 AND id_periodo = $3
             ORDER BY fecha DESC`,
            [id_estudiante, id_materia, id_periodo]
        );
        const total = r.rows.length;
        const justificadas = r.rows.filter((f) => f.motivo === 'justificada').length;
        res.json({ faltas: r.rows, resumen: { total, justificadas, injustificadas: total - justificadas } });
    } catch (error) {
        console.error('Error al listar faltas:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar las faltas.' });
    }
});

// POST /api/asistencias -> registrar falta de un dia
router.post('/', requireAuth, async (req, res) => {
    const { id_estudiante, id_materia, id_periodo, fecha, motivo } = req.body || {};
    if (!id_estudiante || !id_materia || !id_periodo) {
        return res.status(400).json({ error: 'Faltan id_estudiante, id_materia o id_periodo.' });
    }
    if (motivo && !['falta', 'justificada'].includes(motivo)) {
        return res.status(400).json({ error: 'Motivo no valido: falta o justificada.' });
    }
    if (!(await materiaAsignada(req.session.usuario, id_periodo, id_materia))) {
        return res.status(403).json({ error: 'No tienes asignada esta materia en el periodo.' });
    }
    const client = await pool.connect();
    try {
        const rMat = await client.query(
            'SELECT id_matricula FROM matriculas WHERE id_estudiante = $1 AND id_periodo = $2',
            [id_estudiante, id_periodo]
        );
        if (rMat.rows.length === 0) {
            return res.status(400).json({ error: 'El estudiante no esta matriculado en este periodo.' });
        }
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            `INSERT INTO asistencias (id_estudiante, id_materia, id_periodo, fecha, motivo, registrado_por)
             VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6)
             RETURNING id_asistencia`,
            [id_estudiante, id_materia, id_periodo, fecha || null,
             motivo || 'falta', req.session.usuario.id_usuario]
        );
        await client.query('COMMIT');
        res.status(201).json({ ok: true, id_asistencia: r.rows[0].id_asistencia });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya hay una falta registrada ese dia.' });
        }
        console.error('Error al registrar falta:', error.message);
        res.status(500).json({ error: 'No se pudo registrar la falta.' });
    } finally {
        client.release();
    }
});

// DELETE /api/asistencias/:id -> quitar falta
router.delete('/:id', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const r = await client.query(
            'SELECT id_asistencia, id_materia, id_periodo FROM asistencias WHERE id_asistencia = $1',
            [req.params.id]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Falta no encontrada.' });
        if (!(await materiaAsignada(req.session.usuario, r.rows[0].id_periodo, r.rows[0].id_materia))) {
            return res.status(403).json({ error: 'No tienes asignada esta materia en el periodo.' });
        }
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        await client.query('DELETE FROM asistencias WHERE id_asistencia = $1', [req.params.id]);
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Falta eliminada.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al eliminar falta:', error.message);
        res.status(500).json({ error: 'No se pudo eliminar la falta.' });
    } finally {
        client.release();
    }
});

module.exports = router;
