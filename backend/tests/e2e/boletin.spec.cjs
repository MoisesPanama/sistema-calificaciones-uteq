// Boletin imprimible + planilla en blanco (S5).
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

test('boletin del periodo para un estudiante', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/boletin.html');
  await expect(page.locator('#sel-est option').nth(1)).toBeAttached({ timeout: 15000 });
  await page.locator('#sel-est').selectOption({ index: 1 });
  await page.locator('#btn-ver').click();
  await expect(page.locator('#boletin table')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#boletin')).toContainText('Promedio general');
  await expect(page.locator('#btn-imprimir')).toBeVisible();
});

test('planilla en blanco para el aula', async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  await page.goto('/pages/planilla.html');
  await expect(page.locator('#sel-mat option').nth(1)).toBeAttached({ timeout: 15000 });
  await page.locator('#sel-mat').selectOption({ index: 1 });
  await page.locator('#btn-ver').click();
  await expect(page.locator('#planilla table')).toBeVisible({ timeout: 15000 });
  const celdas = await page.locator('#planilla td.planilla-celda').count();
  expect(celdas).toBeGreaterThan(0);
  await expect(page.locator('#btn-imprimir')).toBeVisible();
});

test('estudiante ve su boletin propio', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  const t = Date.now().toString(36);
  const crea = await api(page, 'POST', '/estudiantes/', {
    cedula: '19' + String(Date.now()).slice(-8),
    nombres: 'PWBol ' + t, apellidos: 'Boletin Uno',
    fecha_nacimiento: '2011-05-06', id_representante: 1
  });
  expect(crea.status).toBe(201);
  const per = await api(page, 'GET', '/periodos/');
  await api(page, 'POST', '/matriculas/', {
    id_estudiante: crea.data.id_estudiante,
    id_periodo: per.data.periodoActivo.id_periodo, id_curso: null
  });
  await login(page, crea.data.email);
  await page.goto('/pages/boletin.html');
  await expect(page.locator('#sel-est option').nth(1)).toBeAttached({ timeout: 15000 });
  // Solo el mismo en el select.
  expect(await page.locator('#sel-est option').count()).toBe(2);
  await page.locator('#sel-est').selectOption({ index: 1 });
  await page.locator('#btn-ver').click();
  await expect(page.locator('#boletin table')).toBeVisible({ timeout: 15000 });
});
