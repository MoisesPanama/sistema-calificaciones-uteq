// =========================================================
// routes/tipos_evaluacion.js — CRUD REST de tipos de
// evaluacion (maestro de datos, Fase 6). Reescrito desde el
// legacy EJS (res.render) a API JSON.
// Lectura: cualquier autenticado. Escritura: solo admin.
// Regla: no se elimina un tipo con calificaciones (409).
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole, setUsuarioAuditoria } = require('../middleware/auth');

const CATEGORIAS_TIPO = ['diagnostica', 'formativa', 'sumativa'];

function aBooleano(v, defecto) {
    if (v === undefined || v === null || v === '') return defecto;
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase();
    if (['true', '1', 'on', 'si', 'sí'].includes(s)) return true;
    if (['false', '0', 'off', 'no'].includes(s)) return false;
    return defecto;
}

function validarTipo(body) {
    const errores = [];
    if (!body.nombre || String(body.nombre).trim() === '') {
        errores.push('El nombre del tipo de evaluacion es obligatorio.');
    }
    if (body.peso === undefined || body.peso === null || body.peso === '' || isNaN(Number(body.peso))) {
        errores.push('El peso debe ser un numero.');
    } else {
        const pesoNum = Number(body.peso);
        if (pesoNum <= 0 || pesoNum > 1) {
            errores.push('El peso debe estar entre 0.01 y 1.00.');
        }
    }
    if (body.categoria && !CATEGORIAS_TIPO.includes(body.categoria)) {
        errores.push('Categoria no valida: ' + CATEGORIAS_TIPO.join(', ') + '.');
    }
    return errores;
}

const SELECT_TIPOS = `SELECT id_tipo_evaluacion, nombre, peso, categoria,
                             es_examen, cuenta_para_promedio, id_parcial
                      FROM tipos_evaluacion ORDER BY nombre`;

// GET /api/tipos -> listado
router.get('/', requireAuth, async (req, res) => {
    try {
        const resultado = await pool.query(SELECT_TIPOS);
        res.json({ tiposEvaluacion: resultado.rows });
    } catch (error) {
        console.error('Error al listar tipos de evaluacion:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los tipos de evaluacion.' });
    }
});

// POST /api/tipos -> crear (admin)
router.post('/', requireAuth, requireRole('administrador'), async (req, res) => {
    const { nombre, peso, categoria, es_examen, cuenta_para_promedio } = req.body || {};
    const errores = validarTipo(req.body || {});
    if (errores.length > 0) return res.status(400).json({ error: errores.join(' '), errores });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            `INSERT INTO tipos_evaluacion (nombre, peso, categoria, es_examen, cuenta_para_promedio)
             VALUES ($1, $2, $3, $4, $5) RETURNING id_tipo_evaluacion`,
            [String(nombre).trim(), Number(peso), categoria || 'formativa',
             aBooleano(es_examen, false), aBooleano(cuenta_para_promedio, true)]
        );
        await client.query('COMMIT');
        res.status(201).json({ ok: true, id_tipo_evaluacion: r.rows[0].id_tipo_evaluacion });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al crear tipo de evaluacion:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un tipo de evaluacion con ese nombre.' });
        }
        res.status(500).json({ error: 'No se pudo guardar el tipo de evaluacion.' });
    } finally {
        client.release();
    }
});

// PUT /api/tipos/:id -> editar (admin)
router.put('/:id', requireAuth, requireRole('administrador'), async (req, res) => {
    const { nombre, peso, categoria, es_examen, cuenta_para_promedio } = req.body || {};
    const errores = validarTipo(req.body || {});
    if (errores.length > 0) return res.status(400).json({ error: errores.join(' '), errores });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            `UPDATE tipos_evaluacion
             SET nombre = $1, peso = $2, categoria = $3, es_examen = $4, cuenta_para_promedio = $5
             WHERE id_tipo_evaluacion = $6 RETURNING id_tipo_evaluacion`,
            [String(nombre).trim(), Number(peso), categoria || 'formativa',
             aBooleano(es_examen, false), aBooleano(cuenta_para_promedio, true), req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Tipo de evaluacion no encontrado.' });
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Tipo de evaluacion actualizado correctamente.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al editar tipo de evaluacion:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un tipo de evaluacion con ese nombre.' });
        }
        res.status(500).json({ error: 'No se pudo editar el tipo de evaluacion.' });
    } finally {
        client.release();
    }
});

// DELETE /api/tipos/:id -> eliminar (admin), bloqueado con notas
router.delete('/:id', requireAuth, requireRole('administrador'), async (req, res) => {
    const client = await pool.connect();
    try {
        const uso = await client.query(
            'SELECT COUNT(*)::int AS n FROM calificaciones WHERE id_tipo_evaluacion = $1',
            [req.params.id]
        );
        if (uso.rows[0].n > 0) {
            return res.status(409).json({
                error: 'No se puede eliminar: existen calificaciones que usan este tipo de evaluacion.'
            });
        }
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            'DELETE FROM tipos_evaluacion WHERE id_tipo_evaluacion = $1 RETURNING id_tipo_evaluacion',
            [req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Tipo de evaluacion no encontrado.' });
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Tipo de evaluacion eliminado correctamente.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al eliminar tipo de evaluacion:', error.message);
        res.status(500).json({ error: 'No se pudo eliminar el tipo de evaluacion.' });
    } finally {
        client.release();
    }
});

module.exports = router;
