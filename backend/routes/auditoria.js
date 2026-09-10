// =========================================================
// routes/auditoria.js — GET /api/auditoria (solo admin)
// =========================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { leerPaginacion, respuestaPaginada } = require('../helpers/paginacion');

// ---------------------------------------------------------
// Categorias de negocio (Fase 3): agrupan tablas tecnicas en
// bloques entendibles para el admin. UNICA fuente del mapeo:
// el CASE de abajo se genera desde este objeto, asi el
// frontend nunca necesita saber nombres de tabla internos.
// Tablas derivadas/tecnicas (matricula_materias, sesiones)
// no pertenecen a ninguna categoria: se excluyen siempre.
// ---------------------------------------------------------
const CATEGORIAS = {
    calificaciones: ['calificaciones'],
    matriculas_estudiantes: ['matriculas', 'estudiantes'],
    materias_asignaciones: ['materias', 'profesor_materia_periodo'],
    periodos_catalogos: ['periodos_academicos', 'cursos', 'ciclos_evaluativos', 'parciales', 'tipos_evaluacion'],
    usuarios_accesos: ['usuarios', 'profesores', 'representantes']
};
const TABLAS_EXCLUIDAS = ['matricula_materias', 'sesiones'];

function categoriaCase(columna = 'a.tabla_afectada') {
    const whens = Object.entries(CATEGORIAS)
        .map(([cat, tablas]) => `WHEN ${columna} IN (${tablas.map((t) => `'${t}'`).join(', ')}) THEN '${cat}'`)
        .join(' ');
    return `(CASE ${whens} ELSE 'otros' END)`;
}

// Tablas internas que no deben aparecer en el filtro del frontend.
const TABLAS_INTernerNA = ['profesor_materia_periodo', 'ciclos_evaluativos', 'parciales', 'tipos_evaluacion'];

function tablasDeCategoria(categoria) {
    return CATEGORIAS[categoria] || null;
}

// GET /api/auditoria/resumen -> bloques por categoria:
// { categoria, total_eventos, eventos_hoy, ultimo_evento }
router.get('/resumen', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT ${categoriaCase()} AS categoria,
                    COUNT(*) AS total_eventos,
                    COUNT(*) FILTER (WHERE a.fecha_evento::date = CURRENT_DATE) AS eventos_hoy,
                    MAX(a.fecha_evento) AS ultimo_evento
             FROM auditoria a
             WHERE a.tabla_afectada NOT IN (${TABLAS_EXCLUIDAS.map((t) => `'${t}'`).join(', ')})
             GROUP BY 1
             ORDER BY total_eventos DESC`
        );
        const resumen = resultado.rows.map((r) => ({
            categoria: r.categoria,
            total_eventos: parseInt(r.total_eventos),
            eventos_hoy: parseInt(r.eventos_hoy),
            ultimo_evento: r.ultimo_evento
        }));
        res.json({ resumen });
    } catch (error) {
        console.error('Error al cargar resumen de auditoria:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el resumen de auditoria.' });
    }
});

// GET /api/auditoria/tablas?categoria= — tablas disponibles para el filtro
router.get('/tablas', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        const categoria = req.query.categoria || '';
        const wheres = [`a.tabla_afectada NOT IN (${TABLAS_EXCLUIDAS.map((t) => `'${t}'`).join(', ')})`];
        const params = [];
        if (categoria) {
            const tablas = tablasDeCategoria(categoria);
            if (tablas) {
                wheres.push(`a.tabla_afectada IN (${tablas.map((t) => `'${t}'`).join(', ')})`);
            }
        }
        const r = await pool.query(
            `SELECT DISTINCT a.tabla_afectada
             FROM auditoria a
             WHERE ${wheres.join(' AND ')}
             ORDER BY a.tabla_afectada`,
            params
        );
        const tablas = r.rows
            .map((row) => row.tabla_afectada)
            .filter((t) => !TABLAS_INTernerNA.includes(t));
        res.json({ tablas });
    } catch (error) {
        console.error('Error al cargar tablas de auditoria:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar las tablas.' });
    }
});

router.get('/', requireAuth, requireRole('administrador'), async (req, res) => {
    try {
        const { page, limit, offset } = leerPaginacion(req.query, { porDefecto: 10, minimo: 5 });
        const tabla = req.query.tabla || '';
        const categoria = req.query.categoria || '';
        const desde = req.query.desde || '';
        const hasta = req.query.hasta || '';

        let where = `WHERE a.tabla_afectada NOT IN (${TABLAS_EXCLUIDAS.map((t) => `'${t}'`).join(', ')})`;
        const params = [];

        if (tabla) {
            params.push(tabla);
            where += ` AND a.tabla_afectada = $${params.length}`;
        }
        if (categoria) {
            const tablas = tablasDeCategoria(categoria);
            if (!tablas) {
                return res.status(400).json({ error: `Categoria desconocida: ${categoria}.` });
            }
            params.push(tablas);
            where += ` AND a.tabla_afectada = ANY($${params.length})`;
        }
        if (desde) {
            params.push(desde);
            where += ` AND a.fecha_evento::date >= $${params.length}::date`;
        }
        if (hasta) {
            params.push(hasta);
            where += ` AND a.fecha_evento::date <= $${params.length}::date`;
        }

        const countResult = await pool.query(
            `SELECT COUNT(*) AS total FROM auditoria a ${where}`,
            params
        );
        const total = parseInt(countResult.rows[0].total);

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
            ...respuestaPaginada(resultado.rows, { page, limit, total }),
            filtros: { tabla, categoria, desde, hasta }
        });
    } catch (error) {
        console.error('Error al cargar auditoria:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el panel de auditoria.' });
    }
});

module.exports = router;
