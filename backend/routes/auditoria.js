// =========================================================
// routes/auditoria.js — GET /api/auditoria (solo admin)
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT a.id_auditoria, a.tabla_afectada, a.operacion,
                    a.id_registro, a.usuario_bd, a.id_usuario_app,
                    a.datos_anteriores, a.datos_nuevos, a.fecha_evento,
                    u.nombres AS usuario_nombres, u.apellidos AS usuario_apellidos
             FROM auditoria a
             LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario_app
             ORDER BY a.fecha_evento DESC`
        );
        res.json({ registros: resultado.rows });
    } catch (error) {
        console.error('Error al cargar auditoria:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el panel de auditoria.' });
    }
});

module.exports = router;
