// Catalogos (admin): CRUD cursos/ciclos/parciales/tipos + reglas.
const { test, expect } = require('@playwright/test');
const { go, login, api } = require('./helpers.cjs');

test.beforeEach(async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await go(page, '/pages/catalogos.html');
  await expect(page.locator('h1')).toContainText('Catálogos');
});

test('crear y borrar curso', async ({ page }) => {
  const nombre = 'PW-Curso-' + Date.now().toString(36);
  const per = await api(page, 'GET', '/periodos/');
  const idPeriodo = per.data.periodoActivo.id_periodo;
  const crea = await api(page, 'POST', '/cursos/', { nombre, paralelo: 'Z', id_periodo: idPeriodo });
  expect(crea.status).toBe(201);
  await page.reload();
  await expect(page.locator('#lista-cursos')).toContainText(nombre, { timeout: 10000 });
  const dup = await api(page, 'POST', '/cursos/', { nombre, paralelo: 'Z', id_periodo: idPeriodo });
  expect(dup.status).toBe(409);
  const borra = await api(page, 'DELETE', `/cursos/${crea.data.id_curso}`);
  expect(borra.status).toBe(200);
});

test('ciclo avisa si pesos no suman y valida formativa+examen=1', async ({ page }) => {
  const per = await api(page, 'GET', '/periodos/');
  const idPeriodo = per.data.periodoActivo.id_periodo;
  const lis = await api(page, 'GET', `/ciclos/?id_periodo=${idPeriodo}`);
  const orden = 1 + Math.max(0, ...lis.data.ciclos.map(c => c.orden));
  const mal = await api(page, 'POST', '/ciclos/', {
    nombre: 'PW-Mal', tipo: 'bimestre', orden, peso: 0.05,
    peso_formativa: 0.5, peso_sumativa: 0.4, id_periodo: idPeriodo,
  });
  expect(mal.status).toBe(400);
  const bien = await api(page, 'POST', '/ciclos/', {
    nombre: 'PW-Ciclo-' + Date.now().toString(36), tipo: 'bimestre', orden,
    peso: 0.05, peso_formativa: 0.7, peso_sumativa: 0.3, id_periodo: idPeriodo,
  });
  expect(bien.status).toBe(201);
  expect(bien.data.advertencia).toBeTruthy();
  const par = await api(page, 'POST', '/parciales/', {
    nombre: 'PW-Parcial', orden: 1, id_ciclo: bien.data.id_ciclo,
  });
  expect(par.status).toBe(201);
  const borraPar = await api(page, 'DELETE', `/parciales/${par.data.id_parcial}`);
  expect(borraPar.status).toBe(200);
  const borraCiclo = await api(page, 'DELETE', `/ciclos/${bien.data.id_ciclo}`);
  expect(borraCiclo.status).toBe(200);
});

test('tipo con notas no se puede borrar (409)', async ({ page }) => {
  const tipos = await api(page, 'GET', '/tipos/');
  const conNotas = tipos.data.tiposEvaluacion.find(t => t.nombre === 'Parcial 1');
  expect(conNotas).toBeTruthy();
  const r = await api(page, 'DELETE', `/tipos/${conNotas.id_tipo_evaluacion}`);
  expect(r.status).toBe(409);
});

test('profesor no ve Catalogos en el sidebar', async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  await go(page, '/pages/dashboard.html');
  // Esperar render real del menu (si no, la asercion negativa es al vacio).
  await expect(page.locator('.sidebar-nav')).toContainText('Registrar Nota', { timeout: 15000 });
  await expect(page.locator('.sidebar-nav')).not.toContainText('Catalogos');
});

test('cada pestana conserva su periodo', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await go(page, '/pages/catalogos.html');
  await expect(page.locator('#tab-cursos')).toBeVisible({ timeout: 15000 });
  const per = await api(page, 'GET', '/periodos/');
  const ids = (per.data.periodos || []).map(p => String(p.id_periodo));
  if (ids.length < 2) return;
  const inicialCic = await page.locator('#cic-periodo').inputValue();
  const inicialAsg = await page.locator('#asg-periodo').inputValue();
  const otro = ids.find(id => id !== inicialCic) || ids[1];
  await page.locator('#cur-periodo').selectOption(otro);
  await page.locator('#tab-btn-ciclos').click();
  expect(await page.locator('#cic-periodo').inputValue()).toBe(inicialCic);
  await page.locator('#tab-btn-asig').click();
  expect(await page.locator('#asg-periodo').inputValue()).toBe(inicialAsg);
});

test('actas: crear borrador y eliminar desde la pestana', async ({ page }) => {
  const tag = Date.now().toString(36);
  const mat = await api(page, 'POST', '/materias/', { nombre: 'Acta UI ' + tag });
  expect(mat.status).toBe(201);
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/catalogos.html');
  await page.locator('#tab-btn-actas').click();
  await expect(page.locator('#lista-actas')).toBeVisible({ timeout: 15000 });
  await page.locator('#act-mat').selectOption(String(mat.data.id_materia));
  await page.locator('#act-guardar').click();
  await expect(page.locator('#lista-actas')).toContainText('Acta UI ' + tag, { timeout: 15000 });
  page.on('dialog', d => d.accept());
  const fila = page.locator('#lista-actas tr', { hasText: 'Acta UI ' + tag });
  await fila.locator('[data-eliminar-acta]').click();
  await expect(page.locator('#lista-actas')).not.toContainText('Acta UI ' + tag, { timeout: 15000 });
  // Nota: materias no tiene DELETE en la API (solo crear/editar);
  // la materia de prueba queda huerfana sin referencias (sin notas
  // ni asignaciones) con nombre unico por corrida.
});
