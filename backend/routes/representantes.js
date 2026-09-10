// =========================================================
// routes/representantes.js — CRUD de representantes.
// Lectura y escritura: cualquier autenticado (se crean al
// registrar estudiantes). Regla: no se elimina un
// representante con estudiantes asociados (409).
// =========================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');
const { leerPaginacion, respuestaPaginada } = require('../helpers/paginacion');

const PASSWORD_DEFAULT = 'UTEQ2026';

// Genera email: primera letra nombre + primer apellido + primera letra segundo apellido @uteq.edu.ec
function generarEmail(nombres, apellidos) {
    const partsNom = String(nombres).trim().split(/\s+/);
    const partsApe = String(apellidos).trim().split(/\s+/);
    const primera = partsNom[0] ? partsNom[0][0].toLowerCase() : '';
    const primerApe = partsApe[0] ? partsApe[0].toLowerCase() : '';
    const segunda = partsApe[1] ? partsApe[1][0].toLowerCase() : '';
    return `${primera}${primerApe}${segunda}@uteq.edu.ec`;
}

// Crea un usuario con password UTEQ2026 y retorna id_usuario
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

// GET /api/representantes?q=&page=&limit= -> buscador (combobox)
router.get('/', requireAuth, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        const { page, limit, offset } = leerPaginacion(req.query, { porDefecto: 10, minimo: 5 });
        const filtro = [`%${q}%`];
        const where = q !== ''
            ? `WHERE (r.nombres ILIKE $1 OR r.apellidos ILIKE $1 OR (r.nombres || ' ' || r.apellidos) ILIKE $1
                      OR COALESCE(r.telefono, '') ILIKE $1 OR COALESCE(r.email, '') ILIKE $1)`
            : '';
        const countResult = await pool.query(
            `SELECT COUNT(*) AS total FROM representantes r ${where}`,
            q !== '' ? filtro : []
        );
        const resultado = await pool.query(
            `SELECT r.id_representante, r.nombres, r.apellidos, r.telefono, r.email,
                    (SELECT COUNT(*)::int FROM estudiantes e WHERE e.id_representante = r.id_representante) AS n_estudiantes
             FROM representantes r
             ${where}
             ORDER BY r.apellidos, r.nombres
             LIMIT $${(q !== '' ? 2 : 1)} OFFSET $${(q !== '' ? 3 : 2)}`,
            q !== '' ? [...filtro, limit, offset] : [limit, offset]
        );
        res.json(respuestaPaginada(resultado.rows, { page, limit, total: countResult.rows[0].total }));
    } catch (error) {
        console.error('Error al listar representantes:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los representantes.' });
    }
});

// GET /api/representantes/:id -> uno solo
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT id_representante, nombres, apellidos, telefono, email FROM representantes WHERE id_representante = $1',
            [req.params.id]
        );
        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: 'Representante no encontrado.' });
        }
        res.json({ representante: resultado.rows[0] });
    } catch (error) {
        console.error('Error al cargar representante:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el representante.' });
    }
});

function validarRepresentante(body) {
    const errores = [];
    if (!body.nombres || String(body.nombres).trim() === '') errores.push('El nombre es obligatorio.');
    if (!body.apellidos || String(body.apellidos).trim() === '') errores.push('El apellido es obligatorio.');
    if (body.nombres && body.nombres.trim().split(/\s+/).length < 2) errores.push('Debe ingresar dos nombres.');
    if (body.apellidos && body.apellidos.trim().split(/\s+/).length < 2) errores.push('Debe ingresar dos apellidos.');
    return errores;
}

// POST /api/representantes -> crear. Si ya existe uno igual
// (mismo nombre+apellido+telefono), devuelve 409 con su id
// para que la UI lo seleccione en vez de duplicarlo.
router.post('/', requireAuth, async (req, res) => {
    const { nombres, apellidos, telefono } = req.body || {};
    const errores = validarRepresentante(req.body || {});
    if (errores.length > 0) return res.status(400).json({ error: errores.join(' '), errores });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const dup = await client.query(
            `SELECT id_representante FROM representantes
             WHERE LOWER(nombres) = LOWER($1) AND LOWER(apellidos) = LOWER($2)
               AND COALESCE(telefono, '') = COALESCE($3, '')`,
            [String(nombres).trim(), String(apellidos).trim(), telefono || null]
        );
        if (dup.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                error: 'Ya existe un representante con esos datos.',
                id_representante: dup.rows[0].id_representante
            });
        }

        const email = generarEmail(nombres, apellidos);
        let rRol = await client.query("SELECT id_rol FROM roles WHERE nombre_rol = 'representante'");
        const rolId = rRol.rows[0].id_rol;
        const { id_usuario: idUsuario, email: finalEmail } = await crearUsuario(client, nombres, apellidos, email, rolId);

        const r = await client.query(
            'INSERT INTO representantes (nombres, apellidos, telefono, email, id_usuario) VALUES ($1, $2, $3, $4, $5) RETURNING id_representante',
            [String(nombres).trim(), String(apellidos).trim(), telefono || null, finalEmail, idUsuario]
        );
        await client.query('COMMIT');
        res.status(201).json({ ok: true, id_representante: r.rows[0].id_representante, email: finalEmail, password: PASSWORD_DEFAULT });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al crear representante:', error.message);
        res.status(500).json({ error: 'No se pudo guardar el representante.' });
    } finally {
        client.release();
    }
});

// PUT /api/representantes/:id -> editar
router.put('/:id', requireAuth, async (req, res) => {
    const { nombres, apellidos, telefono, email } = req.body || {};
    const errores = validarRepresentante(req.body || {});
    if (errores.length > 0) return res.status(400).json({ error: errores.join(' '), errores });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            `UPDATE representantes SET nombres = $1, apellidos = $2, telefono = $3, email = $4
             WHERE id_representante = $5 RETURNING id_representante`,
            [String(nombres).trim(), String(apellidos).trim(), telefono || null, email || null, req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Representante no encontrado.' });
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Representante actualizado correctamente.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al editar representante:', error.message);
        res.status(500).json({ error: 'No se pudo editar el representante.' });
    } finally {
        client.release();
    }
});

// DELETE /api/representantes/:id -> eliminar, bloqueado con estudiantes
router.delete('/:id', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const uso = await client.query(
            'SELECT COUNT(*)::int AS n FROM estudiantes WHERE id_representante = $1',
            [req.params.id]
        );
        if (uso.rows[0].n > 0) {
            return res.status(409).json({
                error: 'No se puede eliminar: tiene estudiantes asociados.'
            });
        }
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            'DELETE FROM representantes WHERE id_representante = $1 RETURNING id_representante',
            [req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Representante no encontrado.' });
        }
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Representante eliminado correctamente.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al eliminar representante:', error.message);
        res.status(500).json({ error: 'No se pudo eliminar el representante.' });
    } finally {
        client.release();
    }
});

module.exports = router;
