// =========================================================
// routes/preinscripciones.js — Auto-matricula publica (M3).
// La familia se preinscribe SIN login (como la referencia);
// el admin APRUEBA (crea representante/usuario/estudiante/
// matricula en una transaccion) o RECHAZA con motivo.
// POST / es publico (validado + unico por cedula/periodo);
// todo lo demas es solo admin.
// =========================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole, setUsuarioAuditoria } = require('../middleware/auth');
const { getPeriodoActivo } = require('../helpers/contexto');
const { leerPaginacion, respuestaPaginada } = require('../helpers/paginacion');
const { fabricaUpload, rutaSegura } = require('../helpers/archivos');
const { generarEmail, crearUsuario, asegurarRol } = require('../helpers/usuarios');

const subirDoc = fabricaUpload('solicitudes', 1);

// GET /api/preinscripciones/opciones -> periodos + cursos (publico,
// sin datos sensibles: lo necesita el formulario sin login).
router.get('/opciones', async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        const idPeriodo = req.query.id_periodo || (periodoActivo && periodoActivo.id_periodo);
        const periodos = await pool.query(
            'SELECT id_periodo, nombre FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );
        const cursos = idPeriodo
            ? (await pool.query(
                'SELECT id_curso, nombre, paralelo FROM cursos WHERE id_periodo = $1 ORDER BY nombre, paralelo',
                [idPeriodo])).rows
            : [];
        res.json({ periodos: periodos.rows, periodoActivo, cursos });
    } catch (error) {
        console.error('Error en opciones:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar las opciones.' });
    }
});

// POST /api/preinscripciones (PUBLICO, campo opcional: documento PDF)
router.post('/', (req, res) => {
    subirDoc.single('documento')(req, res, async (err) => {
        if (err) {
            if (err.status || err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Archivo muy grande.' : (err.message || 'Archivo no valido.') });
            }
            console.error('Error al subir:', err.message);
            return res.status(500).json({ error: 'No se pudo recibir la solicitud.' });
        }
        try {
            const b = req.body || {};
            const errores = [];
            if (!b.nombres || !String(b.nombres).trim()) errores.push('Nombres del aspirante obligatorios.');
            if (!b.apellidos || !String(b.apellidos).trim()) errores.push('Apellidos obligatorios.');
            if (!b.cedula || !String(b.cedula).trim()) errores.push('Cedula obligatoria.');
            if (!b.fecha_nacimiento) errores.push('Fecha de nacimiento obligatoria.');
            if (!b.rep_nombres || !String(b.rep_nombres).trim()) errores.push('Nombres del acudiente obligatorios.');
            if (!b.rep_apellidos || !String(b.rep_apellidos).trim()) errores.push('Apellidos del acudiente obligatorios.');
            if (!b.rep_parentesco || !String(b.rep_parentesco).trim()) errores.push('Parentesco del acudiente obligatorio.');
            if (!b.rep_documento || !String(b.rep_documento).trim()) errores.push('Documento del acudiente obligatorio.');
            if (!req.file) errores.push('El documento PDF es obligatorio.');
            if (errores.length > 0) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return res.status(400).json({ error: errores.join(' '), errores });
            }
            const periodoActivo = await getPeriodoActivo();
            const idPeriodo = b.id_periodo || (periodoActivo && periodoActivo.id_periodo);
            if (!idPeriodo) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return res.status(500).json({ error: 'No hay periodos registrados.' });
            }
            if (b.id_curso) {
                const rCur = await pool.query(
                    'SELECT id_curso FROM cursos WHERE id_curso = $1 AND id_periodo = $2', [b.id_curso, idPeriodo]
                );
                if (rCur.rows.length === 0) {
                    if (req.file) fs.unlink(req.file.path, () => {});
                    return res.status(400).json({ error: 'El curso no pertenece al periodo.' });
                }
            }
            const dup = await pool.query(
                'SELECT id_solicitud FROM solicitudes_matricula WHERE cedula = $1 AND id_periodo = $2',
                [String(b.cedula).trim(), idPeriodo]
            );
            if (dup.rows.length > 0) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return res.status(409).json({ error: 'Ya existe una solicitud con esa cedula en este periodo.' });
            }
            const r = await pool.query(
                `INSERT INTO solicitudes_matricula
                     (nombres, apellidos, cedula, fecha_nacimiento,
                      rep_nombres, rep_apellidos, rep_telefono, rep_email,
                      rep_parentesco, rep_documento,
                      id_periodo, id_curso,
                      documento_nombre, documento_ruta, documento_mime, documento_tamano)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
                 RETURNING id_solicitud`,
                [String(b.nombres).trim(), String(b.apellidos).trim(), String(b.cedula).trim(), b.fecha_nacimiento,
                 String(b.rep_nombres).trim(), String(b.rep_apellidos).trim(),
                 b.rep_telefono || null, b.rep_email || null,
                 String(b.rep_parentesco).trim(), String(b.rep_documento).trim(),
                 idPeriodo, b.id_curso || null,
                 req.file.originalname.slice(0, 255),
                 path.join('solicitudes', path.basename(req.file.path)),
                 req.file.mimetype, req.file.size]
            );
            res.status(201).json({ ok: true, mensaje: 'Solicitud recibida. El colegio la revisara.', id_solicitud: r.rows[0].id_solicitud });
        } catch (error) {
            if (req.file) fs.unlink(req.file.path, () => {});
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Ya existe una solicitud con esa cedula en este periodo.' });
            }
            console.error('Error al guardar solicitud:', error.message);
            res.status(500).json({ error: 'No se pudo guardar la solicitud.' });
        }
    });
});

// GET /api/preinscripciones?estado=&q=&page= (admin)
// q busca por nombres, apellidos o cedula (aspirante o acudiente).
router.get('/', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        const { page, limit, offset } = leerPaginacion(req.query, { porDefecto: 15, minimo: 5 });
        const estado = req.query.estado || '';
        const q = String(req.query.q || '').trim();
        const conds = [];
        const params = [];
        if (estado) {
            params.push(estado);
            conds.push(`s.estado = $${params.length}`);
        }
        if (q) {
            params.push(`%${q}%`);
            conds.push(`(s.nombres ILIKE $${params.length} OR s.apellidos ILIKE $${params.length} OR s.cedula ILIKE $${params.length} OR s.rep_nombres ILIKE $${params.length} OR s.rep_apellidos ILIKE $${params.length})`);
        }
        const where = conds.length > 0 ? 'WHERE ' + conds.join(' AND ') : '';
        const countResult = await pool.query(`SELECT COUNT(*) AS total FROM solicitudes_matricula s ${where}`, params);
        const r = await pool.query(
            `SELECT s.*, p.nombre AS periodo_nombre, c.nombre AS curso_nombre, c.paralelo
             FROM solicitudes_matricula s
             JOIN periodos_academicos p ON p.id_periodo = s.id_periodo
             LEFT JOIN cursos c ON c.id_curso = s.id_curso
             ${where} ORDER BY s.fecha_creacion DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );
        res.json(respuestaPaginada(r.rows, { page, limit, total: countResult.rows[0].total }));
    } catch (error) {
        console.error('Error al listar solicitudes:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar las solicitudes.' });
    }
});

// POST /api/preinscripciones/:id/aprobar (admin)
router.post('/:id/aprobar', requireAuth, requireRole('administrador'), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const rSol = await client.query(
            'SELECT * FROM solicitudes_matricula WHERE id_solicitud = $1 FOR UPDATE', [req.params.id]
        );
        if (rSol.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }
        const sol = rSol.rows[0];
        if (sol.estado !== 'pendiente') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `Ya fue ${sol.estado}.` });
        }
        // Representante: reutilizar por email/telefono o crear.
        let idRep = null;
        if (sol.rep_email) {
            const rRep = await client.query('SELECT id_representante FROM representantes WHERE email = $1', [sol.rep_email]);
            if (rRep.rows.length > 0) idRep = rRep.rows[0].id_representante;
        }
        if (!idRep && sol.rep_telefono) {
            const rRep = await client.query('SELECT id_representante FROM representantes WHERE telefono = $1', [sol.rep_telefono]);
            if (rRep.rows.length > 0) idRep = rRep.rows[0].id_representante;
        }
        if (!idRep) {
            const rRep = await client.query(
                'INSERT INTO representantes (nombres, apellidos, telefono, email, parentesco, cedula) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_representante',
                [sol.rep_nombres, sol.rep_apellidos, sol.rep_telefono, sol.rep_email, sol.rep_parentesco, sol.rep_documento]
            );
            idRep = rRep.rows[0].id_representante;
        }
        // Usuario + estudiante (mismo patron que POST /estudiantes).
        const rolEst = await asegurarRol(client, 'estudiante');
        const { id_usuario: idUsuario, email } = await crearUsuario(
            client, sol.nombres, sol.apellidos,
            generarEmail(sol.nombres, sol.apellidos), rolEst);
        const rEst = await client.query(
            `INSERT INTO estudiantes (cedula, nombres, apellidos, fecha_nacimiento, id_representante, id_usuario)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_estudiante`,
            [sol.cedula, sol.nombres, sol.apellidos, sol.fecha_nacimiento, idRep, idUsuario]
        );
        await client.query(
            'INSERT INTO matriculas (id_estudiante, id_periodo, id_curso) VALUES ($1, $2, $3)',
            [rEst.rows[0].id_estudiante, sol.id_periodo, sol.id_curso]
        );
        await client.query(
            `UPDATE solicitudes_matricula SET estado = 'aprobada', revisada_por = $1, fecha_revision = NOW()
             WHERE id_solicitud = $2`,
            [req.session.usuario.id_usuario, req.params.id]
        );
        await client.query('COMMIT');
        res.status(201).json({
            ok: true, mensaje: 'Matricula aprobada.',
            id_estudiante: rEst.rows[0].id_estudiante, email, password: 'UTEQ2026'
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al aprobar:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'El estudiante ya existe o ya esta matriculado.' });
        }
        res.status(500).json({ error: 'No se pudo aprobar la solicitud.' });
    } finally {
        client.release();
    }
});

// POST /api/preinscripciones/:id/rechazar { motivo } (admin)
router.post('/:id/rechazar', requireAuth, requireRole('administrador'), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            `UPDATE solicitudes_matricula
             SET estado = 'rechazada', motivo_rechazo = $1, revisada_por = $2, fecha_revision = NOW()
             WHERE id_solicitud = $3 AND estado = 'pendiente'
             RETURNING id_solicitud`,
            [(req.body || {}).motivo || null, req.session.usuario.id_usuario, req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Solicitud no encontrada o ya revisada.' });
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Solicitud rechazada.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al rechazar:', error.message);
        res.status(500).json({ error: 'No se pudo rechazar.' });
    } finally {
        client.release();
    }
});

module.exports = router;
