// =========================================================
// helpers/contexto.js
// Periodo activo ("periodo fijo") + materias/cursos que un
// usuario puede usar. Centraliza la regla:
//  - admin: todo el periodo activo.
//  - profesor: SOLO sus materias/cursos asignados.
// =========================================================

const pool = require('../config/db');

// Periodo con activo = TRUE (solo puede haber uno por el
// indice uq_periodo_unico_activo). Si aun no hay ninguno
// (BD legacy), devuelve el mas reciente para no romper.
async function getPeriodoActivo(client = pool) {
    let r = await client.query(
        `SELECT id_periodo, nombre FROM periodos_academicos
         WHERE activo = TRUE ORDER BY fecha_inicio DESC LIMIT 1`
    );
    if (r.rows.length > 0) return r.rows[0];

    r = await client.query(
        `SELECT id_periodo, nombre FROM periodos_academicos
         ORDER BY fecha_inicio DESC LIMIT 1`
    );
    return r.rows[0] || null;
}

function esAdmin(usuario) {
    return usuario && usuario.nombre_rol === 'administrador';
}

async function getProfesorId(client, idUsuario) {
    const r = await client.query(
        'SELECT id_profesor FROM profesores WHERE id_usuario = $1',
        [idUsuario]
    );
    return r.rows.length > 0 ? r.rows[0].id_profesor : null;
}

// Estudiante vinculado al usuario (los estudiantes tienen login
// propio desde el commit de dashboard-estudiante). NULL si el
// usuario no es un estudiante (admin, profesor, etc.).
async function getEstudianteId(client, idUsuario) {
    const r = await client.query(
        'SELECT id_estudiante FROM estudiantes WHERE id_usuario = $1',
        [idUsuario]
    );
    return r.rows.length > 0 ? r.rows[0].id_estudiante : null;
}

// Materias del periodo que el usuario puede calificar.
// Admin: las que tienen asignacion en el periodo (maestro de
// datos real). Profesor: solo las SUYAS en ese periodo.
async function getMateriasPermitidas(client, usuario, idPeriodo) {
    if (esAdmin(usuario)) {
        const r = await client.query(
            `SELECT DISTINCT m.id_materia, m.nombre
             FROM profesor_materia_periodo pmp
             JOIN materias m ON m.id_materia = pmp.id_materia
             WHERE pmp.id_periodo = $1
             ORDER BY m.nombre`,
            [idPeriodo]
        );
        if (r.rows.length > 0) return r.rows;
        const todas = await client.query(
            'SELECT id_materia, nombre FROM materias ORDER BY nombre'
        );
        return todas.rows;
    }

    const idProfesor = await getProfesorId(client, usuario.id_usuario);
    if (!idProfesor) return [];
    const r = await client.query(
        `SELECT DISTINCT m.id_materia, m.nombre
         FROM profesor_materia_periodo pmp
         JOIN materias m ON m.id_materia = pmp.id_materia
         WHERE pmp.id_periodo = $1 AND pmp.id_profesor = $2
         ORDER BY m.nombre`,
        [idPeriodo, idProfesor]
    );
    return r.rows;
}

// Cursos del periodo visibles para el usuario (mismo criterio).
async function getCursosPermitidos(client, usuario, idPeriodo) {
    try {
        if (esAdmin(usuario)) {
            const r = await client.query(
                `SELECT id_curso, nombre, paralelo FROM cursos
                 WHERE id_periodo = $1 ORDER BY nivel NULLS LAST, nombre, paralelo`,
                [idPeriodo]
            );
            return r.rows;
        }

        const idProfesor = await getProfesorId(client, usuario.id_usuario);
        if (!idProfesor) return [];
        const r = await client.query(
            `SELECT DISTINCT c.id_curso, c.nombre, c.paralelo, c.nivel
             FROM profesor_materia_periodo pmp
             JOIN cursos c ON c.id_curso = pmp.id_curso
             WHERE pmp.id_periodo = $1 AND pmp.id_profesor = $2
             ORDER BY c.nivel NULLS LAST, c.nombre, c.paralelo`,
            [idPeriodo, idProfesor]
        );
        return r.rows;
    } catch (_) {
        return [];
    }
}

// Periodo efectivo de la request (M10, una sola regla):
// ?id_periodo (si existe) -> sesion -> activo. Asi cambiar de
// periodo en el header refleja los registros de ESE periodo
// en todos los roles y endpoints, no los del actual.
async function periodoDe(req, client = pool) {
    const q = req.query && req.query.id_periodo;
    if (q) {
        try {
            const r = await client.query(
                'SELECT id_periodo FROM periodos_academicos WHERE id_periodo = $1',
                [q]
            );
            if (r.rows.length > 0) return String(r.rows[0].id_periodo);
        } catch (_) { /* cae a sesion/activo */ }
    }
    if (req.session && req.session.periodoSeleccionado) {
        return String(req.session.periodoSeleccionado);
    }
    const activo = await getPeriodoActivo(client);
    return activo ? String(activo.id_periodo) : null;
}

module.exports = {
    getPeriodoActivo,
    esAdmin,
    getProfesorId,
    getEstudianteId,
    getMateriasPermitidas,
    getCursosPermitidos,
    periodoDe
};
