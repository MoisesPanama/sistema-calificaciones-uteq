// Demo admin: estudiante + materia + matricula (idempotente:
// fijos reutilizables, cero crecimiento entre corridas).
const { test, expect } = require('@playwright/test');
const { go, login, api } = require('./helpers.cjs');

const CEDULA_DEMO = '1999999901';
const NOMBRE_MAT_DEMO = 'Demo Materia Fija';
let idEst = null;

async function estudianteDemo(page) {
  const per = await api(page, 'GET', '/periodos/');
  const idPeriodo = per.data.periodoActivo.id_periodo;
  const crea = await api(page, 'POST', '/estudiantes/', {
    cedula: CEDULA_DEMO, nombres: 'Demo Fijo', apellidos: 'Alumno Demo',
    fecha_nacimiento: '2011-06-07', id_representante: 2
  });
  if (crea.status === 201) {
    idEst = crea.data.id_estudiante;
    await api(page, 'POST', '/matriculas/', {
      id_estudiante: idEst, id_periodo: idPeriodo, id_curso: null
    });
  } else {
    const r = await api(page, 'GET', `/estudiantes/?q=${CEDULA_DEMO}`);
    idEst = r.data.datos[0].id_estudiante;
  }
  expect(idEst).toBeTruthy();
  return idEst;
}

test('1. admin crea un estudiante desde cero', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await estudianteDemo(page);
  await go(page, '/pages/estudiantes.html');
  await page.locator('#q').fill(CEDULA_DEMO);
  await page.locator('#btn-buscar').click();
  await expect(page.locator('#resultado')).toContainText('Alumno Demo', { timeout: 15000 });
});

test('2. admin crea una materia nueva', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  const mat = await api(page, 'POST', '/materias/', { nombre: NOMBRE_MAT_DEMO, descripcion: 'Materia de demostracion' });
  expect([201, 409]).toContain(mat.status);
  await go(page, '/pages/materias.html');
  await page.locator('#btn-modal').click();
  await page.locator('#nombre').fill(NOMBRE_MAT_DEMO);
  await page.locator('#descripcion').fill('Materia de demostracion');
  await page.locator('#form-mat button[type="submit"]').click();
  await expect(page.locator('#tabla')).toContainText(NOMBRE_MAT_DEMO, { timeout: 15000 });
});

test('3. admin matricula al nuevo estudiante (via aprobacion)', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  // M9 matricula ciega: sin formulario manual; el admin matricula
  // via API interna y verifica en la lista + bandeja.
  const per = await api(page, 'GET', '/periodos/');
  const idPeriodo = per.data.periodoActivo.id_periodo;
  await estudianteDemo(page);
  const r = await api(page, 'POST', '/matriculas/', {
    id_estudiante: idEst, id_periodo: idPeriodo, id_curso: null
  });
  // 201 nuevo, 409 si ya estaba (idempotente).
  expect([201, 409]).toContain(r.status);
  await go(page, '/pages/matriculas.html');
  await page.locator('#busqueda').fill(CEDULA_DEMO);
  await page.locator('#btn-buscar').click();
  await expect(page.locator('#lista')).toContainText('Alumno Demo', { timeout: 15000 });
  await expect(page.locator('#contador')).toContainText('matriculado');
  await expect(page.locator('#form-matricula')).toHaveCount(0);
});
