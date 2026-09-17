// Calificaciones por actividades: crear, calificar y guardar.
const { test, expect } = require('@playwright/test');
const { go, login, api } = require('./helpers.cjs');

test.beforeEach(async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  // Precondicion: backend con migracion 22 (si falla aqui, falta
  // aplicar database/22_actividades.sql en la BD bajo prueba).
  const pre = await api(page, 'GET', '/actividades/tipos');
  expect(pre.status, 'Falta migracion 22 en la BD: tabla actividades').toBe(200);
  await go(page, '/pages/calificaciones.html');
  await expect(page.locator('h1')).toContainText('Registrar Calificaciones');
});

test('crear actividad, calificar y guardar la nota', async ({ page }) => {
  const NOMBRE_ACT = 'Leccion PW Fija';
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

  // Actividad fija reutilizable (si ya existe de otra corrida, se reusa).
  await expect(page.locator('#card-nueva')).toBeVisible({ timeout: 15000 });
  await page.locator('#card-nueva').click();
  await page.locator('#act-nombre').fill(NOMBRE_ACT);
  await page.locator('#act-tipo').selectOption({ index: 0 });
  await page.locator('#act-guardar').click();
  await page.waitForTimeout(1500);
  if (await page.locator('#act-error').isVisible()) {
    await page.locator('#act-cancelar').click();
  }
  await expect(page.locator('#lista-actividades')).toContainText(NOMBRE_ACT, { timeout: 15000 });

  // Calificar: abrir la planilla de la actividad.
  const card = page.locator('.act-card', { hasText: NOMBRE_ACT });
  await card.locator('[data-calificar]').click();
  await expect(page.locator('#tabla table')).toBeVisible({ timeout: 15000 });

  // Escribir una nota en la primera celda y guardar ese estudiante.
  const primera = page.locator('input[data-est]').first();
  await primera.fill('8.75');
  await page.locator('[data-guardar-est]').first().click();
  await expect(page.locator('#ok')).toBeVisible({ timeout: 15000 });
});

test('publicar y cerrar actividad desde sus tarjetas', async ({ page }) => {
  const tag = Date.now().toString(36);
  const selMat = page.locator('#sel-materia');
  await expect(selMat).toBeVisible({ timeout: 10000 });
  await selMat.selectOption({ index: 1 });
  await expect(page.locator('#card-nueva')).toBeVisible({ timeout: 15000 });
  await page.locator('#card-nueva').click();
  await page.locator('#act-nombre').fill('Estado PW ' + tag);
  await page.locator('#act-tipo').selectOption({ index: 0 });
  await page.locator('#act-guardar').click();
  const card = page.locator('.act-card', { hasText: 'Estado PW ' + tag });
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toContainText('Borrador');
  await card.locator('[data-estado]').click();
  await expect(card).toContainText('Publicada', { timeout: 10000 });
  await card.locator('[data-estado]').click();
  await expect(card).toContainText('Cerrada', { timeout: 10000 });
  await expect(card.locator('[data-estado]')).toContainText('Reabrir');
});

test('adjuntar y quitar material en calificar', async ({ page }) => {
  const NOMBRE_ACT = 'Adjunto PW Fijo';
  const selMat = page.locator('#sel-materia');
  await expect(selMat).toBeVisible({ timeout: 10000 });
  await selMat.selectOption({ index: 1 });
  await expect(page.locator('#card-nueva')).toBeVisible({ timeout: 15000 });
  await page.locator('#card-nueva').click();
  await page.locator('#act-nombre').fill(NOMBRE_ACT);
  await page.locator('#act-tipo').selectOption({ index: 0 });
  await page.locator('#act-guardar').click();
  await page.waitForTimeout(1500);
  if (await page.locator('#act-error').isVisible()) {
    await page.locator('#act-cancelar').click();
  }
  const card = page.locator('.act-card', { hasText: NOMBRE_ACT });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.locator('[data-calificar]').click();
  await expect(page.locator('#tabla table')).toBeVisible({ timeout: 15000 });
  await page.locator('#input-adjuntos').setInputFiles('tests/fixtures/muestra.pdf');
  await page.locator('#btn-subir-adj').click();
  await expect(page.locator('#lista-adjuntos')).toContainText('muestra.pdf', { timeout: 15000 });
  page.on('dialog', d => d.accept());
  await page.locator('#lista-adjuntos [data-del-adj]').click();
  await expect(page.locator('#lista-adjuntos')).toContainText('Sin material adjunto', { timeout: 15000 });
});

test('flujo de entregas en la planilla', async ({ page }) => {
  const tag = Date.now().toString(36);
  const selMat = page.locator('#sel-materia');
  await expect(selMat).toBeVisible({ timeout: 10000 });
  await selMat.selectOption({ index: 1 });
  await expect(page.locator('#card-nueva')).toBeVisible({ timeout: 15000 });
  await page.locator('#card-nueva').click();
  await page.locator('#act-nombre').fill('Entrega PW ' + tag);
  await page.locator('#act-tipo').selectOption({ index: 0 });
  await page.locator('#act-guardar').click();
  const card = page.locator('.act-card', { hasText: 'Entrega PW ' + tag });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.locator('[data-estado]').click();
  await expect(card).toContainText('Publicada', { timeout: 10000 });
  await card.locator('[data-calificar]').click();
  await expect(page.locator('#tabla table')).toBeVisible({ timeout: 15000 });
  const fila = page.locator('#tabla tbody tr').first();
  await expect(fila).toContainText('Pendiente');
  await fila.locator('[data-entrega]').click();
  await expect(fila).toContainText('Enviada', { timeout: 10000 });
  await fila.locator('[data-entrega]').first().click();
  await expect(fila).toContainText('Aceptada', { timeout: 10000 });
});

test('fecha limite anterior se rechaza y ausente registra 0', async ({ page }) => {
  const NOMBRE_ACT = 'Limite PW Fijo';
  const selMat = page.locator('#sel-materia');
  await expect(selMat).toBeVisible({ timeout: 10000 });
  await selMat.selectOption({ index: 1 });
  const selCiclo = page.locator('#sel-ciclo');
  await expect(selCiclo.locator('option').nth(1)).toBeAttached({ timeout: 10000 });
  await selCiclo.selectOption({ index: 1 });
  const selParcial = page.locator('#sel-parcial');
  await expect(selParcial.locator('option').nth(1)).toBeAttached({ timeout: 10000 });
  await selParcial.selectOption({ index: 1 });

  await expect(page.locator('#card-nueva')).toBeVisible({ timeout: 15000 });
  await page.locator('#card-nueva').click();
  await page.locator('#act-nombre').fill(NOMBRE_ACT);
  await page.locator('#act-tipo').selectOption({ index: 0 });
  await page.locator('#act-fecha').fill('2026-10-10');
  await page.locator('#act-limite').fill('2026-10-01');
  await page.locator('#act-guardar').click();
  await expect(page.locator('#act-error')).toContainText('limite', { timeout: 10000 });

  await page.locator('#act-limite').fill('2026-10-20');
  await page.locator('#act-guardar').click();
  await page.waitForTimeout(1500);
  if (await page.locator('#act-error').isVisible()) {
    await page.locator('#act-cancelar').click();
  }
  const card = page.locator('.act-card', { hasText: NOMBRE_ACT });
  await expect(card).toContainText('límite 2026-10-20', { timeout: 15000 });

  await card.locator('[data-calificar]').click();
  await expect(page.locator('#tabla table')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-ausente]').first().click();
  await expect(page.locator('#ok')).toBeVisible({ timeout: 15000 });
  const primerInput = page.locator('input[data-est]').first();
  await expect(primerInput).toHaveValue(/^0(\.00)?$/, { timeout: 15000 });
});
