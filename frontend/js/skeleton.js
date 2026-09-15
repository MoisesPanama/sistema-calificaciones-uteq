// =========================================================
// skeleton.js — Utilidades de skeleton loading
// Requiere: style.css (clases .skeleton-*)
// =========================================================

/**
 * Reemplaza el contenido de un contenedor con skeleton loaders.
 * @param {HTMLElement} container - Elemento contenedor.
 * @param {'card'|'table'|'text'|'rows'} type - Tipo de skeleton.
 * @param {number} count - Numero de items skeleton.
 */
function showSkeleton(container, type = 'card', count = 3) {
  if (!container) return;
  container.dataset.skeletonOriginal = container.innerHTML;
  let html = '';

  if (type === 'card') {
    html = '<div class="cards-grid">';
    for (let i = 0; i < count; i++) {
      html += `<div class="skeleton-card">
        <div class="skeleton skeleton-text-sm"></div>
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text"></div>
      </div>`;
    }
    html += '</div>';
  } else if (type === 'table') {
    html = '<table class="skeleton-table"><thead><tr>';
    for (let i = 0; i < 5; i++) html += '<th><div class="skeleton" style="height:14px;width:80px;"></div></th>';
    html += '</tr></thead><tbody>';
    for (let i = 0; i < count; i++) {
      html += '<tr>';
      for (let j = 0; j < 5; j++) html += '<td><div class="skeleton skeleton-text"></div></td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  } else if (type === 'text') {
    for (let i = 0; i < count; i++) {
      const w = 40 + Math.random() * 50;
      html += `<div class="skeleton skeleton-text" style="width:${w}%;"></div>`;
    }
  } else if (type === 'rows') {
    for (let i = 0; i < count; i++) {
      html += `<div class="skeleton-row">
        <div class="skeleton skeleton-circle"></div>
        <div style="flex:1;">
          <div class="skeleton skeleton-text" style="width:60%;"></div>
          <div class="skeleton skeleton-text-sm" style="width:40%;"></div>
        </div>
      </div>`;
    }
  }

  container.innerHTML = html;
}

/**
 * Restaura el contenido original despues de un skeleton.
 * @param {HTMLElement} container - Elemento contenedor.
 */
function hideSkeleton(container) {
  if (!container) return;
  const original = container.dataset.skeletonOriginal;
  if (original !== undefined) {
    container.innerHTML = original;
    delete container.dataset.skeletonOriginal;
  }
}
