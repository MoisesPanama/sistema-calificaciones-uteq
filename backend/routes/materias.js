// =========================================================
// routes/materias.js
// Listado, creacion y edicion de materias
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');

// GET /materias -> listado
router.get('/materias', requireAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT m.id_materia, m.nombre, m.descripcion,
                    pmp.id_profesor, pmp.id_periodo,
                    p.nombres || ' ' || p.apellidos AS profesor_nombre,
                    pa.nombre AS periodo_nombre
             FROM materias m
             LEFT JOIN profesor_materia_periodo pmp ON pmp.id_materia = m.id_materia
             LEFT JOIN profesores p ON p.id_profesor = pmp.id_profesor
             LEFT JOIN periodos_academicos pa ON pa.id_periodo = pmp.id_periodo
             ORDER BY m.nombre`
        );

        const profesores = await pool.query(
            'SELECT id_profesor, nombres, apellidos FROM profesores WHERE activo = TRUE ORDER BY apellidos'
        );

        const periodos = await pool.query(
            'SELECT id_periodo, nombre, activo FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );

        res.render('materias/index', {
            materias: resultado.rows,
            profesores: profesores.rows,
            periodos: periodos.rows,
            materiaEditar: null,
            errores: []
        });

    } catch (error) {
        console.error('Error al listar materias:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar el listado de materias.' });
    }
});

// GET /materias/:id/editar -> formulario de edicion
router.get('/materias/:id/editar', requireAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT m.*, pmp.id_profesor, pmp.id_periodo
             FROM materias m
             LEFT JOIN profesor_materia_periodo pmp ON pmp.id_materia = m.id_materia
             WHERE m.id_materia = $1`,
            [req.params.id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).render('error', { mensaje: 'Materia no encontrada.' });
        }

        const materias = await pool.query(
            `SELECT m.id_materia, m.nombre, m.descripcion,
                    pmp.id_profesor, pmp.id_periodo,
                    p.nombres || ' ' || p.apellidos AS profesor_nombre,
                    pa.nombre AS periodo_nombre
             FROM materias m
             LEFT JOIN profesor_materia_periodo pmp ON pmp.id_materia = m.id_materia
             LEFT JOIN profesores p ON p.id_profesor = pmp.id_profesor
             LEFT JOIN periodos_academicos pa ON pa.id_periodo = pmp.id_periodo
             ORDER BY m.nombre`
        );

        const profesores = await pool.query(
            'SELECT id_profesor, nombres, apellidos FROM profesores WHERE activo = TRUE ORDER BY apellidos'
        );

        const periodos = await pool.query(
            'SELECT id_periodo, nombre, activo FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );

        res.render('materias/index', {
            materias: materias.rows,
            profesores: profesores.rows,
            periodos: periodos.rows,
            materiaEditar: resultado.rows[0],
            errores: []
        });
    } catch (error) {
        console.error('Error al cargar materia:', error.message);
        res.status(500).render('error', { mensaje: 'No se pudo cargar la materia.' });
    }
});

// POST /materias -> crea una nueva materia y la asigna a un profesor/periodo
router.post('/materias', requireAuth, async (req, res) => {
    const { nombre, descripcion, id_profesor, id_periodo } = req.body;
    const errores = [];

    if (!nombre || nombre.trim() === '') {
        errores.push('El nombre de la materia es obligatorio.');
    }
    if (!id_profesor) {
        errores.push('Debes seleccionar un profesor.');
    }
    if (!id_periodo) {
        errores.push('Debes seleccionar un periodo.');
    }

    if (errores.length > 0) {
        const materias = await pool.query(
            `SELECT m.id_materia, m.nombre, m.descripcion,
                    pmp.id_profesor, pmp.id_periodo,
                    p.nombres || ' ' || p.apellidos AS profesor_nombre,
                    pa.nombre AS periodo_nombre
             FROM materias m
             LEFT JOIN profesor_materia_periodo pmp ON pmp.id_materia = m.id_materia
             LEFT JOIN profesores p ON p.id_profesor = pmp.id_profesor
             LEFT JOIN periodos_academicos pa ON pa.id_periodo = pmp.id_periodo
             ORDER BY m.nombre`
        );
        const profesores = await pool.query(
            'SELECT id_profesor, nombres, apellidos FROM profesores WHERE activo = TRUE ORDER BY apellidos'
        );
        const periodos = await pool.query(
            'SELECT id_periodo, nombre, activo FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );
        return res.render('materias/index', {
            materias: materias.rows,
            profesores: profesores.rows,
            periodos: periodos.rows,
            materiaEditar: null,
            errores
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario);

        // Crear la materia
        const resultMateria = await client.query(
            'INSERT INTO materias (nombre, descripcion) VALUES ($1, $2) RETURNING id_materia',
            [nombre, descripcion || null]
        );
        const nuevaMateriaId = resultMateria.rows[0].id_materia;

        // Asignar a profesor y periodo
        await client.query(
            'INSERT INTO profesor_materia_periodo (id_profesor, id_materia, id_periodo) VALUES ($1, $2, $3)',
            [id_profesor, nuevaMateriaId, id_periodo]
        );

        await client.query('COMMIT');
        res.redirect('/materias');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al crear materia:', error.message);

        let mensaje = 'No se pudo guardar la materia.';
        if (error.code === '23505') {
            mensaje = 'Ya existe una materia con esa asignacion.';
        }

        const materias = await pool.query(
            `SELECT m.id_materia, m.nombre, m.descripcion,
                    pmp.id_profesor, pmp.id_periodo,
                    p.nombres || ' ' || p.apellidos AS profesor_nombre,
                    pa.nombre AS periodo_nombre
             FROM materias m
             LEFT JOIN profesor_materia_periodo pmp ON pmp.id_materia = m.id_materia
             LEFT JOIN profesores p ON p.id_profesor = pmp.id_profesor
             LEFT JOIN periodos_academicos pa ON pa.id_periodo = pmp.id_periodo
             ORDER BY m.nombre`
        );
        const profesores = await pool.query(
            'SELECT id_profesor, nombres, apellidos FROM profesores WHERE activo = TRUE ORDER BY apellidos'
        );
        const periodos = await pool.query(
            'SELECT id_periodo, nombre, activo FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );
        res.render('materias/index', {
            materias: materias.rows,
            profesores: profesores.rows,
            periodos: periodos.rows,
            materiaEditar: null,
            errores: [mensaje]
        });
    } finally {
        client.release();
    }
});

// PUT /materias/:id -> actualiza una materia existente
router.put('/materias/:id', requireAuth, async (req, res) => {
    const { nombre, descripcion, id_profesor, id_periodo } = req.body;
    const errores = [];

    if (!nombre || nombre.trim() === '') {
        errores.push('El nombre de la materia es obligatorio.');
    }
    if (!id_profesor) {
        errores.push('Debes seleccionar un profesor.');
    }
    if (!id_periodo) {
        errores.push('Debes seleccionar un periodo.');
    }

    if (errores.length > 0) {
        const materias = await pool.query(
            `SELECT m.id_materia, m.nombre, m.descripcion,
                    pmp.id_profesor, pmp.id_periodo,
                    p.nombres || ' ' || p.apellidos AS profesor_nombre,
                    pa.nombre AS periodo_nombre
             FROM materias m
             LEFT JOIN profesor_materia_periodo pmp ON pmp.id_materia = m.id_materia
             LEFT JOIN profesores p ON p.id_profesor = pmp.id_profesor
             LEFT JOIN periodos_academicos pa ON pa.id_periodo = pmp.id_periodo
             ORDER BY m.nombre`
        );
        const profesores = await pool.query(
            'SELECT id_profesor, nombres, apellidos FROM profesores WHERE activo = TRUE ORDER BY apellidos'
        );
        const periodos = await pool.query(
            'SELECT id_periodo, nombre, activo FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );
        const materiaEditar = { id_materia: req.params.id, nombre, descripcion, id_profesor, id_periodo };
        return res.render('materias/index', {
            materias: materias.rows,
            profesores: profesores.rows,
            periodos: periodos.rows,
            materiaEditar,
            errores
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario);

        // Actualizar la materia
        await client.query(
            'UPDATE materias SET nombre = $1, descripcion = $2 WHERE id_materia = $3',
            [nombre, descripcion || null, req.params.id]
        );

        // Actualizar o crear la asignacion
        const existeAsignacion = await client.query(
            'SELECT 1 FROM profesor_materia_periodo WHERE id_materia = $1',
            [req.params.id]
        );

        if (existeAsignacion.rows.length > 0) {
            await client.query(
                'UPDATE profesor_materia_periodo SET id_profesor = $1, id_periodo = $2 WHERE id_materia = $3',
                [id_profesor, id_periodo, req.params.id]
            );
        } else {
            await client.query(
                'INSERT INTO profesor_materia_periodo (id_profesor, id_materia, id_periodo) VALUES ($1, $2, $3)',
                [id_profesor, req.params.id, id_periodo]
            );
        }

        await client.query('COMMIT');
        res.redirect('/materias');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al actualizar materia:', error.message);

        let mensaje = 'No se pudo actualizar la materia.';
        if (error.code === '23505') {
            mensaje = 'Ya existe una materia con esa asignacion.';
        }

        const materias = await pool.query(
            `SELECT m.id_materia, m.nombre, m.descripcion,
                    pmp.id_profesor, pmp.id_periodo,
                    p.nombres || ' ' || p.apellidos AS profesor_nombre,
                    pa.nombre AS periodo_nombre
             FROM materias m
             LEFT JOIN profesor_materia_periodo pmp ON pmp.id_materia = m.id_materia
             LEFT JOIN profesores p ON p.id_profesor = pmp.id_profesor
             LEFT JOIN periodos_academicos pa ON pa.id_periodo = pmp.id_periodo
             ORDER BY m.nombre`
        );
        const profesores = await pool.query(
            'SELECT id_profesor, nombres, apellidos FROM profesores WHERE activo = TRUE ORDER BY apellidos'
        );
        const periodos = await pool.query(
            'SELECT id_periodo, nombre, activo FROM periodos_academicos ORDER BY fecha_inicio DESC'
        );
        const materiaEditar = { id_materia: req.params.id, nombre, descripcion, id_profesor, id_periodo };
        res.render('materias/index', {
            materias: materias.rows,
            profesores: profesores.rows,
            periodos: periodos.rows,
            materiaEditar,
            errores: [mensaje]
        });
    } finally {
        client.release();
    }
});

module.exports = router;