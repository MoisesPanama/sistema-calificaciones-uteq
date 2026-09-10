// =========================================================
// scripts/seed-test-users.js — Plan v2 Fase 1 (seguridad)
// Asigna la password de PRUEBA a los usuarios de prueba,
// generando el hash bcrypt en el momento en vez de usar un
// hash fijo commiteado en una migracion SQL.
//
// Uso (desde backend/):
//   npm run seed:test-users
//
// Configuracion (variables de entorno, ver .env.example):
//   TEST_USER_PASSWORD  password de prueba (default SOLO-DEV:
//                       'UTEQ2026'). En cualquier entorno
//                       compartido, definir una propia.
//   TEST_USER_IDS       ids separados por coma (default los
//                       usuarios de prueba del seed: admin,
//                       profesores, representante y psicologo).
//
// Idempotente: solo actualiza password_hash, nunca crea ni
// borra usuarios (eso lo hacen las migraciones 05/06/10/11).
// =========================================================

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const DEFAULT_IDS = '1,4,5,6,7,8';

async function main() {
    const password = process.env.TEST_USER_PASSWORD || 'UTEQ2026';
    if (!process.env.TEST_USER_PASSWORD) {
        console.warn(
            'AVISO: TEST_USER_PASSWORD no definido, usando password de prueba ' +
            'por defecto (solo desarrollo local). Define la tuya en backend/.env.'
        );
    }
    const ids = String(process.env.TEST_USER_IDS || DEFAULT_IDS)
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n));

    if (ids.length === 0) {
        console.log('Sin usuarios objetivo (TEST_USER_IDS vacio). Nada que hacer.');
        return;
    }

    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    try {
        const hash = await bcrypt.hash(password, 10);
        const r = await pool.query(
            'UPDATE colegio.usuarios SET password_hash = $1 WHERE id_usuario = ANY($2)',
            [hash, ids]
        );
        console.log(`Password de prueba asignada a ${r.rowCount} usuario(s): ids ${ids.join(', ')}.`);
    } finally {
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Error al asignar passwords de prueba:', err.message);
    process.exit(1);
});
