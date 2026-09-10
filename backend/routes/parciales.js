// =========================================================
// routes/parciales.js — CRUD de parciales (Fase 6)
// Lectura: cualquier autenticado. Escritura: solo admin.
// Reglas: orden unico por ciclo (UNIQUE en BD), no eliminar
// con notas asociadas (409).
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole, setUsuarioAuditoria } = require('../middleware/auth');

function validarParcial(body) {
    const errores = [];
    if (!body.nombre || String(body.nombre).trim() === '') errores.push('El nombre del parcial es obligatorio.');
    if (!body.id_ciclo) errores.push('El ciclo es obligatorio.');
    if (body.orden === undefined || body.orden === null || !Number.isInteger(Number(body.orden)) || Number(body.orden) <= 0) {
        errores.push('El orden debe ser un entero mayor que cero.');
    }
    return errores;
}

// GET /api/parciales?id_ciclo= -> listado del ciclo
router.get('/', requireAuth, async (req, res) => {
    try {
        const idCiclo = req.query.id_ciclo || '';
        if (!idCiclo) return res.status(400).json({ error: 'Falta id_ciclo.' });
        const r = await pool.query(
            `SELECT p.id_parcial, p.nombre, p.orden, p.id_ciclo,
                    (SELECT COUNT(*) FROM calificaciones c WHERE c.id_parcial = p.id_parcial)::int AS n_notas
             FROM parciales p
             WHERE p.id_ciclo = $1
             ORDER BY p.orden`,
            [idCiclo]
        );
        res.json({ parciales: r.rows });
    } catch (error) {
        console.error('Error al listar parciales:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los parciales.' });
    }
});

// POST /api/parciales -> crear (admin)
router.post('/', requireAuth, requireRole('administrador'), async (req, res) => {
    const { nombre, orden, id_ciclo } = req.body || {};
    const errores = validarParcial(req.body || {});
    if (errores.length > 0) return res.status(400).json({ error: errores.join(' '), errores });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const c = await client.query('SELECT id_ciclo FROM ciclos_evaluativos WHERE id_ciclo = $1', [id_ciclo]);
        if (c.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'El ciclo indicado no existe.' });
        }
        const r = await client.query(
            'INSERT INTO parciales (id_ciclo, nombre, orden) VALUES ($1, $2, $3) RETURNING id_parcial',
            [id_ciclo, String(nombre).trim(), Number(orden)]
        );
        await client.query('COMMIT');
        res.status(201).json({ ok: true, id_parcial: r.rows[0].id_parcial });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al crear parcial:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un parcial con ese orden o nombre en el ciclo.' });
        }
        res.status(500).json({ error: 'No se pudo guardar el parcial.' });
    } finally {
        client.release();
    }
});

// PUT /api/parciales/:id -> editar (admin)
router.put('/:id', requireAuth, requireRole('administrador'), async (req, res) => {
    const { nombre, orden } = req.body || {};
    if (!nombre || String(nombre).trim() === '') {
        return res.status(400).json({ error: 'El nombre del parcial es obligatorio.' });
    }
    if (orden === undefined || orden === null || !Number.isInteger(Number(orden)) || Number(orden) <= 0) {
        return res.status(400).json({ error: 'El orden debe ser un entero mayor que cero.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            'UPDATE parciales SET nombre = $1, orden = $2 WHERE id_parcial = $3 RETURNING id_parcial',
            [String(nombre).trim(), Number(orden), req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Parcial no encontrado.' });
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Parcial actualizado correctamente.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al editar parcial:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un parcial con ese orden o nombre en el ciclo.' });
        }
        res.status(500).json({ error: 'No se pudo editar el parcial.' });
    } finally {
        client.release();
    }
});

// DELETE /api/parciales/:id -> eliminar (admin), bloqueado con notas
router.delete('/:id', requireAuth, requireRole('administrador'), async (req, res) => {
    const client = await pool.connect();
    try {
        const uso = await client.query(
            'SELECT COUNT(*)::int AS n FROM calificaciones WHERE id_parcial = $1',
            [req.params.id]
        );
        if (uso.rows[0].n > 0) {
            return res.status(409).json({
                error: 'No se puede eliminar: el parcial tiene calificaciones registradas.'
            });
        }
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query('DELETE FROM parciales WHERE id_parcial = $1 RETURNING id_parcial', [req.params.id]);
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Parcial no encontrado.' });
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Parcial eliminado correctamente.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al eliminar parcial:', error.message);
        res.status(500).json({ error: 'No se pudo eliminar el parcial.' });
    } finally {
        client.release();
    }
});

module.exports = router;
