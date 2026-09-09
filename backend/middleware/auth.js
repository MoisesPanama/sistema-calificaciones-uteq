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
async function setUsuarioAuditoria(idUsuario) {
    await pool.query("SELECT set_config('app.current_user_id', $1, false)", [
        idUsuario ? String(idUsuario) : ''
    ]);
}

module.exports = {
    requireAuth,
    requireRole,
    setUsuarioAuditoria
};
