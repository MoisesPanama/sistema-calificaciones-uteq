// Wrapper fetch contra la API (sesion por cookie -> credentials include).
async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body !== undefined && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (res.status === 401) {
    // Sin sesion -> al login (salvo que ya estemos ahi).
    if (!location.pathname.endsWith('login.html')) location.href = 'login.html';
    throw new Error((data && data.error) || 'No autenticado.');
  }
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
  return data;
}

async function apiGet(path) { return api(path); }
async function apiPost(path, body) { return api(path, { method: 'POST', body }); }
async function apiPut(path, body) { return api(path, { method: 'PUT', body }); }

function qs(name) { return new URLSearchParams(location.search).get(name); }
function esc(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function showError(msg) {
  const el = document.getElementById('error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
  else alert(msg);
}
function showOk(msg) {
  const el = document.getElementById('ok');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
