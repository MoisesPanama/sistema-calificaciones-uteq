// =========================================================
// config/db.js
// Configuracion de conexion a PostgreSQL usando un pool
// =========================================================

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

// Set search_path on every new connection
pool.on('connect', () => {
    pool.query('SET search_path TO colegio, public');
});

// Verifica la conexion apenas arranca el servidor,
// para detectar errores de credenciales temprano.
pool.query('SELECT NOW()')
    .then(() => console.log('Conexion a PostgreSQL establecida correctamente.'))
    .catch((err) => console.error('Error al conectar con PostgreSQL:', err.message));

module.exports = pool;
