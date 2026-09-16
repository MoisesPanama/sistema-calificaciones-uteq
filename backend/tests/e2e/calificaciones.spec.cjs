// Calificaciones por actividades: crear, calificar y guardar.
const { test, expect } = require('@playwright/test');
const { go, login } = require('./helpers.cjs');

test.beforeEach(async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  await go(page, '/pages/calificaciones.html');
  await expect(page.locator('h1')).toContainText('Registrar Calificaciones');
});

test('crear actividad, calificar y guardar la nota', async ({ page }) => {
  const tag = Date.now().toString(36);
  const selMat = page.locator('#sel-materia');
  await expect(selMat).toBeVisible({ timeout: 10000 });
  // Elegir la primera materia real (Elena tiene Ciencias Naturales).
  await selMat.selectOption({ index: 1 });

  const selCiclo = page.locator('#sel-ciclo');
  await expect(selCiclo.locator('option').nth(1)).toBeAttached({ timeout: 10000 });
  await selCiclo.selectOption({ index: 1 });
  const selParcial = page.locator('#sel-parcial');
  await expect(selParcial.locator('option').nth(1)).toBeAttached({ timeout: 10000 });
  await selParcial.selectOption({ index: 1 });

  // Crear una actividad nueva desde la tarjeta "+ Nueva actividad".
  await expect(page.locator('#card-nueva')).toBeVisible({ timeout: 15000 });
  await page.locator('#card-nueva').click();
  await page.locator('#act-nombre').fill('Leccion PW ' + tag);
  await page.locator('#act-tipo').selectOption({ index: 0 });
  await page.locator('#act-guardar').click();
  await expect(page.locator('#lista-actividades')).toContainText('Leccion PW ' + tag, { timeout: 15000 });

  // Calificar: abrir la planilla de la actividad recien creada.
  const card = page.locator('.act-card', { hasText: 'Leccion PW ' + tag });
  await card.locator('[data-calificar]').click();
  await expect(page.locator('#tabla table')).toBeVisible({ timeout: 15000 });

  // Escribir una nota en la primera celda y guardar ese estudiante.
  const primera = page.locator('input[data-est]').first();
  await primera.fill('8.75');
  await page.locator('[data-guardar-est]').first().click();
  await expect(page.locator('#ok')).toBeVisible({ timeout: 15000 });
});
