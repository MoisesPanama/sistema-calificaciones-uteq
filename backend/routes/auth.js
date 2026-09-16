// =========================================================
// routes/auth.js — POST /api/auth/login, POST /logout, GET /me
// =========================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// POST /api/auth/login { email, password } -> { usuario }
router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ error: 'Debes ingresar email y contrasena.' });
    }

    try {
        const resultado = await pool.query(
            `SELECT u.id_usuario, u.nombres, u.apellidos, u.email,
                    u.password_hash, u.activo, r.nombre_rol
             FROM colegio.usuarios u
             JOIN colegio.roles r ON r.id_rol = u.id_rol
             WHERE u.email = $1`,
            [email]
        );

        if (resultado.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales invalidas.' });
        }

        const usuario = resultado.rows[0];

        if (!usuario.activo) {
            return res.status(403).json({ error: 'Este usuario esta inactivo.' });
        }

        const passwordValida = await bcrypt.compare(password, usuario.password_hash);
        if (!passwordValida) {
            return res.status(401).json({ error: 'Credenciales invalidas.' });
        }

        req.session.usuario = {
            id_usuario: usuario.id_usuario,
            nombres: usuario.nombres,
            apellidos: usuario.apellidos,
            email: usuario.email,
            nombre_rol: usuario.nombre_rol
        };

        res.json({ usuario: req.session.usuario });

    } catch (error) {
        console.error('Error en login:', error.message);
        res.status(500).json({ error: 'Ocurrio un error al iniciar sesion.' });
    }
});

// GET /api/auth/me -> sesion actual (el frontend lo usa como guard)
router.get('/me', (req, res) => {
    if (!req.session.usuario) {
        return res.status(401).json({ error: 'No autenticado.' });
    }
    res.json({
        usuario: req.session.usuario,
        periodoSeleccionado: req.session.periodoSeleccionado || null
    });
});

// POST /api/auth/periodo-seleccionado -> guarda periodo activo en sesion
router.post('/periodo-seleccionado', requireAuth, (req, res) => {
    const { id_periodo } = req.body || {};
    if (!id_periodo) return res.status(400).json({ error: 'Falta id_periodo.' });
    req.session.periodoSeleccionado = Number(id_periodo);
    res.json({ ok: true });
});

// PUT /api/auth/password { actual, nueva } -> cambio de clave propia.
// M8 seguridad minima: antes no habia forma de cambiarla sin psql.
router.put('/password', requireAuth, async (req, res) => {
    const { actual, nueva } = req.body || {};
    if (!actual || !nueva) {
        return res.status(400).json({ error: 'Debes ingresar tu clave actual y la nueva.' });
    }
    if (String(nueva).length < 6) {
        return res.status(400).json({ error: 'La nueva clave debe tener al menos 6 caracteres.' });
    }
    if (String(actual) === String(nueva)) {
        return res.status(400).json({ error: 'La nueva clave debe ser distinta a la actual.' });
    }
    try {
        const r = await pool.query(
            'SELECT password_hash FROM colegio.usuarios WHERE id_usuario = $1',
            [req.session.usuario.id_usuario]
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        const ok = await bcrypt.compare(String(actual), r.rows[0].password_hash);
        if (!ok) {
            return res.status(401).json({ error: 'Tu clave actual no es correcta.' });
        }
        const hash = await bcrypt.hash(String(nueva), 10);
        await pool.query(
            'UPDATE colegio.usuarios SET password_hash = $1 WHERE id_usuario = $2',
            [hash, req.session.usuario.id_usuario]
        );
        res.json({ ok: true, mensaje: 'Clave actualizada.' });
    } catch (error) {
        console.error('Error al cambiar clave:', error.message);
        res.status(500).json({ error: 'No se pudo cambiar la clave.' });
    }
});

// POST /api/auth/logout -> destruye la sesion
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'No se pudo cerrar sesion.' });
        }
        res.clearCookie('connect.sid');
        res.json({ ok: true });
    });
});

module.exports = router;
