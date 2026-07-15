// =========================================================
// routes/estudiantes.js
// Listado, busqueda, creacion y edicion de estudiantes
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');

// GET /estudiantes -> listado con buscador
router.get('/estudiantes', requireAuth, async (req, res) => {
    try {
        const busqueda = req.query.q || '';

        const resultado = await pool.query(
            `SELECT e.id_estudiante, e.cedula, e.nombres, e.apellidos,
                    e.fecha_nacimiento, e.activo,
                    r.nombres AS rep_nombres, r.apellidos AS rep_apellidos
             FROM estudiantes e
             JOIN representantes r ON r.id_representante = e.id_representante
WHERE (e.nombres ILIKE $1 OR e.apellidos ILIKE $1 OR e.cedula ILIKE $1
                    OR (e.nombres || ' ' || e.apellidos) ILIKE $1)             
             ORDER BY e.apellidos, e.nombres`,
            [`%${busqueda}%`]
        );

        res.render('estudiantes/list', {
            estudiantes: resultado.rows,
            busqueda
        });

    } catch (error) {
        console.error('Error al listar estudiantes:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar el listado de estudiantes.' });
    }
});

// Trae el listado de representantes, usado en el formulario (select)
async function obtenerRepresentantes() {
    const resultado = await pool.query(
        'SELECT id_representante, nombres, apellidos FROM representantes ORDER BY apellidos, nombres'
    );
    return resultado.rows;
}

// GET /estudiantes/nuevo -> formulario de creacion
router.get('/estudiantes/nuevo', requireAuth, async (req, res) => {
    try {
        const representantes = await obtenerRepresentantes();
        res.render('estudiantes/form', {
            estudiante: null,
            representantes,
            errores: []
        });
    } catch (error) {
        console.error('Error al cargar formulario de estudiante:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar el formulario.' });
    }
});

// GET /estudiantes/:id/editar -> formulario de edicion
router.get('/estudiantes/:id/editar', requireAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT * FROM estudiantes WHERE id_estudiante = $1',
            [req.params.id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).render('error', { mensaje: 'Estudiante no encontrado.' });
        }

        const representantes = await obtenerRepresentantes();
        res.render('estudiantes/form', {
            estudiante: resultado.rows[0],
            representantes,
            errores: []
        });
    } catch (error) {
        console.error('Error al cargar estudiante:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar el estudiante.' });
    }
});

// Valida los campos obligatorios y devuelve un arreglo de errores
function validarEstudiante(body) {
    const errores = [];

    if (!body.cedula || body.cedula.trim() === '') errores.push('La cedula es obligatoria.');
    if (!body.nombres || body.nombres.trim() === '') errores.push('El nombre es obligatorio.');
    if (!body.apellidos || body.apellidos.trim() === '') errores.push('El apellido es obligatorio.');
    if (!body.fecha_nacimiento) errores.push('La fecha de nacimiento es obligatoria.');
    if (!body.id_representante) errores.push('Debes seleccionar un representante.');

    return errores;
}

// POST /estudiantes -> crea un nuevo estudiante
router.post('/estudiantes', requireAuth, async (req, res) => {
    const { cedula, nombres, apellidos, fecha_nacimiento, id_representante } = req.body;
    const errores = validarEstudiante(req.body);

    if (errores.length > 0) {
        const representantes = await obtenerRepresentantes();
        return res.render('estudiantes/form', {
            estudiante: req.body,
            representantes,
            errores
        });
    }

    try {
        await setUsuarioAuditoria(req.session.usuario.id_usuario);

        await pool.query(
            `INSERT INTO estudiantes (cedula, nombres, apellidos, fecha_nacimiento, id_representante)
             VALUES ($1, $2, $3, $4, $5)`,
            [cedula, nombres, apellidos, fecha_nacimiento, id_representante]
        );

        res.redirect('/estudiantes');

    } catch (error) {
        console.error('Error al crear estudiante:', error.message);

        let mensaje = 'No se pudo guardar el estudiante.';
        if (error.code === '23505') { // codigo de PostgreSQL para violacion de UNIQUE
            mensaje = 'Ya existe un estudiante registrado con esa cedula.';
        }

        const representantes = await obtenerRepresentantes();
        res.render('estudiantes/form', {
            estudiante: req.body,
            representantes,
            errores: [mensaje]
        });
    }
});

// PUT /estudiantes/:id -> actualiza un estudiante existente
router.put('/estudiantes/:id', requireAuth, async (req, res) => {
    const { cedula, nombres, apellidos, fecha_nacimiento, id_representante, activo } = req.body;
    const errores = validarEstudiante(req.body);

    if (errores.length > 0) {
        const representantes = await obtenerRepresentantes();
        return res.render('estudiantes/form', {
            estudiante: { ...req.body, id_estudiante: req.params.id },
            representantes,
            errores
        });
    }

    try {
        await setUsuarioAuditoria(req.session.usuario.id_usuario);

        const resultado = await pool.query(
            `UPDATE estudiantes
             SET cedula = $1, nombres = $2, apellidos = $3,
                 fecha_nacimiento = $4, id_representante = $5, activo = $6
             WHERE id_estudiante = $7`,
            [cedula, nombres, apellidos, fecha_nacimiento, id_representante, activo === 'on', req.params.id]
        );

        if (resultado.rowCount === 0) {
            return res.status(404).render('error', { mensaje: 'Estudiante no encontrado.' });
        }

        res.redirect('/estudiantes');

    } catch (error) {
        console.error('Error al actualizar estudiante:', error.message);

        let mensaje = 'No se pudo actualizar el estudiante.';
        if (error.code === '23505') {
            mensaje = 'Ya existe un estudiante registrado con esa cedula.';
        }

        const representantes = await obtenerRepresentantes();
        res.render('estudiantes/form', {
            estudiante: { ...req.body, id_estudiante: req.params.id },
            representantes,
            errores: [mensaje]
        });
    }
});

module.exports = router;