// =========================================================
// routes/estudiantes.js — CRUD JSON de estudiantes
// GET    /api/estudiantes?q=
// GET    /api/estudiantes/representantes (select del form)
// GET    /api/estudiantes/:id
// POST   /api/estudiantes
// PUT    /api/estudiantes/:id
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');

// Trae el listado de representantes, usado en el formulario (select)
async function obtenerRepresentantes() {
    const resultado = await pool.query(
        'SELECT id_representante, nombres, apellidos FROM representantes ORDER BY apellidos, nombres'
    );
    return resultado.rows;
}

// GET /api/estudiantes/representantes -> OJO: va antes de /:id
router.get('/representantes', requireAuth, async (req, res) => {
    try {
        res.json({ representantes: await obtenerRepresentantes() });
    } catch (error) {
        console.error('Error al listar representantes:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los representantes.' });
    }
});

// GET /api/estudiantes?q= -> listado con buscador
router.get('/', requireAuth, async (req, res) => {
    try {
        const busqueda = req.query.q || '';

        const resultado = await pool.query(
            `SELECT e.id_estudiante, e.cedula, e.nombres, e.apellidos,
                    e.fecha_nacimiento, e.activo, e.id_representante,
                    r.nombres AS rep_nombres, r.apellidos AS rep_apellidos
             FROM estudiantes e
             JOIN representantes r ON r.id_representante = e.id_representante
             WHERE (e.nombres ILIKE $1 OR e.apellidos ILIKE $1 OR e.cedula ILIKE $1
                    OR (e.nombres || ' ' || e.apellidos) ILIKE $1)
             ORDER BY e.apellidos, e.nombres`,
            [`%${busqueda}%`]
        );

        res.json({ estudiantes: resultado.rows, busqueda });

    } catch (error) {
        console.error('Error al listar estudiantes:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el listado de estudiantes.' });
    }
});

// GET /api/estudiantes/:id -> un estudiante (para editar)
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT * FROM estudiantes WHERE id_estudiante = $1',
            [req.params.id]
        );
        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado.' });
        }
        res.json({ estudiante: resultado.rows[0] });
    } catch (error) {
        console.error('Error al cargar estudiante:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el estudiante.' });
    }
});

// Valida los campos obligatorios y devuelve un arreglo de errores
function validarEstudiante(body) {
    const errores = [];
    if (!body.cedula || String(body.cedula).trim() === '') errores.push('La cedula es obligatoria.');
    if (!body.nombres || String(body.nombres).trim() === '') errores.push('El nombre es obligatorio.');
    if (!body.apellidos || String(body.apellidos).trim() === '') errores.push('El apellido es obligatorio.');
    if (!body.fecha_nacimiento) errores.push('La fecha de nacimiento es obligatoria.');
    if (!body.id_representante) errores.push('Debes seleccionar un representante.');
    return errores;
}

// POST /api/estudiantes -> crea un nuevo estudiante
router.post('/', requireAuth, async (req, res) => {
    const { cedula, nombres, apellidos, fecha_nacimiento, id_representante } = req.body || {};
    const errores = validarEstudiante(req.body || {});
    if (errores.length > 0) {
        return res.status(400).json({ error: errores.join(' '), errores });
    }

    try {
        await setUsuarioAuditoria(req.session.usuario.id_usuario);
        const r = await pool.query(
            `INSERT INTO estudiantes (cedula, nombres, apellidos, fecha_nacimiento, id_representante)
             VALUES ($1, $2, $3, $4, $5) RETURNING id_estudiante`,
            [cedula, nombres, apellidos, fecha_nacimiento, id_representante]
        );
        res.status(201).json({ ok: true, id_estudiante: r.rows[0].id_estudiante });
    } catch (error) {
        console.error('Error al crear estudiante:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un estudiante registrado con esa cedula.' });
        }
        res.status(500).json({ error: 'No se pudo guardar el estudiante.' });
    }
});

// PUT /api/estudiantes/:id -> actualiza un estudiante existente
router.put('/:id', requireAuth, async (req, res) => {
    const { cedula, nombres, apellidos, fecha_nacimiento, id_representante, activo } = req.body || {};
    const errores = validarEstudiante(req.body || {});
    if (errores.length > 0) {
        return res.status(400).json({ error: errores.join(' '), errores });
    }

    try {
        await setUsuarioAuditoria(req.session.usuario.id_usuario);
        const resultado = await pool.query(
            `UPDATE estudiantes
             SET cedula = $1, nombres = $2, apellidos = $3,
                 fecha_nacimiento = $4, id_representante = $5, activo = $6
             WHERE id_estudiante = $7`,
            [cedula, nombres, apellidos, fecha_nacimiento, id_representante, activo === true || activo === 'on', req.params.id]
        );
        if (resultado.rowCount === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado.' });
        }
        res.json({ ok: true });
    } catch (error) {
        console.error('Error al actualizar estudiante:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un estudiante registrado con esa cedula.' });
        }
        res.status(500).json({ error: 'No se pudo actualizar el estudiante.' });
    }
});

module.exports = router;
