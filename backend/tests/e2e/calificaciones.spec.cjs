// Calificaciones (profesor): selects ciclo/parcial y guardado.
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers.cjs');

test.beforeEach(async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  await page.goto('/pages/calificaciones.html');
  await expect(page.locator('h1')).toContainText('Registrar Calificaciones');
});

test('selects de ciclo y parcial se pueblan y guardan la nota', async ({ page }) => {
  const selMat = page.locator('#sel-materia');
  await expect(selMat).toBeVisible({ timeout: 10000 });
  // Elegir la primera materia real (Elena tiene Ciencias Naturales).
  await selMat.selectOption({ index: 1 });
  await expect(page.locator('#tabla table')).toBeVisible({ timeout: 15000 });

  const selCiclo = page.locator('#sel-ciclo');
  await expect(selCiclo.locator('option').nth(1)).toBeAttached({ timeout: 10000 });
  await selCiclo.selectOption({ index: 1 });
  const selParcial = page.locator('#sel-parcial');
  await expect(selParcial.locator('option').nth(1)).toBeAttached({ timeout: 10000 });

  // Escribir una nota en la primera celda y guardar ese estudiante.
  const primera = page.locator('input[data-est]').first();
  await primera.fill('8.75');
  await page.locator('[data-guardar-est]').first().click();
  await expect(page.locator('#ok')).toBeVisible({ timeout: 15000 });
});
