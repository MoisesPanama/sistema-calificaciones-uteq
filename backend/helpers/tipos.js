// =========================================================
// helpers/tipos.js — Tipos calificables (M1: sin ids fijos).
// Antes habia listas hardcodeadas ([1,2,3,4,6,9], [3..8])
// que se rompian si el admin agregaba tipos. Ahora todo sale
// de la BD: calificables = formativa/sumativa, no legacy,
// ordenados por `orden` (examen siempre al ultimo).
// =========================================================

async function tiposCalificables(client) {
    const r = await client.query(
        `SELECT id_tipo_evaluacion, nombre, peso, categoria,
                es_examen, cuenta_para_promedio, orden
         FROM tipos_evaluacion
         WHERE NOT es_legacy
           AND categoria IN ('formativa', 'sumativa')
         ORDER BY orden, nombre`
    );
    return r.rows;
}

module.exports = { tiposCalificables };
