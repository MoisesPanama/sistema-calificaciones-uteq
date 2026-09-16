// =========================================================
// routes/adjuntos.js — Archivos por actividad (S3 super plan).
// El docente adjunta material (guia PDF, imagen de apoyo).
// Solo dueno de la actividad o admin. Descarga con auth;
// la carpeta jamas se sirve como estatico.
// =========================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');
const { fabricaUpload, rutaSegura } = require('../helpers/archivos');

const subir = fabricaUpload('actividades', 5);

async function cargarActividad(id) {
    const r = await pool.query(
        'SELECT id_actividad, id_materia, id_periodo, creado_por, estado FROM actividades WHERE id_actividad = $1 AND activo = TRUE',
        [id]
    );
    return r.rows[0] || null;
}

function puedeGestionar(act, usuario) {
    if (!act) return false;
    return usuario.nombre_rol === 'administrador' ||
        String(act.creado_por) === String(usuario.id_usuario);
}

function manejarErrorSubida(res, error) {
    if (error && (error.status || error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_FILE_COUNT')) {
        const mensaje = error.code === 'LIMIT_FILE_SIZE'
            ? 'Archivo muy grande (tope configurable ADJUNTOS_MAX_MB).'
            : (error.message || 'Archivo no valido.');
        return res.status(400).json({ error: mensaje });
    }
    console.error('Error al subir:', error && error.message);
    res.status(500).json({ error: 'No se pudo subir el archivo.' });
}

// GET /api/adjuntos/por-actividad/:id
router.get('/por-actividad/:id', requireAuth, async (req, res) => {
    try {
        const act = await cargarActividad(req.params.id);
        if (!act) return res.status(404).json({ error: 'Actividad no encontrada.' });
        if (!puedeGestionar(act, req.session.usuario)) {
            return res.status(403).json({ error: 'No tienes acceso a esta actividad.' });
        }
        const r = await pool.query(
            `SELECT id_adjunto, nombre_original, mime, tamano_bytes, fecha_subida,
                    (u.nombres || ' ' || u.apellidos) AS subido_por_nombre
             FROM actividad_adjuntos a
             LEFT JOIN usuarios u ON u.id_usuario = a.subido_por
             WHERE a.id_actividad = $1 ORDER BY a.fecha_subida DESC`,
            [req.params.id]
        );
        res.json({ adjuntos: r.rows });
    } catch (error) {
        console.error('Error al listar adjuntos:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los adjuntos.' });
    }
});

// POST /api/adjuntos/por-actividad/:id (campo: archivos[], max 5)
router.post('/por-actividad/:id', requireAuth, (req, res) => {
    subir.array('archivos', 5)(req, res, async (err) => {
        if (err) return manejarErrorSubida(res, err);
        try {
            const act = await cargarActividad(req.params.id);
            if (!act) {
                (req.files || []).forEach((f) => fs.unlink(f.path, () => {}));
                return res.status(404).json({ error: 'Actividad no encontrada.' });
            }
            if (!puedeGestionar(act, req.session.usuario)) {
                (req.files || []).forEach((f) => fs.unlink(f.path, () => {}));
                return res.status(403).json({ error: 'No tienes acceso a esta actividad.' });
            }
            if (act.estado === 'cerrada') {
                (req.files || []).forEach((f) => fs.unlink(f.path, () => {}));
                return res.status(409).json({ error: 'La actividad esta cerrada.' });
            }
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No se recibio ningun archivo (campo archivos).' });
            }
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
                const creados = [];
                for (const f of req.files) {
                    const rel = path.join('actividades', path.basename(f.path));
                    const r = await client.query(
                        `INSERT INTO actividad_adjuntos
                             (id_actividad, nombre_original, ruta, mime, tamano_bytes, subido_por)
                         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_adjunto, nombre_original`,
                        [req.params.id, f.originalname.slice(0, 255), rel, f.mimetype, f.size, req.session.usuario.id_usuario]
                    );
                    creados.push(r.rows[0]);
                }
                await client.query('COMMIT');
                res.status(201).json({ ok: true, adjuntos: creados });
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                (req.files || []).forEach((f) => fs.unlink(f.path, () => {}));
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Error al guardar adjuntos:', error.message);
            res.status(500).json({ error: 'No se pudieron guardar los adjuntos.' });
        }
    });
});

// GET /api/adjuntos/:id/descargar
router.get('/:id/descargar', requireAuth, async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT a.*, act.creado_por FROM actividad_adjuntos a
             JOIN actividades act ON act.id_actividad = a.id_actividad
             WHERE a.id_adjunto = $1`,
            [req.params.id]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Adjunto no encontrado.' });
        const adj = r.rows[0];
        if (!puedeGestionar({ creado_por: adj.creado_por }, req.session.usuario)) {
            return res.status(403).json({ error: 'No tienes acceso a este archivo.' });
        }
        const abs = rutaSegura(adj.ruta);
        if (!abs) return res.status(404).json({ error: 'Archivo no encontrado en disco.' });
        res.download(abs, adj.nombre_original);
    } catch (error) {
        console.error('Error al descargar:', error.message);
        res.status(500).json({ error: 'No se pudo descargar el archivo.' });
    }
});

// DELETE /api/adjuntos/:id
router.delete('/:id', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const r = await client.query(
            `SELECT a.*, act.creado_por FROM actividad_adjuntos a
             JOIN actividades act ON act.id_actividad = a.id_actividad
             WHERE a.id_adjunto = $1`,
            [req.params.id]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Adjunto no encontrado.' });
        const adj = r.rows[0];
        if (!puedeGestionar({ creado_por: adj.creado_por }, req.session.usuario)) {
            return res.status(403).json({ error: 'No tienes acceso a este archivo.' });
        }
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        await client.query('DELETE FROM actividad_adjuntos WHERE id_adjunto = $1', [req.params.id]);
        await client.query('COMMIT');
        const abs = rutaSegura(adj.ruta);
        if (abs) fs.unlink(abs, () => {});
        res.json({ ok: true, mensaje: 'Adjunto eliminado.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al eliminar adjunto:', error.message);
        res.status(500).json({ error: 'No se pudo eliminar el adjunto.' });
    } finally {
        client.release();
    }
});

module.exports = router;
