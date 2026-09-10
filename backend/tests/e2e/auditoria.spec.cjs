// Auditoria (admin): resumen en bloques + detalle + filtros.
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers.cjs');

test.beforeEach(async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/auditoria.html');
  await expect(page.locator('h1')).toContainText(/Auditor[ií]a/);
});

test('resumen muestra bloques y entrar al detalle funciona', async ({ page }) => {
  await expect(page.locator('.cat-card').first()).toBeVisible({ timeout: 15000 });
  const nBloques = await page.locator('.cat-card').count();
  expect(nBloques).toBeGreaterThanOrEqual(3);
  await page.locator('.cat-card').first().click();
  await expect(page.locator('#vista-detalle')).toBeVisible();
  await expect(page.locator('.audit-card').first()).toBeVisible({ timeout: 15000 });
  await page.locator('#btn-volver').click();
  await expect(page.locator('#vista-resumen')).toBeVisible();
});

test('filtro por fecha y categoria', async ({ page }) => {
  await page.locator('.cat-card').first().click();
  await expect(page.locator('.audit-card').first()).toBeVisible({ timeout: 15000 });
  const hoy = new Date().toISOString().slice(0, 10);
  await page.locator('#filter-desde').fill(hoy);
  await page.locator('#filter-hasta').fill(hoy);
  await page.locator('#btn-filtrar').click();
  await page.waitForTimeout(1500);
  // Con o sin filas, no debe haber error visible.
  await expect(page.locator('#error')).toBeHidden();
});
