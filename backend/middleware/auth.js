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

// Hace disponible el usuario logueado y los periodos en todas las vistas EJS
// automaticamente, sin tener que pasarlo manualmente en cada render.
async function inyectarUsuario(req, res, next) {
    res.locals.usuario = req.session.usuario || null;

    // Cargar periodos para el selector del header
    try {
        const periodosRes = await pool.query(
            'SELECT id_periodo, nombre, activo FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );
        res.locals.periodos = periodosRes.rows;

        const periodoActivo = periodosRes.rows.find(p => p.activo);
        res.locals.periodoActivo = periodoActivo || null;
    } catch (error) {
        res.locals.periodos = [];
        res.locals.periodoActivo = null;
    }

    // Determinar periodo seleccionado: URL param > sesion > activo
    const urlPeriodo = req.query.id_periodo ? parseInt(req.query.id_periodo, 10) : null;
    const sesionPeriodo = req.session.periodoSeleccionado || null;
    res.locals.periodoSeleccionado = urlPeriodo || sesionPeriodo || (res.locals.periodoActivo ? res.locals.periodoActivo.id_periodo : null);

    // Si se cambio por URL, sincronizar a sesion
    if (urlPeriodo && urlPeriodo !== sesionPeriodo) {
        req.session.periodoSeleccionado = urlPeriodo;
    }

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