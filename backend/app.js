// =========================================================
// app.js — API REST del Sistema de Calificaciones (backend)
// ---------------------------------------------------------
// Este backend es SOLO API JSON (prefijo /api/*).
// La interfaz vive en /frontend (HTML/CSS/JS estatico que
// consume esta API con fetch + credentials: 'include').
// =========================================================

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cors = require('cors');
const pool = require('./config/db');

const app = express();

// CORS para el frontend separado (otro puerto/origen).
// En produccion define FRONTEND_URL con el dominio real.
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));

// La API habla JSON (el frontend envia JSON por fetch).
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!process.env.SESSION_SECRET) {
    console.warn('AVISO: SESSION_SECRET no definido (falta backend/.env). Usando clave solo para desarrollo.');
}
app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'sesiones',
        schemaName: 'colegio'
    }),
    secret: process.env.SESSION_SECRET || 'uteq-dev-secret-solo-desarrollo',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 4, // 4 horas
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Salud (para verificar que la API esta viva sin auth)
app.get('/api/health', (req, res) => {
    res.json({ ok: true, servicio: 'api-calificaciones-uteq' });
});

// Rutas de la API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/estudiantes', require('./routes/estudiantes'));
app.use('/api/materias', require('./routes/materias'));
app.use('/api/periodos', require('./routes/periodos'));
app.use('/api/calificaciones', require('./routes/calificaciones'));
app.use('/api/consulta', require('./routes/consulta'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/auditoria', require('./routes/auditoria'));
app.use('/api/catalogos', require('./routes/catalogos'));

// 404 JSON (antes: render de vista error)
app.use((req, res) => {
    res.status(404).json({ error: 'Recurso no encontrado.' });
});

// Manejador global de errores -> siempre JSON
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Error no controlado:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`API corriendo en http://localhost:${PORT} (frontend: ${process.env.FRONTEND_URL || 'http://localhost:5173'})`);
    });
}

module.exports = app;
