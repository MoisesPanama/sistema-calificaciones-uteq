// =========================================================
// routes/periodos.js
// Listado y creacion de periodos academicos
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');

// GET /periodos -> listado
router.get('/periodos', requireAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT id_periodo, nombre, fecha_inicio, fecha_fin, activo FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );

        res.render('periodos/index', {
            periodos: resultado.rows,
            errores: []
        });

    } catch (error) {
        console.error('Error al listar periodos:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar el listado de periodos.' });
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
        const resultado = await pool.query(
            'SELECT id_periodo, nombre, fecha_inicio, fecha_fin, activo FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );
        return res.render('periodos/index', {
            periodos: resultado.rows,
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

        const resultado = await pool.query(
            'SELECT id_periodo, nombre, fecha_inicio, fecha_fin, activo FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );
        res.render('periodos/index', {
            periodos: resultado.rows,
            errores: [mensaje]
        });
    }
});

module.exports = router;