// Header/nav compartido + guard de sesion para todas las paginas (menos login).
async function getSessionUser() {
  try {
    const { usuario } = await apiGet('/auth/me');
    renderHeader(usuario);
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

function renderHeader(usuario) {
  const header = document.getElementById('app-header');
  if (!header) return;
  const esAdmin = usuario.nombre_rol === 'administrador';
  header.innerHTML = `
    <div class="header-brand">Sistema de Calificaciones - UTEQ</div>
    <nav class="header-nav">
      <a href="dashboard.html">Inicio</a>
      <a href="estudiantes.html">Estudiantes</a>
      <a href="materias.html">Materias</a>
      <a href="periodos.html">Periodos</a>
      <a href="calificaciones.html">Registrar Nota</a>
      <a href="consulta.html">Consultar Notas</a>
      <a href="reportes.html">Reportes</a>
      ${esAdmin ? '<a href="auditoria.html">Auditoria</a>' : ''}
    </nav>
    <div class="header-user">
      <span>${esc(usuario.nombres)} (${esc(usuario.nombre_rol)})</span>
      <button class="btn-logout" id="btn-logout">Cerrar sesion</button>
    </div>`;
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await apiPost('/auth/logout', {});
    location.href = 'login.html';
  });
}
