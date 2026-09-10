// =========================================================
// pagination.js — Paginación transversal estilo moderno
// Componente COMPARTIDO de controles de paginación.
// Uso: renderPaginacion('id-contenedor', pag, (nuevaPagina) => ...)
// donde `pag` es el objeto `paginacion` de la API
// ({ page, limit, total, totalPages }).
// =========================================================

function renderPaginacion(contenedorId, pag, onPage) {
  const div = typeof contenedorId === 'string'
    ? document.getElementById(contenedorId)
    : contenedorId;
  if (!div) return;
  if (!pag || pag.totalPages <= 1) { div.innerHTML = ''; return; }

  const isFirst = pag.page <= 1;
  const isLast = pag.page >= pag.totalPages;
  const current = pag.page;
  const total = pag.totalPages;

  let html = '';

  // Botones de navegación: primero, anterior
  html += `<button class="pag-arrow" ${isFirst ? 'disabled' : ''} data-pag="1" title="Primera pagina">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"/><line x1="18" y1="6" x2="6" y2="6"/></svg>
  </button>`;
  html += `<button class="pag-arrow" ${isFirst ? 'disabled' : ''} data-pag="${current - 1}" title="Pagina anterior">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
  </button>`;

  // Página actual
  html += `<button class="pag-num active" data-pag="${current}">${current}</button>`;

  // "of" + total de páginas
  html += `<span class="pag-of">of</span>`;
  html += `<button class="pag-num" data-pag="${total}">${total}</button>`;

  // Siguiente, último
  html += `<button class="pag-arrow pag-arrow-active" ${isLast ? 'disabled' : ''} data-pag="${current + 1}" title="Pagina siguiente">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
  </button>`;
  html += `<button class="pag-arrow pag-arrow-active" ${isLast ? 'disabled' : ''} data-pag="${total}" title="Ultima pagina">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><line x1="6" y1="6" x2="18" y2="6"/></svg>
  </button>`;

  // Texto informativo
  html += `<span class="pag-info">Page ${current} of ${total}</span>`;

  // Selector de página
  html += `<span class="pag-jump">Page <select class="pag-select" data-role="jump">`;
  for (let i = 1; i <= total; i++) {
    html += `<option value="${i}"${i === current ? ' selected' : ''}>${i}</option>`;
  }
  html += `</select> of ${total}</span>`;

  div.innerHTML = html;

  // Eventos: botones numéricos
  div.querySelectorAll('.pag-num[data-pag], .pag-arrow[data-pag]').forEach(b => {
    b.addEventListener('click', () => {
      if (!b.disabled && !b.classList.contains('active')) {
        onPage(Number(b.dataset.pag));
      }
    });
  });

  // Evento: selector de página
  div.querySelectorAll('.pag-select[data-role="jump"]').forEach(sel => {
    sel.addEventListener('change', () => {
      onPage(Number(sel.value));
    });
  });
}
