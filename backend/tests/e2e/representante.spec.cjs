// M12 representante solo-consulta: sin reportes/boletin/matricula,
// bloques por hijo y nada ajeno.
const { test, expect } = require('@playwright/test');
const { go, login, api } = require('./helpers.cjs');

test('menu solo Inicio + Consultar Notas', async ({ page }) => {
  await login(page, 'fernando.castillo@uteq.edu.ec');
  await go(page, '/pages/dashboard.html');
  await expect(page.locator('.sidebar-nav')).toContainText('Consultar Notas', { timeout: 15000 });
  await expect(page.locator('.sidebar-nav')).not.toContainText('Reportes');
  await expect(page.locator('.sidebar-nav')).not.toContainText('Boletín');
  await expect(page.locator('.sidebar-nav')).not.toContainText('Mi matrícula');
  await expect(page.locator('.sidebar-nav')).not.toContainText('Supletorio');
});

test('API recortada: reportes y mia 403, consulta 200', async ({ page }) => {
  await login(page, 'fernando.castillo@uteq.edu.ec');
  const rep = await api(page, 'GET', '/reportes/?page=1&limit=5');
  expect(rep.status).toBe(403);
  const mia = await api(page, 'GET', '/matriculas/mia');
  expect(mia.status).toBe(403);
  const con = await api(page, 'GET', '/consulta/');
  expect(con.status).toBe(200);
  expect((con.data.estudiantes || []).length).toBeGreaterThanOrEqual(2);
});

test('grupos ocultan paralelos ajenos', async ({ page }) => {
  await login(page, 'fernando.castillo@uteq.edu.ec');
  const per = await api(page, 'GET', '/periodos/');
  const idP = per.data.periodoActivo.id_periodo;
  // Sin filtro ya no trae todo: solo grupos con hijos.
  const gr = await api(page, 'GET', `/consulta/grupos?id_periodo=${idP}`);
  expect(gr.status).toBe(200);
  expect(gr.data.grupos.length).toBeGreaterThan(0);
  // Admin ve mas (o igual) grupos que el representante.
  await login(page, 'admin@uteq.edu.ec');
  const grA = await api(page, 'GET', `/consulta/grupos?id_periodo=${idP}`);
  expect(grA.data.grupos.length).toBeGreaterThanOrEqual(gr.data.grupos.length);
  // Hijo ajeno por parametro -> 403 (en grupo existente).
  await login(page, 'fernando.castillo@uteq.edu.ec');
  const ajeno = await api(page, 'GET', `/consulta/grupos?id_periodo=${idP}&id_estudiante=999999`);
  expect(ajeno.status).toBe(403);
  const g0 = gr.data.grupos[0];
  const nomAjeno = await api(page, 'GET', `/consulta/grupo?id_periodo=${idP}&id_materia=${g0.id_materia}&id_curso=${g0.id_curso || ''}&id_estudiante=999999`);
  expect(nomAjeno.status).toBe(403);
});

test('flujo hijo por hijo hasta el detalle', async ({ page }) => {
  await login(page, 'fernando.castillo@uteq.edu.ec');
  await go(page, '/pages/consulta.html');
  await expect(page.locator('#bloques-titulo')).toContainText('hijo', { timeout: 15000 });
  const nHijos = await page.locator('.cat-card[data-hijo]').count();
  expect(nHijos).toBeGreaterThanOrEqual(2);
  await page.locator('.cat-card[data-hijo]').first().click();
  await expect(page.locator('.cat-card[data-grupo]').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#bloques-titulo')).toContainText('tu hijo', { timeout: 10000 });
  await page.locator('.cat-card[data-grupo]').first().click();
  await expect(page.locator('#nomina tbody tr').first()).toBeVisible({ timeout: 15000 });
  await page.locator('[data-ver-est]').first().click();
  await expect(page.locator('#vista-detalle')).toBeVisible({ timeout: 15000 });
  // Volver sube a nomina, luego a los hijos (no a todos los grupos).
  await page.locator('#btn-nomina').click();
  await expect(page.locator('#vista-grupo')).toBeVisible({ timeout: 10000 });
  await page.locator('#btn-grupos').click();
  await expect(page.locator('#bloques-titulo')).toContainText('hijo', { timeout: 10000 });
});
