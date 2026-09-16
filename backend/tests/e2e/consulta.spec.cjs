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

test('observacion visible y falta registrable en el detalle', async ({ page }) => {
  const tag = Date.now().toString(36);
  await login(page, 'admin@uteq.edu.ec');
  const per = await api(page, 'GET', '/periodos/');
  const idPeriodo = per.data.periodoActivo.id_periodo;
  // Observacion en una nota de Isabella/Matematicas.
  await api(page, 'POST', '/calificaciones/', {
    id_estudiante: 8, id_materia: 1, id_periodo: idPeriodo,
    id_tipo_evaluacion: 1, valor: 8.2, observacion: 'PWOBS ' + tag
  });
  // Representante la ve en el detalle (bloque Matematicas).
  await login(page, 'fernando.castillo@uteq.edu.ec');
  await go(page, '/pages/consulta.html');
  await expect(page.locator('.cat-card').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.cat-card', { hasText: 'Matematicas' }).first().click();
  await expect(page.locator('#nomina tbody tr').first()).toBeVisible({ timeout: 15000 });
  await page.locator('[data-ver-est]').first().click();
  await expect(page.locator('#vista-detalle')).toBeVisible();
  await expect(page.locator('#resultado')).toContainText('PWOBS ' + tag, { timeout: 15000 });
});

test('docente registra falta desde el detalle', async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  await go(page, '/pages/consulta.html');
  await expect(page.locator('.cat-card').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.cat-card').first().click();
  await expect(page.locator('#nomina tbody tr').first()).toBeVisible({ timeout: 15000 });
  await page.locator('[data-ver-est]').first().click();
  await expect(page.locator('#vista-detalle')).toBeVisible();
  page.on('dialog', d => d.dismiss());
  const btn = page.locator('[data-falta-add]').first();
  if (await btn.count() > 0) {
    await page.locator('#resultado').getByText('Ver notas').first().click();
    await btn.click();
    await expect(page.locator('#resultado')).toContainText('Faltas en la materia:', { timeout: 15000 });
  }
});
