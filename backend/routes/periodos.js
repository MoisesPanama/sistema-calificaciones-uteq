// =========================================================
// routes/periodos.js
// Listado y creacion de periodos academicos
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole, setUsuarioAuditoria } = require('../middleware/auth');
const { getPeriodoActivo } = require('../helpers/contexto');

// GET /periodos -> listado (marca cual es el ACTIVO/fijo)
router.get('/periodos', requireAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT id_periodo, nombre, fecha_inicio, fecha_fin, activo FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );
        const periodoActivo = await getPeriodoActivo();
        const exito = req.query.exito || null;

        res.render('periodos/index', {
            periodos: resultado.rows,
            periodoActivo,
            exito,
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
        const periodoActivo = await getPeriodoActivo();
        return res.render('periodos/index', {
            periodos: resultado.rows,
            periodoActivo,
            exito: null,
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
            periodoActivo: await getPeriodoActivo().catch(() => null),
            exito: null,
            errores: [mensaje]
        });
    }
});

// POST /periodos/:id/activar -> fija el periodo activo (solo admin).
// El trigger trg_solo_un_periodo_activo desactiva los demas:
// solo UN periodo activo a la vez. Al cambiar de periodo,
// cursos/materias/promedios empiezan de cero (son otro periodo).
router.post('/periodos/:id/activar', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        await setUsuarioAuditoria(req.session.usuario.id_usuario);
        const r = await pool.query(
            'UPDATE periodos_academicos SET activo = TRUE WHERE id_periodo = $1 RETURNING nombre',
            [req.params.id]
        );
        if (r.rows.length === 0) {
            return res.status(404).render('error', { mensaje: 'Periodo no encontrado.' });
        }
        res.redirect('/periodos?exito=' + encodeURIComponent('Periodo "' + r.rows[0].nombre + '" activado. Todo el sistema opera ahora sobre este periodo.'));
    } catch (error) {
        console.error('Error al activar periodo:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo activar el periodo.' });
    }
});

module.exports = router;