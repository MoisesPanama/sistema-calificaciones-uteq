// Psicologo: resumen global + tabla paginada de 10.
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

test('rendimiento muestra resumen, alertas y maximo 10 filas', async ({ page }) => {
  await login(page, 'maria.torres@uteq.edu.ec');
  await page.goto('/pages/psicologo.html');
  await expect(page.locator('h1')).toContainText('Rendimiento');
  await expect(page.locator('#resumen .card').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#resumen')).toContainText('Total Estudiantes');
  const filas = await page.locator('#tabla tbody tr').count();
  expect(filas).toBeLessThanOrEqual(10);
  // API: pagina de 5 sobre 10 estudiantes -> 2 paginas.
  const r = await api(page, 'GET', '/psicologo/rendimiento?page=1&limit=5');
  expect(r.status).toBe(200);
  expect(r.data.datos.length).toBeLessThanOrEqual(5);
  expect(r.data.paginacion.total).toBeGreaterThanOrEqual(10);
  expect(r.data.resumen.total).toBe(r.data.paginacion.total);
});

test('admin no puede ver rendimiento (403 API)', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  const r = await api(page, 'GET', '/psicologo/rendimiento');
  expect(r.status).toBe(403);
});
