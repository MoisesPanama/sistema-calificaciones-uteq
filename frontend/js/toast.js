// =========================================================
// toast.js — Sistema de notificaciones toast
// Requiere: style.css (clases .toast-*, .toast-container)
// =========================================================

(function() {
  // Crear contenedor si no existe
  function getContainer() {
    let c = document.querySelector('.toast-container');
    if (!c) {
      c = document.createElement('div');
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  const ICONS = {
    success: '&#10003;',
    error: '&#10007;',
    warning: '&#9888;',
    info: '&#8505;'
  };

  /**
   * Mostrar una notificacion toast.
   * @param {string} message - Mensaje a mostrar.
   * @param {'success'|'error'|'warning'|'info'} type - Tipo de toast.
   * @param {number} duration - Milisegundos antes de auto-cerrar (default 4000).
   */
  function toast(message, type = 'info', duration = 4000) {
    const container = getContainer();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <span class="toast-icon">${ICONS[type] || ICONS.info}</span>
      <span class="toast-msg">${esc(message)}</span>
      <button class="toast-close" aria-label="Cerrar">&times;</button>
    `;

    const close = () => {
      el.classList.add('closing');
      setTimeout(() => el.remove(), 300);
    };

    el.querySelector('.toast-close').addEventListener('click', close);
    if (duration > 0) setTimeout(close, duration);
    container.appendChild(el);
  }

  // Helpers globales
  window.toast = toast;
  window.toastSuccess = (msg, dur) => toast(msg, 'success', dur);
  window.toastError = (msg, dur) => toast(msg, 'error', dur || 6000);
  window.toastWarning = (msg, dur) => toast(msg, 'warning', dur || 5000);
  window.toastInfo = (msg, dur) => toast(msg, 'info', dur);
})();

// Re-declarar esc si no existe (fallback)
if (typeof esc === 'undefined') {
  function esc(s) {
    return String(s == null ? '' : s)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }
}
