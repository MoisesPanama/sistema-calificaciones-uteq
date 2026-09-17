// M11 familia: login del acudiente, sin duplicados, ficha y clave temporal.
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

function tag() {
  return Date.now().toString(36);
}

// Autocura de cupo (las corridas acumulan pendientes que ocupan lugar).
async function asegurarCupo8vo(page) {
  await login(page, 'admin@uteq.edu.ec');
  const per = await api(page, 'GET', '/periodos/');
  const idP = per.data.periodoActivo.id_periodo;
  const cur = await api(page, 'GET', `/cursos/?id_periodo=${idP}`);
  const c8 = (cur.data.cursos || [])
    .filter((c) => Number(c.nivel) === 8)
    .sort((a, b) => Number(b.disponibles) - Number(a.disponibles))[0];
  expect(c8).toBeTruthy();
  if (Number(c8.disponibles) < 2) {
    await api(page, 'PUT', `/cursos/${c8.id_curso}`, {
      nombre: c8.nombre, paralelo: c8.paralelo, nivel: 8,
      cupo_max: Number(c8.ocupados) + 5
    });
  }
  await page.context().clearCookies();
}

// Solicitud completa por UI publica (con PDF y ficha).
async function solicitar(page, sufijo, repDoc) {
  const t = tag() + sufijo;
  await page.goto('/pages/preinscripcion.html');
  await expect(page.locator('#paso-1')).toBeVisible({ timeout: 15000 });
  await page.locator('#nombres').fill('Fam');
  await page.locator('#apellidos').fill('Lia ' + t);
  const ced = '31' + String(Date.now()).slice(-8);
  await page.locator('#cedula').fill(ced);
  await page.locator('#fecha_nacimiento').fill('2013-03-04');
  await page.locator('#grupo_sanguineo').selectOption('O+');
  await page.locator('#discapacidad').fill('Ninguna');
  await page.locator('#contacto_emergencia').fill('Tia ' + t);
  await page.locator('#tel_emergencia').fill('0990000077');
  await page.locator('#sig1').click();
  await page.locator('#rep_nombres').fill('Acudiente');
  await page.locator('#rep_apellidos').fill('Fam ' + t);
  await page.locator('#rep_parentesco').selectOption('madre');
  await page.locator('#rep_documento').fill(repDoc);
  await page.locator('#rep-email').fill('fam' + t.replace(/[^a-z0-9]/gi, '') + '@example.com');
  await page.locator('#sig2').click();
  await expect(page.locator('#sel-curso option').first()).toBeAttached({ timeout: 15000 });
  const nOpts = await page.locator('#sel-curso option').count();
  expect(nOpts).toBeGreaterThanOrEqual(1);
  await page.locator('#sel-curso').selectOption({ index: 0 });
  await page.locator('#documento').setInputFiles({
    name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 m11\n')
  });
  await page.locator('#enviar').click();
  await expect(page.locator('#ok')).toContainText('revisara', { timeout: 15000 });
  return ced;
}

async function aprobarPorCedula(page, cedula) {
  const bandeja = await api(page, 'GET', `/preinscripciones/?estado=pendiente&q=${cedula}`);
  const sol = (bandeja.data.datos || [])[0];
  expect(sol).toBeTruthy();
  const r = await api(page, 'POST', `/preinscripciones/${sol.id_solicitud}/aprobar`, {});
  expect(r.status).toBe(201);
  return { sol, r: r.data };
}

test('aprobar crea login de acudiente y ficha del estudiante', async ({ page }) => {
  await asegurarCupo8vo(page);
  const t = tag();
  const repDoc = '1999999981';
  const ced = await solicitar(page, 'a', repDoc);
  await login(page, 'admin@uteq.edu.ec');
  const { sol, r } = await aprobarPorCedula(page, ced);
  // Ficha redonda: solicitud -> estudiante.
  const est = await api(page, 'GET', `/estudiantes/${r.id_estudiante}`);
  expect(est.data.grupo_sanguineo || est.data.estudiante?.grupo_sanguineo).toBe('O+');
  // Login del acudiente (nuevo o reutilizado de otra corrida).
  const repRow = (await api(page, 'GET', `/representantes/?q=${repDoc}`)).data.datos[0];
  expect(repRow?.email).toBeTruthy();
  await login(page, repRow.email);
  await page.goto('/pages/dashboard.html');
  await expect(page.locator('#bienvenida')).toBeVisible({ timeout: 15000 });
});

test('mismo documento no duplica acudiente (N hijos)', async ({ page }) => {
  await asegurarCupo8vo(page);
  const repDoc = '1999999982';
  const ced1 = await solicitar(page, 'b', repDoc);
  const ced2 = await solicitar(page, 'c', repDoc);
  await login(page, 'admin@uteq.edu.ec');
  const ap1 = await aprobarPorCedula(page, ced1);
  const ap2 = await aprobarPorCedula(page, ced2);
  const rep = await api(page, 'GET', `/representantes/?q=${repDoc}`);
  expect(rep.data.datos.length).toBe(1);
  expect(rep.data.datos[0].n_estudiantes).toBeGreaterThanOrEqual(2);
  // El login del acudiente sigue siendo uno solo.
  expect(rep.data.datos[0].email).toBeTruthy();
  await login(page, rep.data.datos[0].email);
  await expect(page).toHaveURL(/dashboard\.html/, { timeout: 15000 });
});

test('clave exige confirmacion y limpia el flag', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  const mala = await api(page, 'PUT', '/auth/password', { actual: 'UTEQ2026', nueva: 'Abc12345!', confirmacion: 'otra' });
  expect(mala.status).toBe(400);
  try {
    const ok = await api(page, 'PUT', '/auth/password', { actual: 'UTEQ2026', nueva: 'Abc12345!', confirmacion: 'Abc12345!' });
    expect(ok.status).toBe(200);
    const me = await api(page, 'GET', '/auth/me');
    expect(me.data.usuario.debe_cambiar_clave).toBe(false);
  } finally {
    // Restaura para no romper otras corridas.
    await api(page, 'PUT', '/auth/password', { actual: 'Abc12345!', nueva: 'UTEQ2026', confirmacion: 'UTEQ2026' });
  }
});

test('clave temporal redirige a cambiar-clave', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  const t = tag();
  const crea = await api(page, 'POST', '/estudiantes/', {
    cedula: '19' + String(Date.now()).slice(-8),
    nombres: 'PWTmp ' + t, apellidos: t + ' Clave',
    fecha_nacimiento: '2011-05-06', id_representante: 2
  });
  expect(crea.status).toBe(201);
  await page.context().clearCookies();
  await page.goto('/pages/login.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(crea.data.email);
  await page.locator('#password').fill('UTEQ2026');
  await page.locator('#form-login button[type="submit"]').click();
  await page.waitForURL('**/cambiar-clave.html', { timeout: 15000 });
  await page.locator('#actual').fill('UTEQ2026');
  await page.locator('#nueva').fill('Tmp12345!');
  await page.locator('#confirmacion').fill('Tmp12345!');
  await page.locator('#form-clave button[type="submit"]').click();
  await page.waitForURL('**/dashboard.html', { timeout: 15000 });
  await expect(page.locator('#aviso-clave')).toBeHidden();
});
