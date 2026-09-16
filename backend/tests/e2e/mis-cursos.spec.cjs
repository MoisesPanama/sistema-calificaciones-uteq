// Mis cursos del docente (M2): bloques con conteo y accesos.
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers.cjs');

test('profesor ve sus bloques con estudiantes', async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  await page.goto('/pages/mis-cursos.html');
  await expect(page.locator('.cat-card').first()).toBeVisible({ timeout: 15000 });
  const n = await page.locator('.cat-card').count();
  expect(n).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#grupos')).toContainText('estudiante');
  await expect(page.locator('.sidebar-nav')).toContainText('Mis cursos');
});

test('admin tambien ve Mis cursos', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/mis-cursos.html');
  await expect(page.locator('.cat-card').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.sidebar-nav')).toContainText('Mis cursos');
});
