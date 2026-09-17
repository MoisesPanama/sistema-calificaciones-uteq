// Rol estudiante: solo sus notas, sin reportes.
const { test, expect } = require('@playwright/test');
const { go, login, api } = require('./helpers.cjs');

let tag = '';

// Estudiante fijo reutilizable (cero crecimiento): 409 -> se busca.
async function estudianteFijo(page, cedula, nombres, apellidos, emailEsperado) {
  const crea = await api(page, 'POST', '/estudiantes/', {
    cedula, nombres, apellidos,
    fecha_nacimiento: '2011-05-06', id_representante: 2
  });
  let idEst = crea.data.id_estudiante;
  let email = crea.data.email;
  if (crea.status !== 201) {
    const r = await api(page, 'GET', `/estudiantes/?q=${cedula}`);
    idEst = r.data.datos[0].id_estudiante;
    email = emailEsperado;
  }
  const per = await api(page, 'GET', '/periodos/');
  await api(page, 'POST', '/matriculas/', {
    id_estudiante: idEst, id_periodo: per.data.periodoActivo.id_periodo, id_curso: null
  });
  return { idEst, email };
}

test.beforeEach(async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  // Crear estudiante con usuario propio (email generado, clave UTEQ2026).
  tag = Date.now().toString(36);
  const { email } = await estudianteFijo(page, '1999999902', 'Pewe Fijo', 'Uno Prueba', 'punop@uteq.edu.ec');
  await login(page, email);
});

test('sidebar sin Reportes', async ({ page }) => {
  await go(page, '/pages/dashboard.html');
  await expect(page.locator('.sidebar-nav')).toContainText('Consultar Notas', { timeout: 15000 });
  await expect(page.locator('.sidebar-nav')).not.toContainText('Reportes');
});

test('consulta muestra lo propio sin elegir a nadie', async ({ page }) => {
  await go(page, '/pages/consulta.html');
  await expect(page.locator('#vista-detalle')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#vista-bloques')).toBeHidden();
});

test('sin notas ve tarjetas Sin calificar, no error', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  const { email } = await estudianteFijo(page, '1999999903', 'Pewe Fijo', 'Vacio Nulo', 'pvacion@uteq.edu.ec');
  await login(page, email);
  await go(page, '/pages/consulta.html');
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
  const propio = await api(page, 'GET', '/estudiantes/?q=1999999902');
  expect(propio.data.datos.length).toBe(1);
  expect(String(espia.data.idEstudiante)).toBe(String(propio.data.datos[0].id_estudiante));
});

test('sin botones de regreso a bloques/nomina', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  const { idEst, email } = await estudianteFijo(page, '1999999905', 'Pewe Fijo', 'Vuelta Giro', 'pvueltag@uteq.edu.ec');
  await login(page, email);
  await go(page, '/pages/consulta.html');
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
      expect(String(e.id_estudiante)).toBe(String(idEst));
    }
  }
});
