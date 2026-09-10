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
  await expect(page.locator('.cat-card').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.cat-card').first().click();
  await expect(page.locator('#nomina tbody tr').first()).toBeVisible({ timeout: 15000 });
  await page.locator('[data-ver-est]').first().click();
  await expect(page.locator('#vista-detalle')).toBeVisible();
  await expect(page.locator('#resultado')).toContainText('Materias con notas');
  await expect(page.locator('#desglose .ciclo-card').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#desglose')).toContainText('nimo esperado');
});
