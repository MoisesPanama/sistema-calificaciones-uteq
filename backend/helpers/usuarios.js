// =========================================================
// helpers/usuarios.js — Creacion de usuarios con email unico
// (M3: extraido del patron ya usado en estudiantes.js y
// representantes.js para reutilizarlo en la aprobacion de
// preinscripciones. Esos archivos conservan su copia local
// para no tocar codigo que ya funciona y esta probado.)
// =========================================================

const bcrypt = require('bcrypt');

const PASSWORD_DEFAULT = 'UTEQ2026';

function generarEmail(nombres, apellidos) {
    const pNom = String(nombres).trim().split(/\s+/);
    const pApe = String(apellidos).trim().split(/\s+/);
    const primera = pNom[0] ? pNom[0][0].toLowerCase() : '';
    const primerApe = pApe[0] ? pApe[0].toLowerCase() : '';
    const segunda = pApe[1] ? pApe[1][0].toLowerCase() : '';
    return `${primera}${primerApe}${segunda}@uteq.edu.ec`;
}

async function crearUsuario(conn, nombres, apellidos, email, idRol) {
    const hash = await bcrypt.hash(PASSWORD_DEFAULT, 10);
    let finalEmail = email;
    let attempt = 1;
    while (attempt <= 50) {
        const exists = await conn.query('SELECT id_usuario FROM usuarios WHERE email = $1', [finalEmail]);
        if (exists.rows.length === 0) {
            const r = await conn.query(
                'INSERT INTO usuarios (nombres, apellidos, email, password_hash, id_rol) VALUES ($1, $2, $3, $4, $5) RETURNING id_usuario',
                [nombres.trim(), apellidos.trim(), finalEmail, hash, idRol]
            );
            return { id_usuario: r.rows[0].id_usuario, email: finalEmail };
        }
        attempt++;
        finalEmail = email.replace('@', attempt + '@');
    }
    throw new Error('No se pudo generar un email unico tras 50 intentos.');
}

async function asegurarRol(conn, nombreRol) {
    let r = await conn.query('SELECT id_rol FROM roles WHERE nombre_rol = $1', [nombreRol]);
    if (r.rows.length === 0) {
        r = await conn.query('INSERT INTO roles (nombre_rol) VALUES ($1) RETURNING id_rol', [nombreRol]);
    }
    return r.rows[0].id_rol;
}

module.exports = { PASSWORD_DEFAULT, generarEmail, crearUsuario, asegurarRol };
