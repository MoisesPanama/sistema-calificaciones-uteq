// =========================================================
// routes/auth.js
// Login y logout del sistema
// =========================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

// GET /login -> muestra el formulario de inicio de sesion
router.get('/login', (req, res) => {
    if (req.session.usuario) {
        return res.redirect('/dashboard');
    }
    res.render('login', { error: null });
});

// POST /login -> valida credenciales y crea la sesion
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('login', { error: 'Debes ingresar email y contrasena.' });
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
            return res.render('login', { error: 'Credenciales invalidas.' });
        }

        const usuario = resultado.rows[0];

        if (!usuario.activo) {
            return res.render('login', { error: 'Este usuario esta inactivo.' });
        }

        const passwordValida = await bcrypt.compare(password, usuario.password_hash);
        if (!passwordValida) {
            return res.render('login', { error: 'Credenciales invalidas.' });
        }

        req.session.usuario = {
            id_usuario: usuario.id_usuario,
            nombres: usuario.nombres,
            apellidos: usuario.apellidos,
            email: usuario.email,
            nombre_rol: usuario.nombre_rol
        };

        res.redirect('/dashboard');

    } catch (error) {
        console.error('Error en login:', error.message);
        res.render('login', { error: 'Ocurrio un error al iniciar sesion.' });
    }
});

// POST /logout -> destruye la sesion
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

module.exports = router;