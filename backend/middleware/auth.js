// =========================================================
// middleware/auth.js
// Middleware de autenticacion, autorizacion y auditoria
// =========================================================

const pool = require('../config/db');

// Verifica que haya una sesion activa (usuario logueado).
// Si no, redirige al login.
function requireAuth(req, res, next) {
    if (!req.session.usuario) {
        return res.redirect('/login');
    }
    next();
}

// Verifica que el usuario logueado tenga uno de los roles
// permitidos para acceder a la ruta. Se usa despues de requireAuth.
// Ejemplo de uso: requireRole('administrador')
function requireRole(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.session.usuario) {
            return res.redirect('/login');
        }
        if (!rolesPermitidos.includes(req.session.usuario.nombre_rol)) {
            return res.status(403).render('error', {
                mensaje: 'No tienes permiso para acceder a esta seccion.'
            });
        }
        next();
    };
}

// Hace disponible el usuario logueado en todas las vistas EJS
// automaticamente, sin tener que pasarlo manualmente en cada render.
function inyectarUsuario(req, res, next) {
    res.locals.usuario = req.session.usuario || null;
    next();
}

// Antes de cada operacion de escritura en la BD, setea
// app.current_user_id en la sesion de PostgreSQL, para que
// el trigger de auditoria sepa que usuario de la app hizo el cambio.
async function setUsuarioAuditoria(idUsuario) {
    await pool.query("SELECT set_config('app.current_user_id', $1, false)", [
        idUsuario ? String(idUsuario) : ''
    ]);
}

module.exports = {
    requireAuth,
    requireRole,
    inyectarUsuario,
    setUsuarioAuditoria
};