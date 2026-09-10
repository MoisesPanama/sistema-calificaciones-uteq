// =========================================================
// routes/auditoria.js — GET /api/auditoria (solo admin)
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50));
        const offset = (page - 1) * limit;
        const tabla = req.query.tabla || '';

        let where = "WHERE a.tabla_afectada NOT IN ('matricula_materias', 'sesiones')";
        const params = [];

        if (tabla) {
            params.push(tabla);
            where += ` AND a.tabla_afectada = $${params.length}`;
        }

        const countResult = await pool.query(
            `SELECT COUNT(*) AS total FROM auditoria a ${where}`,
            params
        );
        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        params.push(limit, offset);
        const resultado = await pool.query(
            `SELECT a.id_auditoria, a.tabla_afectada, a.operacion,
                    a.id_registro, a.usuario_bd, a.id_usuario_app,
                    a.datos_anteriores, a.datos_nuevos, a.fecha_evento,
                    u.nombres AS usuario_nombres, u.apellidos AS usuario_apellidos
             FROM auditoria a
             LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario_app
             ${where}
             ORDER BY a.fecha_evento DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        res.json({
            registros: resultado.rows,
            paginacion: { page, limit, total, totalPages }
        });
    } catch (error) {
        console.error('Error al cargar auditoria:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el panel de auditoria.' });
    }
});

module.exports = router;
