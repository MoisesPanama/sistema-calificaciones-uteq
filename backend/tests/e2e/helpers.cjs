// Helpers compartidos de la suite Playwright.
// BASE_URL absoluta: no depende solo del baseURL del config, asi los
// tests corren igual con --config o sin el (p. ej. desde la raiz o VSCode).
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

// Claves rotadas por el flujo de clave temporal (M11).
// DETERMINISTA (sin archivos ni estado): la rotada se deriva del
// email, asi cualquier corrida/proceso entra igual. Los usuarios
// fijos de tests siempre terminan con su rotada; UTEQ2026 solo
// sirve la primera vez (recien creado, antes de rotar).
function claveRotada(email) {
  let h = 7;
  for (const c of String(email)) h = ((h * 31 + c.charCodeAt(0)) >>> 0);
  return 'Nx' + h.toString(36) + '!Aa1';
}

async function login(page, email, password) {
  password = password || 'UTEQ2026';
  // Sin esto, el auto-redirect del login (si ya hay sesion)
  // saca a dashboard y los fill() esperan eternamente.
  await page.context().clearCookies();
  // domcontentloaded (no load): evita la carrera con el auto-redirect
  // de la propia pagina. Reintentos: la carrera es intermitente
  // (ERR_ABORTED o "interrupted by another navigation").
  let navegado = false;
  for (let intento = 0; intento < 3 && !navegado; intento++) {
    try {
      await page.goto(BASE_URL + '/pages/login.html', { waitUntil: 'domcontentloaded' });
      navegado = true;
    } catch (e) {
      if (!/ERR_ABORTED|interrupted by another navigation/.test(String(e && e.message))) throw e;
    }
  }
  async function intentar(cred) {
    await page.locator('#email').waitFor({ timeout: 15000 });
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(cred);
    await page.locator('#form-login button[type="submit"]').click();
    await page.waitForFunction(
      () => !/\/pages\/login\.html$/.test(location.href) ||
        ((document.getElementById('error') || {}).style || {}).display === 'block',
      null, { timeout: 15000 }
    );
    return page.url();
  }
  await intentar(password);
  if (page.url().includes('cambiar-clave')) {
    // Clave temporal: se rota a la determinista y se sigue.
    const nueva = claveRotada(email);
    await page.locator('#actual').fill(password);
    await page.locator('#nueva').fill(nueva);
    await page.locator('#confirmacion').fill(nueva);
    await page.locator('#form-clave button[type="submit"]').click();
    await page.waitForURL('**/dashboard.html', { timeout: 15000 });
    return;
  }
  if (!page.url().includes('dashboard')) {
    // La UTEQ2026 ya no vale (rotada en otra corrida): con la derivada.
    await page.goto(BASE_URL + '/pages/login.html', { waitUntil: 'domcontentloaded' });
    await intentar(claveRotada(email));
  }
  await page.waitForURL('**/dashboard.html', { timeout: 15000 });
}

async function api(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const res = await fetch('/api' + path, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* vacio */ }
    return { status: res.status, data };
  }, { method, path, body });
}

/**
 * Navega a una ruta relativa usando BASE_URL absoluta.
 * Usar en vez de page.goto('/...') para no depender del baseURL del config.
 */
async function go(page, path, options) {
  return page.goto(BASE_URL + path, options);
}

module.exports = { login, api, go, BASE_URL };
