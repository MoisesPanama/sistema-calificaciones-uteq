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

// GET /api/preinscripciones/opciones?cedula=&id_periodo= -> periodos +
// cursos (publico, sin datos sensibles: lo necesita el formulario
// sin login). Con ?cedula= devuelve SOLO los cursos elegibles
// con cupo (nuevo -> nivel inicial; rematricula -> sube o repite
// nivel segun regla todo-o-nada) + si la ventana esta abierta.
router.get('/opciones', async (req, res) => {
    try {
        const periodoActivo = await getPeriodoActivo();
        const idPeriodo = req.query.id_periodo || (periodoActivo && periodoActivo.id_periodo);
        const cedula = String(req.query.cedula || '').trim();
        const periodos = await pool.query(
            'SELECT id_periodo, nombre FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );
        let cursos = [];
        let elegibles = [];
        let tipo = 'nuevo';
        let abierta = true;
        if (idPeriodo) {
            const rAbierta = await pool.query('SELECT fn_matricula_abierta($1) AS abierta', [idPeriodo]);
            abierta = !!rAbierta.rows[0]?.abierta;
            const rCur = await pool.query(
                `SELECT id_curso, nombre, paralelo, nivel, cupo_max,
                        fn_ocupacion_curso(id_curso, $1) AS ocupados,
                        (cupo_max - fn_ocupacion_curso(id_curso, $1)) AS disponibles
                 FROM cursos WHERE id_periodo = $1 ORDER BY nivel NULLS LAST, nombre, paralelo`,
                [idPeriodo]
            );
            cursos = rCur.rows;
            if (cedula) {
                const rEst = await pool.query('SELECT id_estudiante FROM estudiantes WHERE cedula = $1', [cedula]);
                if (rEst.rows.length > 0) tipo = 'rematricula';
                const rEl = await pool.query('SELECT * FROM fn_cursos_elegibles($1, $2)', [cedula, idPeriodo]);
                elegibles = rEl.rows;
            } else {
                const rEl = await pool.query('SELECT * FROM fn_cursos_elegibles($1, $2)', ['', idPeriodo]);
                elegibles = rEl.rows;
            }
        }
        res.json({ periodos: periodos.rows, periodoActivo, cursos, elegibles, tipo, matricula_abierta: abierta });
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
            // Ventana de matriculacion (M9, patron OpenEducat).
            const rAbierta = await pool.query('SELECT fn_matricula_abierta($1) AS abierta', [idPeriodo]);
            if (!rAbierta.rows[0]?.abierta) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return res.status(403).json({ error: 'El periodo de matriculacion esta cerrado en este momento.' });
            }
            // Tipo real en servidor (no se confia en el cliente).
            const rEst = await pool.query('SELECT id_estudiante FROM estudiantes WHERE cedula = $1', [String(b.cedula).trim()]);
            const tipo = rEst.rows.length > 0 ? 'rematricula' : 'nuevo';
            // Curso obligatorio y dentro de los elegibles con cupo.
            if (!b.id_curso) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return res.status(400).json({ error: 'Debes elegir un curso con cupo disponible.' });
            }
            const rCur = await pool.query(
                'SELECT id_curso FROM cursos WHERE id_curso = $1 AND id_periodo = $2', [b.id_curso, idPeriodo]
            );
            if (rCur.rows.length === 0) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return res.status(400).json({ error: 'El curso no pertenece al periodo.' });
            }
            const rEl = await pool.query('SELECT id_curso FROM fn_cursos_elegibles($1, $2)', [String(b.cedula).trim(), idPeriodo]);
            if (!rEl.rows.some((e) => String(e.id_curso) === String(b.id_curso))) {
                if (req.file) fs.unlink(req.file.path, () => {});
                return res.status(409).json({ error: 'Ese curso no te corresponde o ya no tiene cupo disponible.' });
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
                      rep_parentesco, rep_documento, tipo,
                      id_periodo, id_curso,
                      documento_nombre, documento_ruta, documento_mime, documento_tamano)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
                 RETURNING id_solicitud`,
                [String(b.nombres).trim(), String(b.apellidos).trim(), String(b.cedula).trim(), b.fecha_nacimiento,
                 String(b.rep_nombres).trim(), String(b.rep_apellidos).trim(),
                 b.rep_telefono || null, b.rep_email || null,
                 String(b.rep_parentesco).trim(), String(b.rep_documento).trim(), tipo,
                 idPeriodo, b.id_curso,
                 req.file.originalname.slice(0, 255),
                 path.join('solicitudes', path.basename(req.file.path)),
                 req.file.mimetype, req.file.size]
            );
            res.status(201).json({ ok: true, mensaje: `Solicitud de ${tipo} recibida. El colegio la revisara.`, id_solicitud: r.rows[0].id_solicitud, tipo });
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
        const tipo = req.query.tipo || '';
        const q = String(req.query.q || '').trim();
        const conds = [];
        const params = [];
        if (estado) {
            params.push(estado);
            conds.push(`s.estado = $${params.length}`);
        }
        if (tipo) {
            params.push(tipo);
            conds.push(`s.tipo = $${params.length}`);
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
// Nuevo: crea representante/usuario/estudiante/matricula.
// Rematricula: reutiliza el estudiante existente y solo crea
// la matricula en el curso elegido (sube o repite nivel segun
// elegibles). El cupo se verifica con bloqueo (FOR UPDATE).
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
        // Cupo con bloqueo: la solicitud pendiente ya ocupa lugar,
        // aprobar la convierte en matricula (neto igual).
        if (sol.id_curso) {
            const rCup = await client.query(
                'SELECT cupo_max FROM cursos WHERE id_curso = $1 FOR UPDATE', [sol.id_curso]
            );
            if (rCup.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'El curso de la solicitud ya no existe.' });
            }
            const rOcu = await client.query(
                'SELECT fn_ocupacion_curso($1, $2) AS ocupados', [sol.id_curso, sol.id_periodo]
            );
            if (Number(rOcu.rows[0].ocupados) > Number(rCup.rows[0].cupo_max)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'El curso ya no tiene cupo disponible.' });
            }
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
        // Estudiante: si ya existe por cedula es rematricula.
        let idEstudiante = null;
        let email = null;
        let password = null;
        const rEx = await client.query(
            `SELECT e.id_estudiante, u.email FROM estudiantes e
             LEFT JOIN usuarios u ON u.id_usuario = e.id_usuario
             WHERE e.cedula = $1`,
            [sol.cedula]
        );
        if (rEx.rows.length > 0) {
            idEstudiante = rEx.rows[0].id_estudiante;
            email = rEx.rows[0].email;
            // Vincula al representante actual si cambio de acudiente.
            await client.query(
                'UPDATE estudiantes SET id_representante = $1 WHERE id_estudiante = $2',
                [idRep, idEstudiante]
            );
        } else {
            const rolEst = await asegurarRol(client, 'estudiante');
            const creado = await crearUsuario(
                client, sol.nombres, sol.apellidos,
                generarEmail(sol.nombres, sol.apellidos), rolEst);
            const rEst = await client.query(
                `INSERT INTO estudiantes (cedula, nombres, apellidos, fecha_nacimiento, id_representante, id_usuario)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_estudiante`,
                [sol.cedula, sol.nombres, sol.apellidos, sol.fecha_nacimiento, idRep, creado.id_usuario]
            );
            idEstudiante = rEst.rows[0].id_estudiante;
            email = creado.email;
            password = 'UTEQ2026';
        }
        await client.query(
            'INSERT INTO matriculas (id_estudiante, id_periodo, id_curso) VALUES ($1, $2, $3)',
            [idEstudiante, sol.id_periodo, sol.id_curso]
        );
        await client.query(
            `UPDATE solicitudes_matricula SET estado = 'aprobada', revisada_por = $1, fecha_revision = NOW()
             WHERE id_solicitud = $2`,
            [req.session.usuario.id_usuario, req.params.id]
        );
        await client.query('COMMIT');
        res.status(201).json({
            ok: true, mensaje: sol.tipo === 'rematricula' ? 'Rematricula aprobada.' : 'Matricula aprobada.',
            tipo: sol.tipo, id_estudiante: idEstudiante, email, password
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
