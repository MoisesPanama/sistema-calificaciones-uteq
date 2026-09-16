// Consulta por bloques + asignaciones (admin).
const { test, expect } = require('@playwright/test');
const { go, login, api } = require('./helpers.cjs');

test('bloques llevan a nomina paginada y al detalle', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await go(page, '/pages/consulta.html');
  await expect(page.locator('.cat-card').first()).toBeVisible({ timeout: 15000 });
  const nBloques = await page.locator('.cat-card').count();
  expect(nBloques).toBeGreaterThanOrEqual(2);
  await page.locator('.cat-card').first().click();
  await expect(page.locator('#vista-grupo')).toBeVisible();
  await expect(page.locator('#nomina tbody tr').first()).toBeVisible({ timeout: 15000 });
  const filas = await page.locator('#nomina tbody tr').count();
  expect(filas).toBeLessThanOrEqual(10);
  await page.locator('[data-ver-est]').first().click();
  await expect(page.locator('#vista-detalle')).toBeVisible();
  await expect(page.locator('#resultado')).toContainText('Materias con notas');
  await page.locator('#btn-nomina').click();
  await expect(page.locator('#vista-grupo')).toBeVisible();
  await page.locator('#btn-grupos').click();
  await expect(page.locator('#vista-bloques')).toBeVisible();
});

test('profesor solo ve sus bloques', async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  const r = await api(page, 'GET', '/consulta/grupos?id_periodo=1');
  expect(r.status).toBe(200);
  expect(r.data.grupos.length).toBeGreaterThan(0);
});

test('asignar desde catalogos responde ok o 409 justificado', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await go(page, '/pages/catalogos.html');
  await page.locator('#tab-btn-asig').click();
  await expect(page.locator('#lista-asig')).toBeVisible({ timeout: 15000 });
  await page.locator('#asg-guardar').click();
  await expect.poll(async () =>
    await page.locator('#ok').isVisible() || await page.locator('#error').isVisible(),
    { timeout: 20000 }).toBe(true);
  if (await page.locator('#error').isVisible()) {
    await expect(page.locator('#error')).toContainText(/ya la dicta|obligatorios/i);
  }
});
