// =========================================================
// helpers/paginacion.js — Plan v2 Fase 4 (paginacion transversal)
// Formato UNICO de paginacion para toda la API:
//   { datos: [...], paginacion: { page, limit, total, totalPages } }
// Todos los endpoints paginados lo usan; el frontend tiene el
// componente gemelo en frontend/js/pagination.js.
// No paginar catalogos pequenos (roles, tipos, cursos de un
// periodo): solo listas que crecen sin limite (estudiantes,
// auditoria, reportes, historiales).
// =========================================================

function leerPaginacion(query, opciones = {}) {
    const porDefecto = opciones.porDefecto || 50;
    const maximo = opciones.maximo || 100;
    const minimo = opciones.minimo || 10;
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(maximo, Math.max(minimo, parseInt(query.limit) || porDefecto));
    return { page, limit, offset: (page - 1) * limit };
}

function respuestaPaginada(datos, { page, limit, total }) {
    const totalNum = parseInt(total) || 0;
    return {
        datos,
        paginacion: { page, limit, total: totalNum, totalPages: Math.ceil(totalNum / limit) }
    };
}

module.exports = { leerPaginacion, respuestaPaginada };
