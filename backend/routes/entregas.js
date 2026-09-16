// =========================================================
// routes/entregas.js — Flujo de entregas (S2 super plan).
// pendiente -> enviada -> aceptada / rechazada / cambios.
// Quien entrega: el propio estudiante (o el docente/admin
// marcando recibida). Quien revisa: el docente dueno o admin.
// La NOTA vive en calificaciones; aqui solo recepcion y
// revision (igual que OpenEducat: submissions separados).
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, setUsuarioAuditoria } = require('../middleware/auth');
const { getEstudianteId } = require('../helpers/contexto');

async function cargarActividad(id) {
    const r = await pool.query(
        'SELECT id_actividad, id_materia, id_periodo, creado_por, estado FROM actividades WHERE id_actividad = $1 AND activo = TRUE',
        [id]
    );
    return r.rows[0] || null;
}

function puedeRevisar(act, usuario) {
    return usuario.nombre_rol === 'administrador' ||
        String(act.creado_por) === String(usuario.id_usuario);
}

// GET /api/entregas/por-actividad/:id -> entregas con estudiante
router.get('/por-actividad/:id', requireAuth, async (req, res) => {
    try {
        const act = await cargarActividad(req.params.id);
        if (!act) return res.status(404).json({ error: 'Actividad no encontrada.' });
        if (!puedeRevisar(act, req.session.usuario)) {
            const { getMateriasPermitidas } = require('../helpers/contexto');
            const permitidas = await getMateriasPermitidas(pool, req.session.usuario, act.id_periodo);
            if (!permitidas.some((m) => String(m.id_materia) === String(act.id_materia))) {
                return res.status(403).json({ error: 'No tienes acceso a esta actividad.' });
            }
        }
        const r = await pool.query(
            `SELECT en.id_entrega, en.id_estudiante, en.estado, en.observacion,
                    en.fecha_envio, en.fecha_revision,
                    e.nombres, e.apellidos,
                    (u.nombres || ' ' || u.apellidos) AS revisada_por_nombre
             FROM entregas en
             JOIN estudiantes e ON e.id_estudiante = en.id_estudiante
             LEFT JOIN usuarios u ON u.id_usuario = en.revisada_por
             WHERE en.id_actividad = $1
             ORDER BY e.apellidos, e.nombres`,
            [req.params.id]
        );
        res.json({ entregas: r.rows });
    } catch (error) {
        console.error('Error al listar entregas:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar las entregas.' });
    }
});

// POST /api/entregas/:id/enviar -> marcar recibida/enviada.
// Estudiante: solo la propia (desde pendiente/cambios/rechazada).
// Docente/admin: cualquiera de su actividad.
router.post('/:id/enviar', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            `SELECT en.*, a.id_materia, a.id_periodo, a.creado_por
             FROM entregas en
             JOIN actividades a ON a.id_actividad = en.id_actividad
             WHERE en.id_entrega = $1`,
            [req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Entrega no encontrada.' });
        }
        const ent = r.rows[0];
        const usuario = req.session.usuario;
        if (usuario.nombre_rol === 'estudiante') {
            const propio = await getEstudianteId(client, usuario.id_usuario);
            if (!propio || String(propio) !== String(ent.id_estudiante)) {
                await client.query('ROLLBACK');
                return res.status(403).json({ error: 'Solo puedes enviar tus propias entregas.' });
            }
            if (!['pendiente', 'cambios', 'rechazada'].includes(ent.estado)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: `No se puede enviar desde estado ${ent.estado}.` });
            }
        } else if (!puedeRevisar(ent, usuario)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'No tienes acceso a esta actividad.' });
        }
        if (!['pendiente', 'cambios', 'rechazada'].includes(ent.estado)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `No se puede enviar desde estado ${ent.estado}.` });
        }
        await client.query(
            `UPDATE entregas SET estado = 'enviada', fecha_envio = COALESCE(fecha_envio, NOW())
             WHERE id_entrega = $1`,
            [req.params.id]
        );
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: 'Entrega marcada como enviada.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al enviar:', error.message);
        res.status(500).json({ error: 'No se pudo marcar la entrega.' });
    } finally {
        client.release();
    }
});

// POST /api/entregas/:id/revisar { estado, observacion } ->
// aceptada | rechazada | cambios. Solo docente dueno o admin.
router.post('/:id/revisar', requireAuth, async (req, res) => {
    const { estado, observacion } = req.body || {};
    if (!['aceptada', 'rechazada', 'cambios'].includes(estado)) {
        return res.status(400).json({ error: 'Estado no valido: aceptada, rechazada o cambios.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUsuarioAuditoria(req.session.usuario.id_usuario, client);
        const r = await client.query(
            `SELECT en.*, a.creado_por FROM entregas en
             JOIN actividades a ON a.id_actividad = en.id_actividad
             WHERE en.id_entrega = $1`,
            [req.params.id]
        );
        if (r.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Entrega no encontrada.' });
        }
        const ent = r.rows[0];
        if (!puedeRevisar(ent, req.session.usuario)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Solo quien creo la actividad (o el administrador) puede revisar.' });
        }
        if (ent.estado !== 'enviada') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `Solo se revisa desde enviada (actual: ${ent.estado}).` });
        }
        await client.query(
            `UPDATE entregas SET estado = $1, observacion = $2,
                    fecha_revision = NOW(), revisada_por = $3
             WHERE id_entrega = $4`,
            [estado, observacion ? String(observacion).trim() : null, req.session.usuario.id_usuario, req.params.id]
        );
        await client.query('COMMIT');
        res.json({ ok: true, mensaje: `Entrega ${estado}.` });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al revisar:', error.message);
        res.status(500).json({ error: 'No se pudo revisar la entrega.' });
    } finally {
        client.release();
    }
});

module.exports = router;
