// Helpers compartidos de la suite Playwright.
// BASE_URL absoluta: no depende solo del baseURL del config, asi los
// tests corren igual con --config o sin el (p. ej. desde la raiz o VSCode).
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

// Claves rotadas por el flujo de clave temporal (M11): si un test
// cambia la clave de un usuario, los siguientes logins la reutilizan.
const claves = new Map();

async function login(page, email, password) {
  password = password || claves.get(email) || 'UTEQ2026';
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
  // M11: usuarios nuevos (debe_cambiar_clave) caen a cambiar-clave:
  // se completa ahi con una clave rotada y se sigue al dashboard.
  await page.waitForFunction(
    () => /dashboard\.html|cambiar-clave\.html/.test(location.href),
    null, { timeout: 15000 }
  );
  if (page.url().includes('cambiar-clave')) {
    const nueva = 'Nx' + Date.now().toString(36) + '!Aa';
    await page.locator('#actual').fill(password);
    await page.locator('#nueva').fill(nueva);
    await page.locator('#confirmacion').fill(nueva);
    await page.locator('#form-clave button[type="submit"]').click();
    await page.waitForURL('**/dashboard.html', { timeout: 15000 });
    claves.set(email, nueva);
  }
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
