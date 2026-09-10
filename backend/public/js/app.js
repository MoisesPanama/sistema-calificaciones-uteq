// =========================================================
// app.js - JavaScript global del sistema
// =========================================================

// Toggle dropdown del periodo
function toggleDropdownPeriodo() {
    document.getElementById('dropdownPeriodo').classList.toggle('activo');
}

// Cambiar periodo via AJAX y recargar
function cambiarPeriodo(id) {
    fetch('/periodo-seleccionado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_periodo: id })
    }).then(function() { window.location.reload(); });
}

// Cerrar dropdown al hacer click afuera
document.addEventListener('click', function(e) {
    var sp = document.getElementById('selectorPeriodo');
    var dd = document.getElementById('dropdownPeriodo');
    if (sp && dd && !sp.contains(e.target)) dd.classList.remove('activo');
});

// Marcar link activo en el sidebar segun la URL actual
document.addEventListener('DOMContentLoaded', function() {
    var links = document.querySelectorAll('.sidebar-link');
    var path = window.location.pathname;

    links.forEach(function(link) {
        var href = link.getAttribute('href');
        if (path === href || path.startsWith(href + '/')) {
            link.classList.add('activo');
        }
    });
});
