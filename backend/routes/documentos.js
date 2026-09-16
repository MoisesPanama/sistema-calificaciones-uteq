// =========================================================
// routes/documentos.js — Documentos de matricula (S3).
// Los TIPOS los define el admin (nada hardcodeado). Por
// estudiante rige un archivo vigente por tipo (subir de
// nuevo lo reemplaza). Ven: admin, profesor, representante
// propio y el propio estudiante. Suben/borran: admin,
// profesor y representante propio.
// =========================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole, setUsuarioAuditoria } = require('../middleware/auth');
const { fabricaUpload, rutaSegura } = require('../helpers/archivos');

const subir = fabricaUpload('documentos', 1);

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

async function existeEstudiante(id) {
    const r = await pool.query('SELECT id_estudiante FROM estudiantes WHERE id_estudiante = $1', [id]);
    return r.rows.length > 0;
}

// Lectura: admin, profesor, representante propio, estudiante propio.
async function puedeVer(usuario, idEstudiante) {
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
        const { getEstudianteId } = require('../helpers/contexto');
        return String(await getEstudianteId(pool, usuario.id_usuario)) === String(idEstudiante);
    }
    return false;
}

// Escritura: admin, profesor, representante propio (el
// estudiante no sube sus propios documentos oficiales).
async function puedeEditar(usuario, idEstudiante) {
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
    return false;
}

// ---------- Tipos (admin) ----------
router.get('/tipos', requireAuth, async (req, res) => {
    try {
        const r = await pool.query(
            'SELECT id_tipo_documento, nombre, descripcion, obligatorio, activo FROM tipos_documento ORDER BY nombre'
        );
        res.json({ tipos: r.rows });
    } catch (error) {
        console.error('Error al listar tipos:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los tipos.' });
    }
});

router.post('/tipos', requireAuth, requireRole('administrador'), async (req, res) => {
    const { nombre, descripcion, obligatorio } = req.body || {};
    if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    try {
        const r = await pool.query(
            `INSERT INTO tipos_documento (nombre, descripcion, obligatorio)
             VALUES ($1, $2, $3) RETURNING id_tipo_documento`,
            [String(nombre).trim(), descripcion || null, obligatorio === true]
        );
        res.status(201).json({ ok: true, id_tipo_documento: r.rows[0].id_tipo_documento });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Ya existe ese tipo.' });
        console.error('Error al crear tipo:', error.message);
        res.status(500).json({ error: 'No se pudo crear el tipo.' });
    }
});

router.put('/tipos/:id', requireAuth, requireRole('administrador'), async (req, res) => {
    const { nombre, descripcion, obligatorio, activo } = req.body || {};
    if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    try {
        const r = await pool.query(
            `UPDATE tipos_documento SET nombre = $1, descripcion = $2, obligatorio = $3, activo = $4
             WHERE id_tipo_documento = $5 RETURNING id_tipo_documento`,
            [String(nombre).trim(), descripcion || null, obligatorio === true,
             activo === undefined ? true : activo === true, req.params.id]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Tipo no encontrado.' });
        res.json({ ok: true });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Ya existe ese tipo.' });
        console.error('Error al editar tipo:', error.message);
        res.status(500).json({ error: 'No se pudo editar el tipo.' });
    }
});

router.delete('/tipos/:id', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        const uso = await pool.query(
            'SELECT COUNT(*)::int AS n FROM estudiante_documentos WHERE id_tipo_documento = $1',
            [req.params.id]
        );
        if (uso.rows[0].n > 0) {
            return res.status(409).json({ error: 'Hay documentos de ese tipo: no se puede borrar.' });
        }
        const r = await pool.query('DELETE FROM tipos_documento WHERE id_tipo_documento = $1 RETURNING id_tipo_documento', [req.params.id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Tipo no encontrado.' });
        res.json({ ok: true });
    } catch (error) {
        console.error('Error al borrar tipo:', error.message);
        res.status(500).json({ error: 'No se pudo borrar el tipo.' });
    }
});

// ---------- Documentos por estudiante ----------
// GET /api/documentos/por-estudiante/:id -> tipos con su archivo vigente
router.get('/por-estudiante/:id', requireAuth, async (req, res) => {
    try {
        if (!await existeEstudiante(req.params.id)) return res.status(404).json({ error: 'Estudiante no encontrado.' });
        if (!await puedeVer(req.session.usuario, req.params.id)) {
            return res.status(403).json({ error: 'No tienes acceso a estos documentos.' });
        }
        const r = await pool.query(
            `SELECT t.id_tipo_documento, t.nombre, t.descripcion, t.obligatorio,
                    d.id_documento, d.nombre_original, d.mime, d.tamano_bytes, d.fecha_subida
             FROM tipos_documento t
             LEFT JOIN estudiante_documentos d
               ON d.id_tipo_documento = t.id_tipo_documento AND d.id_estudiante = $1
             WHERE t.activo = TRUE
             ORDER BY t.nombre`,
            [req.params.id]
        );
        res.json({ documentos: r.rows });
    } catch (error) {
        console.error('Error al listar documentos:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los documentos.' });
    }
});

// POST /api/documentos/por-estudiante/:id (campos: archivo + id_tipo_documento)
router.post('/por-estudiante/:id', requireAuth, (req, res) => {
    subir.single('archivo')(req, res, async (err) => {
        if (err) return manejarErrorSubida(res, err);
        try {
            if (!await existeEstudiante(req.params.id)) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return res.status(404).json({ error: 'Estudiante no encontrado.' });
            }
            if (!await puedeEditar(req.session.usuario, req.params.id)) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return res.status(403).json({ error: 'No tienes permiso para subir documentos aqui.' });
            }
            const { id_tipo_documento } = req.body || {};
            const rTipo = await pool.query(
                'SELECT id_tipo_documento FROM tipos_documento WHERE id_tipo_documento = $1 AND activo = TRUE',
                [id_tipo_documento]
            );
            if (rTipo.rows.length === 0) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return res.status(400).json({ error: 'Tipo de documento no valido.' });
            }
            if (!req.file) return res.status(400).json({ error: 'No se recibio archivo (campo archivo).' });
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
                const previo = await client.query(
                    'SELECT ruta FROM estudiante_documentos WHERE id_estudiante = $1 AND id_tipo_documento = $2',
                    [req.params.id, id_tipo_documento]
                );
                const rel = path.join('documentos', path.basename(req.file.path));
                await client.query(
                    `INSERT INTO estudiante_documentos
                         (id_estudiante, id_tipo_documento, nombre_original, ruta, mime, tamano_bytes, subido_por)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (id_estudiante, id_tipo_documento)
                     DO UPDATE SET nombre_original = EXCLUDED.nombre_original, ruta = EXCLUDED.ruta,
                         mime = EXCLUDED.mime, tamano_bytes = EXCLUDED.tamano_bytes,
                         subido_por = EXCLUDED.subido_por, fecha_subida = NOW()`,
                    [req.params.id, id_tipo_documento, req.file.originalname.slice(0, 255),
                     rel, req.file.mimetype, req.file.size, req.session.usuario.id_usuario]
                );
                await client.query('COMMIT');
                if (previo.rows[0]) {
                    const abs = rutaSegura(previo.rows[0].ruta);
                    if (abs) fs.unlink(abs, () => {});
                }
                res.status(201).json({ ok: true, mensaje: 'Documento guardado.' });
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                fs.unlink(req.file.path, () => {});
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Error al guardar documento:', error.message);
            res.status(500).json({ error: 'No se pudo guardar el documento.' });
        }
    });
});

// GET /api/documentos/:id/descargar
router.get('/:id/descargar', requireAuth, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM estudiante_documentos WHERE id_documento = $1', [req.params.id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado.' });
        const doc = r.rows[0];
        if (!await puedeVer(req.session.usuario, doc.id_estudiante)) {
            return res.status(403).json({ error: 'No tienes acceso a este documento.' });
        }
        const abs = rutaSegura(doc.ruta);
        if (!abs) return res.status(404).json({ error: 'Archivo no encontrado en disco.' });
        res.download(abs, doc.nombre_original);
    } catch (error) {
        console.error('Error al descargar:', error.message);
        res.status(500).json({ error: 'No se pudo descargar.' });
    }
});

// DELETE /api/documentos/:id
router.delete('/:id', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const r = await client.query('SELECT * FROM estudiante_documentos WHERE id_documento = $1', [req.params.id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado.' });
        const doc = r.rows[0];
        if (!await puedeEditar(req.session.usuario, doc.id_estudiante)) {
            return res.status(403).json({ error: 'No tienes permiso para borrar.' });
        }
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        await client.query('DELETE FROM estudiante_documentos WHERE id_documento = $1', [req.params.id]);
        await client.query('COMMIT');
        const abs = rutaSegura(doc.ruta);
        if (abs) fs.unlink(abs, () => {});
        res.json({ ok: true, mensaje: 'Documento eliminado.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al eliminar documento:', error.message);
        res.status(500).json({ error: 'No se pudo eliminar.' });
    } finally {
        client.release();
    }
});

module.exports = router;
