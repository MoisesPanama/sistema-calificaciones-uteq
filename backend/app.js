// =========================================================
// app.js
// Punto de entrada del servidor Express
// =========================================================

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const methodOverride = require('method-override');
const path = require('path');
const pool = require('./config/db');
const { inyectarUsuario } = require('./middleware/auth');

const app = express();

// Motor de vistas EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Archivos estaticos (CSS)
app.use(express.static(path.join(__dirname, 'public')));

// Parseo de formularios y metodo override (PUT/DELETE desde forms)
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

// Sesiones guardadas en PostgreSQL (tabla colegio.sesiones)
app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'sesiones',
        schemaName: 'colegio'
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 4 } // 4 horas
}));

// Hace disponible res.locals.usuario en todas las vistas
app.use(inyectarUsuario);

// Rutas
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/dashboard'));
app.use('/', require('./routes/estudiantes'));
app.use('/', require('./routes/materias'));
app.use('/', require('./routes/periodos'));
app.use('/', require('./routes/calificaciones'));
app.use('/', require('./routes/consulta'));

// Ruta raiz: redirige segun si hay sesion o no
app.get('/', (req, res) => {
    res.redirect(req.session.usuario ? '/dashboard' : '/login');
});

// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).render('error', { mensaje: 'Pagina no encontrada.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});