// =========================================================
// routes/estudiantes.js — CRUD JSON de estudiantes
// GET    /api/estudiantes?q=
// GET    /api/estudiantes/representantes (select del form)
// GET    /api/estudiantes/:id
// POST   /api/estudiantes
// PUT    /api/estudiantes/:id
// =========================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');
const { leerPaginacion, respuestaPaginada } = require('../helpers/paginacion');

const PASSWORD_DEFAULT = 'UTEQ2026';
const ROL_ESTUDIANTE = 5; // rol estudiante (se crea si no existe)

// Genera email: primera letra nombre + primer apellido + primera letra segundo apellido @uteq.edu.ec
function generarEmail(nombres, apellidos) {
    const partsNom = String(nombres).trim().split(/\s+/);
    const partsApe = String(apellidos).trim().split(/\s+/);
    const primera = partsNom[0] ? partsNom[0][0].toLowerCase() : '';
    const primerApe = partsApe[0] ? partsApe[0].toLowerCase() : '';
    const segunda = partsApe[1] ? partsApe[1][0].toLowerCase() : '';
    return `${primera}${primerApe}${segunda}@uteq.edu.ec`;
}

// Crea un usuario con password UTEQ2026 y retorna { id_usuario, email }
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

// Asegura que el rol "estudiante" exista
async function asegurarRolEstudiante(conn) {
    let r = await conn.query("SELECT id_rol FROM roles WHERE nombre_rol = 'estudiante'");
    if (r.rows.length === 0) {
        r = await conn.query("INSERT INTO roles (nombre_rol) VALUES ('estudiante') RETURNING id_rol");
    }
    return r.rows[0].id_rol;
}

// Trae el listado de representantes, usado en el formulario (select)
async function obtenerRepresentantes() {
    const resultado = await pool.query(
        'SELECT id_representante, nombres, apellidos FROM representantes ORDER BY apellidos, nombres'
    );
    return resultado.rows;
}

// GET /api/estudiantes/representantes -> OJO: va antes de /:id
router.get('/representantes', requireAuth, async (req, res) => {
    try {
        res.json({ representantes: await obtenerRepresentantes() });
    } catch (error) {
        console.error('Error al listar representantes:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los representantes.' });
    }
});

// GET /api/estudiantes?q=&page=&limit= -> listado con buscador (paginado)
router.get('/', requireAuth, async (req, res) => {
    try {
        const busqueda = req.query.q || '';
        const { page, limit, offset } = leerPaginacion(req.query, { porDefecto: 10, minimo: 5 });
        const filtro = [`%${busqueda}%`];

        const countResult = await pool.query(
            `SELECT COUNT(*) AS total
             FROM estudiantes e
             JOIN representantes r ON r.id_representante = e.id_representante
             WHERE (e.nombres ILIKE $1 OR e.apellidos ILIKE $1 OR e.cedula ILIKE $1
                    OR (e.nombres || ' ' || e.apellidos) ILIKE $1)`,
            filtro
        );

        const resultado = await pool.query(
            `SELECT e.id_estudiante, e.cedula, e.nombres, e.apellidos,
                    e.fecha_nacimiento, e.activo, e.id_representante,
                    r.nombres AS rep_nombres, r.apellidos AS rep_apellidos
             FROM estudiantes e
             JOIN representantes r ON r.id_representante = e.id_representante
             WHERE (e.nombres ILIKE $1 OR e.apellidos ILIKE $1 OR e.cedula ILIKE $1
                    OR (e.nombres || ' ' || e.apellidos) ILIKE $1)
             ORDER BY e.apellidos, e.nombres
             LIMIT $2 OFFSET $3`,
            [`%${busqueda}%`, limit, offset]
        );

        res.json({ ...respuestaPaginada(resultado.rows, { page, limit, total: countResult.rows[0].total }), busqueda });

    } catch (error) {
        console.error('Error al listar estudiantes:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el listado de estudiantes.' });
    }
});

// GET /api/estudiantes/:id -> un estudiante (para editar)
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT * FROM estudiantes WHERE id_estudiante = $1',
            [req.params.id]
        );
        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado.' });
        }
        res.json({ estudiante: resultado.rows[0] });
    } catch (error) {
        console.error('Error al cargar estudiante:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el estudiante.' });
    }
});

// Valida los campos obligatorios y devuelve un arreglo de errores
function validarEstudiante(body) {
    const errores = [];
    if (!body.cedula || String(body.cedula).trim() === '') errores.push('La cedula es obligatoria.');
    if (!body.nombres || String(body.nombres).trim() === '') errores.push('El nombre es obligatorio.');
    if (!body.apellidos || String(body.apellidos).trim() === '') errores.push('El apellido es obligatorio.');
    if (body.nombres && body.nombres.trim().split(/\s+/).length < 2) errores.push('Debe ingresar dos nombres.');
    if (body.apellidos && body.apellidos.trim().split(/\s+/).length < 2) errores.push('Debe ingresar dos apellidos.');
    if (!body.fecha_nacimiento) errores.push('La fecha de nacimiento es obligatoria.');
    if (!body.id_representante) errores.push('Debes seleccionar un representante.');
    return errores;
}

// POST /api/estudiantes -> crea un nuevo estudiante + usuario con password UTEQ2026
router.post('/', requireAuth, async (req, res) => {
    const { cedula, nombres, apellidos, fecha_nacimiento, id_representante } = req.body || {};
    const errores = validarEstudiante(req.body || {});
    if (errores.length > 0) {
        return res.status(400).json({ error: errores.join(' '), errores });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);

        const email = generarEmail(nombres, apellidos);
        const rolId = await asegurarRolEstudiante(client);
        const { id_usuario: idUsuario, email: finalEmail } = await crearUsuario(client, nombres, apellidos, email, rolId);

        const r = await client.query(
            `INSERT INTO estudiantes (cedula, nombres, apellidos, fecha_nacimiento, id_representante, id_usuario)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_estudiante`,
            [cedula, nombres.trim(), apellidos.trim(), fecha_nacimiento, id_representante, idUsuario]
        );
        await client.query('COMMIT');
        res.status(201).json({ ok: true, id_estudiante: r.rows[0].id_estudiante, email: finalEmail, password: PASSWORD_DEFAULT });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al crear estudiante:', error.message);
        if (error.code === '23505') {
            if (error.detail && error.detail.includes('cedula')) {
                return res.status(409).json({ error: 'Ya existe un estudiante registrado con esa cedula.' });
            }
            return res.status(409).json({ error: 'Ya existe un registro con esos datos (posible email duplicado).' });
        }
        res.status(500).json({ error: 'No se pudo guardar el estudiante.' });
    } finally {
        client.release();
    }
});

// PATCH /api/estudiantes/:id/activo — toggle activo/inactivo
router.patch('/:id/activo', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            `UPDATE estudiantes SET activo = NOT activo
             WHERE id_estudiante = $1 RETURNING id_estudiante, activo`,
            [req.params.id]
        );
        await client.query('COMMIT');
        if (r.rowCount === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado.' });
        }
        res.json({ ok: true, activo: r.rows[0].activo });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al cambiar estado:', error.message);
        res.status(500).json({ error: 'No se pudo cambiar el estado.' });
    } finally {
        client.release();
    }
});

// PUT /api/estudiantes/:id -> actualiza un estudiante existente
router.put('/:id', requireAuth, async (req, res) => {
    const { cedula, nombres, apellidos, fecha_nacimiento, id_representante, activo } = req.body || {};
    const errores = validarEstudiante(req.body || {});
    if (errores.length > 0) {
        return res.status(400).json({ error: errores.join(' '), errores });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const resultado = await client.query(
            `UPDATE estudiantes
             SET cedula = $1, nombres = $2, apellidos = $3,
                 fecha_nacimiento = $4, id_representante = $5, activo = $6
             WHERE id_estudiante = $7`,
            [cedula, nombres, apellidos, fecha_nacimiento, id_representante, activo === true || activo === 'on', req.params.id]
        );
        await client.query('COMMIT');
        if (resultado.rowCount === 0) {
            return res.status(404).json({ error: 'Estudiante no encontrado.' });
        }
        res.json({ ok: true });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al actualizar estudiante:', error.message);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un estudiante registrado con esa cedula.' });
        }
        res.status(500).json({ error: 'No se pudo actualizar el estudiante.' });
    } finally {
        client.release();
    }
});

module.exports = router;
