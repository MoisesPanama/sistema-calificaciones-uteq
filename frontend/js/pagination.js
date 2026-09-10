// =========================================================
// pagination.js — Plan v2 Fase 4 (paginacion transversal)
// Componente COMPARTIDO de controles de paginacion.
// Uso: renderPaginacion('id-contenedor', pag, (nuevaPagina) => ...)
// donde `pag` es el objeto `paginacion` de la API
// ({ page, limit, total, totalPages }).
// Requiere los estilos .pagination de style.css (o los que cada
// pagina defina con las mismas clases).
// =========================================================

function renderPaginacion(contenedorId, pag, onPage) {
  const div = typeof contenedorId === 'string'
    ? document.getElementById(contenedorId)
    : contenedorId;
  if (!div) return;
  if (!pag || pag.totalPages <= 1) { div.innerHTML = ''; return; }
  let html = '';
  html += `<button ${pag.page <= 1 ? 'disabled' : ''} data-pag="${pag.page - 1}">Anterior</button>`;
  const start = Math.max(1, pag.page - 2);
  const end = Math.min(pag.totalPages, pag.page + 2);
  if (start > 1) html += `<button data-pag="1">1</button><span class="page-info">...</span>`;
  for (let p = start; p <= end; p++) {
    html += `<button class="${p === pag.page ? 'active' : ''}" data-pag="${p}">${p}</button>`;
  }
  if (end < pag.totalPages) html += `<span class="page-info">...</span><button data-pag="${pag.totalPages}">${pag.totalPages}</button>`;
  html += `<button ${pag.page >= pag.totalPages ? 'disabled' : ''} data-pag="${pag.page + 1}">Siguiente</button>`;
  html += `<span class="page-info">Página ${pag.page} de ${pag.totalPages} (${pag.total} registros)</span>`;
  div.innerHTML = html;
  div.querySelectorAll('[data-pag]').forEach(b => {
    b.onclick = () => onPage(Number(b.dataset.pag));
  });
}
