// Helpers compartidos de la suite Playwright.
async function login(page, email, password = 'UTEQ2026') {
  // Sin esto, el auto-redirect del login (si ya hay sesion)
  // saca a dashboard y los fill() esperan eternamente.
  await page.context().clearCookies();
  // domcontentloaded (no load): evita la carrera ERR_ABORTED con
  // el auto-redirect de la propia pagina en modo headed.
  // Reintento: la carrera es intermitente (navegacion reemplazada).
  try {
    await page.goto('/pages/login.html', { waitUntil: 'domcontentloaded' });
  } catch (e) {
    if (!/ERR_ABORTED/.test(String(e && e.message))) throw e;
    await page.goto('/pages/login.html', { waitUntil: 'domcontentloaded' });
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

module.exports = { login, api };
