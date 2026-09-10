// Catalogos (admin): CRUD cursos/ciclos/parciales/tipos + reglas.
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

test.beforeEach(async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/catalogos.html');
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
  await page.goto('/pages/dashboard.html');
  await expect(page.locator('.sidebar-nav')).not.toContainText('Catalogos');
});
