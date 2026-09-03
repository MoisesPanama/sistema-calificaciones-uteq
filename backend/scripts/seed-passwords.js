// =========================================================
// scripts/seed-passwords.js
// Reemplaza los 'PENDIENTE_HASH' del seed por hashes bcrypt
// reales (admin123 / profesor123). Idempotente: solo toca
// filas que aun tengan el placeholder.
// Se ejecuta desde backend/ para que resuelvan los requires.
// =========================================================

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const PASSWORDS = {
    'admin@uteq.edu.ec': 'admin123',
    'carla.vera@uteq.edu.ec': 'profesor123',
    'jorge.mendoza@uteq.edu.ec': 'profesor123'
};

async function main() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    try {
        const r = await pool.query(
            "SELECT id_usuario, email FROM colegio.usuarios WHERE password_hash = 'PENDIENTE_HASH'"
        );

        if (r.rows.length === 0) {
            console.log('Passwords OK: no hay hashes pendientes.');
            return;
        }

        for (const u of r.rows) {
            const plain = PASSWORDS[u.email];
            if (!plain) {
                console.log('Sin password definida para ' + u.email + ', se omite.');
                continue;
            }
            const hash = await bcrypt.hash(plain, 10);
            await pool.query(
                'UPDATE colegio.usuarios SET password_hash = $1 WHERE id_usuario = $2',
                [hash, u.id_usuario]
            );
            console.log('Password asignada a ' + u.email);
        }
    } finally {
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Error al asignar passwords:', err.message);
    process.exit(1);
});
