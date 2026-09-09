// =========================================================
// routes/periodos.js
// Listado, creacion y edicion de periodos academicos
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');
const { getAllPeriodos } = require('../helpers/periodos');

// GET /periodos -> listado
router.get('/periodos', requireAuth, async (req, res) => {
    try {
        const periodos = await getAllPeriodos();

        res.render('periodos/index', {
            periodos,
            periodoEditar: null,
            errores: []
        });

    } catch (error) {
        console.error('Error al listar periodos:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar el listado de periodos.' });
    }
});

// GET /periodos/:id/editar -> formulario de edicion
router.get('/periodos/:id/editar', requireAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT * FROM periodos_academicos WHERE id_periodo = $1',
            [req.params.id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).render('error', { mensaje: 'Periodo no encontrado.' });
        }

        const periodos = await getAllPeriodos();

        res.render('periodos/index', {
            periodos,
            periodoEditar: resultado.rows[0],
            errores: []
        });
    } catch (error) {
        console.error('Error al cargar periodo:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar el periodo.' });
    }
});

// POST /periodos -> crea un nuevo periodo academico
router.post('/periodos', requireAuth, async (req, res) => {
    const { nombre, fecha_inicio, fecha_fin } = req.body;
    const errores = [];

    if (!nombre || nombre.trim() === '') {
        errores.push('El nombre del periodo es obligatorio.');
    }
    if (!fecha_inicio) {
        errores.push('La fecha de inicio es obligatoria.');
    }
    if (!fecha_fin) {
        errores.push('La fecha de fin es obligatoria.');
    }

    if (errores.length > 0) {
        const periodos = await getAllPeriodos();
        return res.render('periodos/index', {
            periodos,
            periodoEditar: null,
            errores
        });
    }

    try {
        await setUsuarioAuditoria(req.session.usuario.id_usuario);

        await pool.query(
            'INSERT INTO periodos_academicos (nombre, fecha_inicio, fecha_fin) VALUES ($1, $2, $3)',
            [nombre, fecha_inicio, fecha_fin]
        );

        res.redirect('/periodos');

    } catch (error) {
        console.error('Error al crear periodo:', error.message);

        let mensaje = 'No se pudo guardar el periodo.';
        if (error.code === '23505') {
            mensaje = 'Ya existe un periodo registrado con ese nombre.';
        } else if (error.code === '23514') {
            mensaje = 'La fecha de fin debe ser posterior a la fecha de inicio.';
        }

        const periodos = await getAllPeriodos();
        res.render('periodos/index', {
            periodos,
            periodoEditar: null,
            errores: [mensaje]
        });
    }
});

// PUT /periodos/:id -> actualiza un periodo existente
router.put('/periodos/:id', requireAuth, async (req, res) => {
    const { nombre, fecha_inicio, fecha_fin, activo } = req.body;
    const errores = [];

    if (!nombre || nombre.trim() === '') {
        errores.push('El nombre del periodo es obligatorio.');
    }
    if (!fecha_inicio) {
        errores.push('La fecha de inicio es obligatoria.');
    }
    if (!fecha_fin) {
        errores.push('La fecha de fin es obligatoria.');
    }

    if (errores.length > 0) {
        const periodos = await getAllPeriodos();
        const periodoEditar = { id_periodo: req.params.id, nombre, fecha_inicio, fecha_fin, activo: activo === 'on' };
        return res.render('periodos/index', {
            periodos,
            periodoEditar,
            errores
        });
    }

    try {
        await setUsuarioAuditoria(req.session.usuario.id_usuario);

        const resultado = await pool.query(
            `UPDATE periodos_academicos
             SET nombre = $1, fecha_inicio = $2, fecha_fin = $3, activo = $4
             WHERE id_periodo = $5`,
            [nombre, fecha_inicio, fecha_fin, activo === 'on', req.params.id]
        );

        if (resultado.rowCount === 0) {
            return res.status(404).render('error', { mensaje: 'Periodo no encontrado.' });
        }

        res.redirect('/periodos');

    } catch (error) {
        console.error('Error al actualizar periodo:', error.message);

        let mensaje = 'No se pudo actualizar el periodo.';
        if (error.code === '23505') {
            mensaje = 'Ya existe un periodo registrado con ese nombre.';
        } else if (error.code === '23514') {
            mensaje = 'La fecha de fin debe ser posterior a la fecha de inicio.';
        }

        const periodos = await getAllPeriodos();
        const periodoEditar = { id_periodo: req.params.id, nombre, fecha_inicio, fecha_fin, activo: activo === 'on' };
        res.render('periodos/index', {
            periodos,
            periodoEditar,
            errores: [mensaje]
        });
    }
});

module.exports = router;