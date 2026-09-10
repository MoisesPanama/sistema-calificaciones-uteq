// Demo admin visible: estudiante desde 0 + materia nueva + matricula.
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

const tag = Date.now().toString(36);
let idEst = null;

test('1. admin crea un estudiante desde cero', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/estudiante-form.html');
  await page.locator('#cedula').fill('20' + String(Date.now()).slice(-8));
  await page.locator('#nombre1').fill('Demo');
  await page.locator('#nombre2').fill(tag);
  await page.locator('#apellido1').fill('Alumno');
  await page.locator('#apellido2').fill('Demo' + tag);
  await page.locator('#fecha_nacimiento').fill('2011-06-07');
  await page.locator('#rep-buscar').fill('ZZZ-nadie-' + tag);
  await expect(page.locator('#rep-resultados')).toContainText('Sin coincidencias', { timeout: 10000 });
  await page.locator('#rep-nombre1').fill('DemoRep');
  await page.locator('#rep-nombre2').fill(tag);
  await page.locator('#rep-apellido1').fill('Padre');
  await page.locator('#rep-apellido2').fill('Demo' + tag);
  await page.locator('#rep-crear').click();
  await expect(page.locator('#rep-elegido')).toContainText('Elegido:', { timeout: 10000 });
  await page.locator('#form-est button[type="submit"]').click();
  await page.waitForURL('**/estudiantes.html', { timeout: 15000 });
  await page.locator('#q').fill('Demo ' + tag);
  await page.locator('#btn-buscar').click();
  await expect(page.locator('#resultado')).toContainText('Demo ' + tag, { timeout: 15000 });
  const r = await api(page, 'GET', '/estudiantes/?q=Demo%20' + tag);
  idEst = r.data.datos[0].id_estudiante;
  expect(idEst).toBeTruthy();
});

test('2. admin crea una materia nueva', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/materias.html');
  await page.locator('#btn-modal').click();
  await page.locator('#nombre').fill('DemoMat ' + tag);
  await page.locator('#descripcion').fill('Materia de demostracion');
  await page.locator('#form-mat button[type="submit"]').click();
  await expect(page.locator('#tabla')).toContainText('DemoMat ' + tag, { timeout: 15000 });
});

test('3. admin matricula al nuevo estudiante', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/matriculas.html');
  await expect(page.locator('#sel-estudiante option').nth(1)).toBeAttached({ timeout: 15000 });
  await page.locator('#sel-estudiante').selectOption(String(idEst));
  const nCursos = await page.locator('#sel-curso option').count();
  if (nCursos > 1) await page.locator('#sel-curso').selectOption({ index: 1 });
  await page.locator('#btn-matricular').click();
  await page.locator('#busqueda').fill('Demo ' + tag);
  await page.locator('#btn-buscar').click();
  await expect(page.locator('#lista')).toContainText('Demo ' + tag, { timeout: 15000 });
  await expect(page.locator('#contador')).toContainText('matriculado');
});
