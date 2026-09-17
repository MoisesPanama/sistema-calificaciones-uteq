// M10 periodo unificado: cambiar en el header refleja los
// registros DE ESE periodo (no los del actual), en cualquier rol.
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

test('cambiar de periodo muestra sus registros y regresa', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  // Sandbox fijo reutilizable (cero crecimiento entre corridas).
  const NOMBRE_VIEJO = 'E2E Sandbox Viejo';
  let idViejo = null;
  const np = await api(page, 'POST', '/periodos/', {
    nombre: NOMBRE_VIEJO, fecha_inicio: '2020-09-01', fecha_fin: '2021-07-31'
  });
  if (np.status === 201) {
    idViejo = np.data.id_periodo;
  } else {
    const per = await api(page, 'GET', '/periodos/');
    idViejo = (per.data.periodos || []).find((p) => p.nombre === NOMBRE_VIEJO)?.id_periodo;
  }
  expect(idViejo).toBeTruthy();

  await page.goto('/pages/dashboard.html');
  await expect(page.locator('#periodoNombre')).not.toContainText('Cargando', { timeout: 15000 });
  const nombreActivo = await page.locator('#periodoNombre').textContent();
  expect(nombreActivo.trim()).not.toBe('');
  expect(nombreActivo).not.toContain('Cargando');

  // Cambia al viejo desde el header (recarga la pagina).
  await page.locator('#btnPeriodo').click();
  await page.locator('.header-periodo-item', { hasText: NOMBRE_VIEJO }).click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#periodoNombre')).toContainText(NOMBRE_VIEJO, { timeout: 15000 });

  // Sin ?id_periodo: la sesion manda (vacio en el viejo).
  const gr = await api(page, 'GET', '/consulta/grupos');
  expect(gr.status).toBe(200);
  expect(gr.data.grupos.length).toBe(0);
  const dash = await api(page, 'GET', '/dashboard/');
  expect(String(dash.data.idPeriodo)).toBe(String(idViejo));

  // Regresa al activo.
  await page.locator('#btnPeriodo').click();
  await page.locator('.header-periodo-item', { hasText: nombreActivo.trim().split(' ')[0] }).first().click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#periodoNombre')).toContainText(nombreActivo.trim(), { timeout: 15000 });
  const gr2 = await api(page, 'GET', '/consulta/grupos');
  expect(gr2.data.grupos.length).toBeGreaterThan(0);
});

test('selector nunca queda en Cargando sin periodo', async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  await page.goto('/pages/mis-cursos.html');
  await expect(page.locator('#periodoNombre')).not.toContainText('Cargando', { timeout: 15000 });
  const txt = (await page.locator('#periodoNombre').textContent()).trim();
  expect(txt.length).toBeGreaterThan(0);
});
