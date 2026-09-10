// Sidebar + topbar compartido + guard de sesion para todas las paginas (menos login).

async function getSessionUser() {
  try {
    const { usuario, periodoSeleccionado } = await apiGet('/auth/me');
    renderLayout(usuario, periodoSeleccionado);
    return usuario;
  } catch {
    location.href = 'login.html';
    return null;
  }
}

async function initPage({ adminOnly = false } = {}) {
  const usuario = await getSessionUser();
  if (!usuario) return null;
  if (adminOnly && usuario.nombre_rol !== 'administrador') {
    document.querySelector('main').innerHTML =
      '<div class="alert alert-error">No tienes permiso para acceder a esta seccion.</div>';
    return null;
  }
  return usuario;
}

async function renderLayout(usuario, periodoSeleccionado) {
  const sidebar = document.getElementById('app-sidebar');
  const topbar = document.getElementById('app-topbar');
  if (!sidebar || !topbar) return;

  const esAdmin = usuario.nombre_rol === 'administrador';
  const esProfesor = usuario.nombre_rol === 'profesor';
  const esRepresentante = usuario.nombre_rol === 'representante';
  const esPsicologo = usuario.nombre_rol === 'psicologo';
  const page = location.pathname.split('/').pop() || 'dashboard.html';

  const navItems = [
    { href: 'dashboard.html',       icon: '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>', label: 'Inicio' },
  ];

  const navGestion = [
    { href: 'estudiantes.html',     icon: '<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>', label: 'Estudiantes' },
    { href: 'materias.html',        icon: '<path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/>', label: 'Materias' },
    { href: 'periodos.html',        icon: '<path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>', label: 'Periodos' },
  ];

  const navCalificaciones = [
    { href: 'calificaciones.html',  icon: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>', label: 'Registrar Nota' },
    { href: 'consulta.html',        icon: '<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>', label: 'Consultar Notas' },
    { href: 'reportes.html',        icon: '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>', label: 'Reportes' },
  ];

  const navAdmin = [
    { href: 'catalogos.html',        icon: '<path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>', label: 'Catalogos' },
    { href: 'auditoria.html',       icon: '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>', label: 'Auditoria' },
    { href: 'respaldos.html',       icon: '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>', label: 'Respaldos' },
  ];

  const navPsicologo = [
    { href: 'psicologo.html',       icon: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>', label: 'Rendimiento' },
  ];

  // Admin: ve todo excepto Registrar Nota
  // Profesor: ve calificaciones y consulta
  // Representante: ve consulta y reportes
  // Psicologo: ve rendimiento
  let navItems2 = [];
  if (esAdmin) {
    navItems2 = [...navGestion, ...navCalificaciones.filter(n => n.href !== 'calificaciones.html')];
  } else if (esProfesor) {
    navItems2 = navCalificaciones;
  } else if (esRepresentante) {
    navItems2 = navCalificaciones.filter(n => n.href === 'consulta.html' || n.href === 'reportes.html');
  } else if (esPsicologo) {
    navItems2 = [];
  }

  function buildNav(items) {
    return items.map(i => {
      const active = page === i.href ? ' activo' : '';
      return `<a href="${i.href}" class="sidebar-link${active}"><svg viewBox="0 0 24 24">${i.icon}</svg><span>${i.label}</span></a>`;
    }).join('');
  }

  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <svg viewBox="0 0 24 24" style="width:28px;height:28px;fill:white;"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>
      <span>UTEQ</span>
    </div>
    <nav class="sidebar-nav">
      ${buildNav(navItems)}
      ${navItems2.length > 0 ? '<div class="sidebar-divider"></div>' + buildNav(navItems2) : ''}
      ${esAdmin ? '<div class="sidebar-divider"></div>' + buildNav(navAdmin) : ''}
      ${esPsicologo ? '<div class="sidebar-divider"></div>' + buildNav(navPsicologo) : ''}
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user">
        <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:rgba(255,255,255,0.6);"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        <div>
          <div class="sidebar-user-name">${esc(usuario.nombres)}</div>
          <div class="sidebar-user-role">${esc(usuario.nombre_rol)}</div>
        </div>
      </div>
      <button class="sidebar-logout" id="btn-logout">
        <svg viewBox="0 0 24 24" style="width:18px;height:18px;"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
        <span>Cerrar sesion</span>
      </button>
    </div>`;

  topbar.innerHTML = `
    <button class="topbar-toggle" onclick="document.getElementById('app-sidebar').classList.toggle('sidebar-collapsed')">
      <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:#374151;"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
    </button>
    <div class="topbar-right">
      <div class="header-periodo" id="selectorPeriodo">
        <button class="header-periodo-btn" id="btnPeriodo">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>
          <span id="periodoNombre">Cargando...</span>
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;"><path d="M7 10l5 5 5-5z"/></svg>
        </button>
        <div class="header-periodo-dropdown" id="dropdownPeriodo">
          <div class="header-periodo-dropdown-header">Seleccionar periodo</div>
          <div id="periodosLista"></div>
          <div class="header-periodo-footer">Periodo fijo en sesion</div>
        </div>
      </div>
      <span style="font-size:0.82rem;color:#6b7280;">${esc(usuario.nombre_rol)}</span>
    </div>`;

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await apiPost('/auth/logout', {});
    location.href = 'login.html';
  });

  document.getElementById('btnPeriodo').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('dropdownPeriodo').classList.toggle('activo');
  });

  document.addEventListener('click', (e) => {
    const sp = document.getElementById('selectorPeriodo');
    const dd = document.getElementById('dropdownPeriodo');
    if (sp && dd && !sp.contains(e.target)) dd.classList.remove('activo');
  });

  cargarPeriodos(periodoSeleccionado);
}

async function cargarPeriodos(seleccionado) {
  try {
    const d = await apiGet('/periodos/');
    const periodos = d.periodos || [];
    const activo = d.periodoActivo;
    const lista = document.getElementById('periodosLista');
    const nombreEl = document.getElementById('periodoNombre');
    if (!lista || !nombreEl) return;

    let idSeleccionado = seleccionado || (activo && activo.id_periodo);
    const periodoActual = periodos.find(p => String(p.id_periodo) === String(idSeleccionado)) || activo;
    nombreEl.textContent = periodoActual ? esc(periodoActual.nombre) : 'Sin periodo';

    lista.innerHTML = periodos.map(p => {
      const seleccionado = String(p.id_periodo) === String(idSeleccionado);
      const clase = seleccionado ? ' class="activo"' : '';
      return `<div class="header-periodo-item${seleccionado ? ' activo' : ''}" data-id="${p.id_periodo}">
        <span class="check">${seleccionado ? '&#10003;' : ''}</span>
        <span>${esc(p.nombre)}</span>
      </div>`;
    }).join('');

    lista.querySelectorAll('.header-periodo-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = Number(item.dataset.id);
        await apiPost('/auth/periodo-seleccionado', { id_periodo: id });
        location.reload();
      });
    });
  } catch (e) {
    const nombreEl = document.getElementById('periodoNombre');
    if (nombreEl) nombreEl.textContent = 'Sin periodo';
  }
}
