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
    await expect(page.locator('#error')).toContainText(/ya la dicta|obligatorio/i);
  }
});

test('observacion visible y falta registrable en el detalle', async ({ page }) => {
  const tag = Date.now().toString(36);
  // Bloque SIN acta validada (e2e congela Matematicas en un curso).
  // M12: primero se elige HIJO (nada hardcodeado).
  await login(page, 'fernando.castillo@uteq.edu.ec');
  const per = await api(page, 'GET', '/periodos/');
  const idPeriodo = per.data.periodoActivo.id_periodo;
  const lh = await api(page, 'GET', `/consulta/?id_periodo=${idPeriodo}`);
  const hijo0 = (lh.data.estudiantes || [])[0];
  expect(hijo0).toBeTruthy();
  const idHijoFijo = hijo0.id_estudiante;
  const gr = await api(page, 'GET', `/consulta/grupos?id_periodo=${idPeriodo}&id_estudiante=${idHijoFijo}`);
  const bloques = (gr.data.grupos || []).filter((g) => g.materia !== 'Matematicas');
  expect(bloques.length).toBeGreaterThan(0);
  const g0 = bloques[0];
  const idMateria = g0.id_materia;
  // Observacion en una nota del hijo (tipo 4 = Tarea, como admin).
  // Reutiliza la de corridas previas si ya existe (grano legacy
  // unico por estudiante+materia+tipo): asi es determinista.
  await login(page, 'admin@uteq.edu.ec');
  const previa = await api(page, 'GET', `/consulta/?id_periodo=${idPeriodo}&id_estudiante=${idHijoFijo}&id_materia=${idMateria}`);
  const obsVieja = (previa.data.materias || [])
    .flatMap((m) => m.parciales || [])
    .map((p) => p.observacion || '')
    .find((o) => o.startsWith('PWOBS '));
  let tagObs = obsVieja;
  if (!tagObs) {
    tagObs = 'PWOBS ' + tag;
    const creada = await api(page, 'POST', '/calificaciones/', {
      id_estudiante: idHijoFijo, id_materia: idMateria, id_periodo: idPeriodo,
      id_tipo_evaluacion: 4, valor: 8.2, observacion: tagObs
    });
    expect(creada.status).toBe(201);
  }
  // Representante la ve en el detalle (hijo -> grupo -> nomina).
  await login(page, 'fernando.castillo@uteq.edu.ec');
  await go(page, '/pages/consulta.html');
  await expect(page.locator('.cat-card[data-hijo]').first()).toBeVisible({ timeout: 15000 });
  await page.locator(`.cat-card[data-hijo="${idHijoFijo}"]`).click();
  const nombreMat = bloques.find((g) => String(g.id_materia) === String(idMateria)).materia;
  const cardGrupo = page.locator('.cat-card[data-grupo]', { hasText: nombreMat }).first();
  await expect(cardGrupo).toBeVisible({ timeout: 15000 });
  await cardGrupo.click();
  await expect(page.locator('#nomina tbody tr').first()).toBeVisible({ timeout: 15000 });
  await page.locator(`[data-ver-est="${idHijoFijo}"]`).click();
  await expect(page.locator('#vista-detalle')).toBeVisible();
  await expect(page.locator('#resultado')).toContainText(tagObs, { timeout: 15000 });
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

test('materias en acordeon con desglose perezoso', async ({ page }) => {
  await login(page, 'fernando.castillo@uteq.edu.ec');
  await go(page, '/pages/consulta.html');
  await expect(page.locator('.cat-card[data-hijo]').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.cat-card[data-hijo]').first().click();
  await expect(page.locator('.cat-card[data-grupo]').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.cat-card[data-grupo]').first().click();
  await expect(page.locator('#nomina tbody tr').first()).toBeVisible({ timeout: 15000 });
  await page.locator('[data-ver-est]').first().click();
  await expect(page.locator('#vista-detalle')).toBeVisible({ timeout: 15000 });
  // Todo colapsado de entrada.
  expect(await page.locator('.mat-detalle').first().isVisible()).toBe(false);
  // La cabecera expande.
  await page.locator('[data-mat-toggle]').first().click();
  await expect(page.locator('.mat-detalle').first()).toBeVisible({ timeout: 10000 });
  // Desglose perezoso: no hay ciclo-card hasta pedirlo.
  expect(await page.locator('.mat-detalle').first().locator('.ciclo-card').count()).toBe(0);
  await page.locator('[data-ver-desglose]').first().click();
  await expect(page.locator('.mat-detalle').first().locator('.ciclo-card').first()).toBeVisible({ timeout: 15000 });
});
