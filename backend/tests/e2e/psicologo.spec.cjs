// Psicologo: resumen global + tabla paginada de 10.
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

test('rendimiento muestra resumen, alertas y maximo 10 filas', async ({ page }) => {
  await login(page, 'maria.torres@uteq.edu.ec');
  await page.goto('/pages/psicologo.html');
  await expect(page.locator('h1')).toContainText('Rendimiento');
  await expect(page.locator('#resumen')).toBeVisible({ timeout: 15000 });
  const resumenCards = page.locator('#resumen .card');
  await expect(resumenCards.first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#resumen')).toContainText(/Total.*Estudiante|Estudiante.*Total/i);

  const filas = await page.locator('#tabla tbody tr').count();
  expect(filas).toBeGreaterThanOrEqual(1);
  expect(filas).toBeLessThanOrEqual(10);

  // API: la respuesta puede devolver un total global y paginación por página.
  const r = await api(page, 'GET', '/psicologo/rendimiento?page=1&limit=5');
  expect(r.status).toBe(200);
  const datos = Array.isArray(r.data?.datos) ? r.data.datos : [];
  const total = Number(r.data?.paginacion?.total ?? r.data?.total ?? 0);
  const resumenTotal = Number(r.data?.resumen?.total ?? total);

  expect(datos.length).toBeGreaterThan(0);
  expect(datos.length).toBeLessThanOrEqual(5);
  expect(total).toBeGreaterThanOrEqual(10);
  expect(resumenTotal).toBeGreaterThanOrEqual(total);
});

test('admin no puede ver rendimiento (403 API)', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  const r = await api(page, 'GET', '/psicologo/rendimiento');
  expect(r.status).toBe(403);
});
