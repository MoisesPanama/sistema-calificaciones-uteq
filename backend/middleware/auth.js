// =========================================================
// middleware/auth.js
// Autenticacion y autorizacion para la API REST.
// El frontend (carpeta /frontend) consume estos endpoints
// con fetch + credentials: 'include' (sesion por cookie).
// =========================================================

const pool = require('../config/db');

// 401 JSON si no hay sesion (antes: redirect a /login).
function requireAuth(req, res, next) {
    if (!req.session.usuario) {
        return res.status(401).json({ error: 'No autenticado. Inicia sesion primero.' });
    }
    next();
}

// 403 JSON si el rol no esta permitido (antes: render error).
// Uso: requireRole('administrador')
function requireRole(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.session.usuario) {
            return res.status(401).json({ error: 'No autenticado. Inicia sesion primero.' });
        }
        if (!rolesPermitidos.includes(req.session.usuario.nombre_rol)) {
            return res.status(403).json({ error: 'No tienes permiso para acceder a esta seccion.' });
        }
        next();
    };
}

// Antes de cada escritura en BD, setea app.current_user_id
// para que el trigger de auditoria sepa que usuario hizo el cambio.
// Si se pasa un client (pool.connect()), se usa esa conexion.
// Usa SET LOCAL (is_local = true): el valor vive solo dentro de la
// transaccion en curso y se descarta con COMMIT/ROLLBACK, asi el pool
// nunca recicla una conexion con el usuario de otra request.
// REQUISITO: el client DEBE estar dentro de BEGIN/COMMIT; fuera de
// una transaccion SET LOCAL no tiene efecto.
async function setUsuarioAuditoria(idUsuario, client) {
    const conn = client || pool;
    await conn.query("SELECT set_config('app.current_user_id', $1, true)", [
        idUsuario ? String(idUsuario) : ''
    ]);
}

module.exports = {
    requireAuth,
    requireRole,
    setUsuarioAuditoria
};
