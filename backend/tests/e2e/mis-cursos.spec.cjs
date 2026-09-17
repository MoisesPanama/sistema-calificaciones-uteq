// Mis cursos del docente (M2 + M10 hub): bloques ordenados por
// curso con accesos directos (Calificar / Ver notas con params).
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

test('profesor ve sus bloques con estudiantes', async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  await page.goto('/pages/mis-cursos.html');
  await expect(page.locator('.cat-card').first()).toBeVisible({ timeout: 15000 });
  const n = await page.locator('.cat-card').count();
  expect(n).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#grupos')).toContainText('estudiante');
  await expect(page.locator('.sidebar-nav')).toContainText('Mis cursos');
  // M10: sin Registrar Nota ni Consultar Notas en su menu.
  await expect(page.locator('.sidebar-nav')).not.toContainText('Registrar Nota');
  await expect(page.locator('.sidebar-nav')).not.toContainText('Consultar Notas');
  // Orden por curso: 8vo antes que 9no; sin tarjeta General.
  const titulos = await page.locator('.cat-card .total').allTextContents();
  expect(titulos.some((t) => /general/i.test(t))).toBe(false);
  const idx8 = titulos.findIndex((t) => /octavo/i.test(t));
  const idx9 = titulos.findIndex((t) => /noveno/i.test(t));
  if (idx8 >= 0 && idx9 >= 0) expect(idx8).toBeLessThan(idx9);
});

test('admin tambien ve Mis cursos', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/mis-cursos.html');
  await expect(page.locator('.cat-card').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.sidebar-nav')).toContainText('Mis cursos');
});

test('Calificar lleva con materia+curso y hay Regresar', async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  await page.goto('/pages/mis-cursos.html');
  await expect(page.locator('.cat-card').first()).toBeVisible({ timeout: 15000 });
  const href = await page.locator('.cat-card a.btn-primary').first().getAttribute('href');
  expect(href).toMatch(/calificaciones\.html\?id_materia=\d+&id_curso=\d+/);
  await page.locator('.cat-card a.btn-primary').first().click();
  await page.waitForURL('**/calificaciones.html?id_materia=*', { timeout: 15000 });
  // Preseleccion por params + curso concreto (sin Todos).
  const q = new URL(page.url()).searchParams;
  expect(q.get('id_materia')).toBeTruthy();
  await expect(page.locator('#sel-materia')).toHaveValue(q.get('id_materia'));
  await expect(page.locator('#sel-curso')).not.toContainText('Todos mis cursos');
  await expect(page.locator('#btn-regresar')).toBeVisible();
  await page.locator('#btn-regresar').click();
  await page.waitForURL('**/mis-cursos.html', { timeout: 15000 });
});

test('Ver notas aterriza directo en la nomina', async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  await page.goto('/pages/mis-cursos.html');
  await expect(page.locator('.cat-card').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.cat-card a.btn-secondary').first().click();
  await page.waitForURL('**/consulta.html?modo=grupo*', { timeout: 15000 });
  await expect(page.locator('#vista-grupo')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#nomina tbody tr').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#btn-miscursos-g')).toBeVisible();
});
