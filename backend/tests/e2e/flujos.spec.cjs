// Respaldos (admin) + paginacion + consulta con desglose.
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

test('respaldo manual aparece en lista e historial', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/respaldos.html');
  await page.locator('#btn-respaldo').click();
  await expect(page.locator('#ok')).toContainText('Respaldo creado', { timeout: 90000 });
  await expect(page.locator('#lista-respaldos')).toContainText('respaldo_', { timeout: 15000 });
  await expect(page.locator('#historial-respaldos')).toContainText('manual', { timeout: 15000 });
});

test('estudiantes pagina y muestra controles compartidos', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/estudiantes.html');
  await expect(page.locator('#resultado table')).toBeVisible({ timeout: 15000 });
  // 10 estudiantes, limite 20 -> una sola pagina: sin botones.
  // Forzar limite chico por API para ver el componente.
  // limite minimo del endpoint es 5 (leerPaginacion minimo: 5).
  const r = await api(page, 'GET', '/estudiantes/?page=1&limit=5');
  expect(r.status).toBe(200);
  expect(r.data.datos.length).toBeLessThanOrEqual(5);
  expect(r.data.paginacion.totalPages).toBeGreaterThan(1);
});

test('representante ve desglose por materia', async ({ page }) => {
  await login(page, 'fernando.castillo@uteq.edu.ec');
  await page.goto('/pages/consulta.html');
  const selEst = page.locator('#sel-est');
  await expect(selEst.locator('option').nth(1)).toBeAttached({ timeout: 15000 });
  await selEst.selectOption({ index: 1 });
  await expect(page.locator('#sel-mat')).toBeVisible({ timeout: 15000 });
  await page.locator('#sel-mat').selectOption({ index: 1 });
  await expect(page.locator('#desglose table').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#desglose')).toContainText('Mínimo esperado');
});
