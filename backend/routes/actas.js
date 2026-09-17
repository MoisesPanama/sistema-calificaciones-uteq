// =========================================================
// routes/actas.js — Actas de validacion (S1 super plan).
// Un acta VALIDADA congela su contexto (materia/periodo y,
// opcionalmente, curso/ciclo/parcial): el SP rechaza nuevas
// notas ahi. Lectura: autenticados. Escritura: solo admin.
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole, setUsuarioAuditoria } = require('../middleware/auth');
const { getPeriodoActivo, periodoDe } = require('../helpers/contexto');

// GET /api/actas?id_periodo= -> actas del periodo con conteos
router.get('/', requireAuth, async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        const idPeriodo = await periodoDe(req);
        if (!idPeriodo) return res.json({ actas: [] });
        const r = await pool.query(
            `SELECT a.id_acta, a.id_periodo, a.id_materia, a.id_curso, a.id_ciclo, a.id_parcial,
                    a.estado, a.fecha_validacion, a.fecha_creacion,
                    m.nombre AS materia, c.nombre AS curso, c.paralelo,
                    ci.nombre AS ciclo, p.nombre AS parcial,
                    (u.nombres || ' ' || u.apellidos) AS validada_por_nombre,
                    (SELECT COUNT(*)::int FROM calificaciones cal
                      JOIN matriculas mm ON mm.id_estudiante = cal.id_estudiante
                        AND mm.id_periodo = cal.id_periodo
                      WHERE cal.id_periodo = a.id_periodo AND cal.id_materia = a.id_materia
                        AND (a.id_curso IS NULL OR mm.id_curso = a.id_curso OR mm.id_curso IS NULL)
                        AND (a.id_ciclo IS NULL OR cal.id_ciclo = a.id_ciclo)
                        AND (a.id_parcial IS NULL OR cal.id_parcial = a.id_parcial)) AS n_notas
             FROM actas a
             JOIN materias m ON m.id_materia = a.id_materia
             LEFT JOIN cursos c ON c.id_curso = a.id_curso
             LEFT JOIN ciclos_evaluativos ci ON ci.id_ciclo = a.id_ciclo
             LEFT JOIN parciales p ON p.id_parcial = a.id_parcial
             LEFT JOIN usuarios u ON u.id_usuario = a.validada_por
             WHERE a.id_periodo = $1
             ORDER BY m.nombre, a.fecha_creacion DESC`,
            [idPeriodo]
        );
        res.json({ actas: r.rows });
    } catch (error) {
        console.error('Error al listar actas:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar las actas.' });
    }
});

// POST /api/actas -> crear (admin, nace en borrador)
router.post('/', requireAuth, requireRole('administrador'), async (req, res) => {
    const { id_periodo, id_materia, id_curso, id_ciclo, id_parcial } = req.body || {};
    if (!id_periodo || !id_materia) {
        return res.status(400).json({ error: 'Periodo y materia son obligatorios.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            `INSERT INTO actas (id_periodo, id_materia, id_curso, id_ciclo, id_parcial)
             VALUES ($1, $2, $3, $4, $5) RETURNING id_acta`,
            [id_periodo, id_materia, id_curso || null, id_ciclo || null, id_parcial || null]
        );
        await client.query('COMMIT');
        res.status(201).json({ ok: true, id_acta: r.rows[0].id_acta });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al crear acta:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un acta para ese contexto.' });
        }
        if (error.code === '23503') {
            return res.status(400).json({ error: 'Periodo, materia, curso, ciclo o parcial inexistente.' });
        }
        res.status(500).json({ error: 'No se pudo crear el acta.' });
    } finally {
        client.release();
    }
});

// POST /api/actas/:id/validar -> congela el contexto (admin)
router.post('/:id/validar', requireAuth, requireRole('administrador'), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            `UPDATE actas SET estado = 'validada', validada_por = $1, fecha_validacion = NOW()
             WHERE id_acta = $2 AND estado = 'borrador'
             RETURNING id_acta`,
            [req.session.usuario.id_usuario, req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Acta no encontrada o ya validada.' });
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Acta validada: el contexto queda congelado.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al validar acta:', error.message);
        res.status(500).json({ error: 'No se pudo validar el acta.' });
    } finally {
        client.release();
    }
});

// DELETE /api/actas/:id -> eliminar solo en borrador (admin)
router.delete('/:id', requireAuth, requireRole('administrador'), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            `DELETE FROM actas WHERE id_acta = $1 AND estado = 'borrador' RETURNING id_acta`,
            [req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Acta no encontrada o ya validada (no se puede borrar).' });
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Acta eliminada.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al eliminar acta:', error.message);
        res.status(500).json({ error: 'No se pudo eliminar el acta.' });
    } finally {
        client.release();
    }
});

module.exports = router;
