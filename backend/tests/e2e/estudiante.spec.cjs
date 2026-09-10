// Rol estudiante: solo sus notas, sin reportes.
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

let tag = '';

test.beforeEach(async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  // Crear estudiante con usuario propio (email generado, clave UTEQ2026).
  tag = Date.now().toString(36);
  const crea = await api(page, 'POST', '/estudiantes/', {
    cedula: '19' + String(Date.now()).slice(-8),
    nombres: 'PWE' + tag + ' Uno', apellidos: 'Prueba Dos',
    fecha_nacimiento: '2011-05-06', id_representante: 1
  });
  expect(crea.status).toBe(201);
  const per = await api(page, 'GET', '/periodos/');
  const idPeriodo = per.data.periodoActivo.id_periodo;
  await api(page, 'POST', '/matriculas/', {
    id_estudiante: crea.data.id_estudiante, id_periodo: idPeriodo, id_curso: null
  });
  await login(page, crea.data.email);
});

test('sidebar sin Reportes', async ({ page }) => {
  await page.goto('/pages/dashboard.html');
  await expect(page.locator('.sidebar-nav')).toContainText('Consultar Notas', { timeout: 15000 });
  await expect(page.locator('.sidebar-nav')).not.toContainText('Reportes');
});

test('consulta muestra lo propio sin elegir a nadie', async ({ page }) => {
  await page.goto('/pages/consulta.html');
  await expect(page.locator('#vista-detalle')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#vista-bloques')).toBeHidden();
});

test('sin notas ve tarjetas Sin calificar, no error', async ({ page }) => {
  const t2 = Date.now().toString(36);
  const crea = await api(page, 'POST', '/estudiantes/', {
    cedula: '19' + String(Date.now()).slice(-8),
    nombres: 'PWVacio ' + t2, apellidos: 'Sin Notas',
    fecha_nacimiento: '2011-05-06', id_representante: 1
  });
  expect(crea.status).toBe(201);
  const per = await api(page, 'GET', '/periodos/');
  await api(page, 'POST', '/matriculas/', {
    id_estudiante: crea.data.id_estudiante,
    id_periodo: per.data.periodoActivo.id_periodo, id_curso: null
  });
  await login(page, crea.data.email);
  await page.goto('/pages/consulta.html');
  await expect(page.locator('#vista-detalle')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#resultado')).toContainText('Sin calificar');
  await expect(page.locator('#resultado .alert-error')).toHaveCount(0);
});

test('API reportes 403 y consulta ajena devuelve lo propio', async ({ page }) => {
  const per = await api(page, 'GET', '/periodos/');
  const idPeriodo = per.data.periodoActivo.id_periodo;
  const rep = await api(page, 'GET', `/reportes/?id_periodo=${idPeriodo}`);
  expect(rep.status).toBe(403);
  const espia = await api(page, 'GET', `/consulta/?id_periodo=${idPeriodo}&id_estudiante=1`);
  expect(espia.status).toBe(200);
  const propio = await api(page, 'GET', '/estudiantes/?q=PWE' + tag);
  expect(propio.data.datos.length).toBe(1);
  expect(String(espia.data.idEstudiante)).toBe(String(propio.data.datos[0].id_estudiante));
});

test('sin botones de regreso a bloques/nomina', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  const t3 = Date.now().toString(36);
  const crea = await api(page, 'POST', '/estudiantes/', {
    cedula: '19' + String(Date.now()).slice(-8),
    nombres: 'PWVuelta ' + t3, apellidos: 'Sin Regreso',
    fecha_nacimiento: '2011-05-06', id_representante: 1
  });
  expect(crea.status).toBe(201);
  const per = await api(page, 'GET', '/periodos/');
  await api(page, 'POST', '/matriculas/', {
    id_estudiante: crea.data.id_estudiante,
    id_periodo: per.data.periodoActivo.id_periodo, id_curso: null
  });
  await login(page, crea.data.email);
  await page.goto('/pages/consulta.html');
  await expect(page.locator('#vista-detalle')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#btn-grupos')).toBeHidden();
  await expect(page.locator('#btn-nomina')).toBeHidden();
  // Aunque pida una nomina ajena por API, solo se ve el mismo.
  const per2 = await api(page, 'GET', '/periodos/');
  const idPer = per2.data.periodoActivo.id_periodo;
  const gr = await api(page, 'GET', `/consulta/grupos?id_periodo=${idPer}`);
  expect(gr.status).toBe(200);
  for (const g of (gr.data.grupos || []).slice(0, 3)) {
    const nom = await api(page, 'GET',
      `/consulta/grupo?id_periodo=${idPer}&id_materia=${g.id_materia}&id_curso=${g.id_curso || ''}&page=1&limit=10`);
    expect(nom.status).toBe(200);
    for (const e of (nom.data.datos || [])) {
      expect(String(e.id_estudiante)).toBe(String(crea.data.id_estudiante));
    }
  }
});
