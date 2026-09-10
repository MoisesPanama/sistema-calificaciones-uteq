// =========================================================
// helpers/periodos.js
// Funciones helper para manejo de periodos academicos
// =========================================================

const pool = require('../config/db');

// Consulta base que calcula el estado segun la fecha actual
const QUERY_PERIODOS = `
    SELECT id_periodo, nombre, fecha_inicio, fecha_fin, activo,
           CASE
               WHEN fecha_fin < CURRENT_DATE THEN 'Finalizado'
               WHEN fecha_inicio <= CURRENT_DATE AND fecha_fin >= CURRENT_DATE THEN 'Activo'
               ELSE 'Proximo'
           END AS estado
    FROM periodos_academicos
`;

// Obtiene el periodo activo (dentro de sus fechas)
async function getPeriodoActivo() {
    const resultado = await pool.query(
        `${QUERY_PERIODOS}
         WHERE fecha_inicio <= CURRENT_DATE AND fecha_fin >= CURRENT_DATE
         ORDER BY fecha_inicio DESC LIMIT 1`
    );
    if (resultado.rows.length === 0) {
        // Si no hay periodo dentro de fechas, buscar el mas reciente con activo = TRUE
        const fallback = await pool.query(
            `${QUERY_PERIODOS}
             WHERE activo = TRUE
             ORDER BY fecha_inicio DESC LIMIT 1`
        );
        return fallback.rows[0] || null;
    }
    return resultado.rows[0];
}

// Obtiene todos los periodos ordenados
async function getAllPeriodos() {
    const resultado = await pool.query(
        `${QUERY_PERIODOS} ORDER BY fecha_inicio DESC`
    );
    return resultado.rows;
}

module.exports = { getPeriodoActivo, getAllPeriodos };
