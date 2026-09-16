// Helpers compartidos de la suite Playwright.
// BASE_URL absoluta: no depende solo del baseURL del config, asi los
// tests corren igual con --config o sin el (p. ej. desde la raiz o VSCode).
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

async function login(page, email, password = 'UTEQ2026') {
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
  await page.locator('#email').waitFor({ timeout: 15000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#form-login button[type="submit"]').click();
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
