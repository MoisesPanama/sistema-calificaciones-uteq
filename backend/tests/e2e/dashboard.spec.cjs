// Dashboard por rol + combobox de representantes.
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

test('admin ve movimientos y respaldos', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/dashboard.html');
  await expect(page.locator('#metricas .card').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#bloques')).toContainText('Últimos movimientos');
  await expect(page.locator('#bloques')).toContainText('Respaldos');
});

test('profesora ve sus materias y ultimas notas', async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  await page.goto('/pages/dashboard.html');
  await expect(page.locator('#bloques')).toContainText('Mis materias', { timeout: 15000 });
  await expect(page.locator('#bloques')).toContainText('Mis últimas notas');
});

test('representante ve promedios de sus hijos', async ({ page }) => {
  await login(page, 'fernando.castillo@uteq.edu.ec');
  await page.goto('/pages/dashboard.html');
  await expect(page.locator('#bloques')).toContainText('Promedios del periodo', { timeout: 15000 });
});

test('psicologa ve rendimiento', async ({ page }) => {
  await login(page, 'maria.torres@uteq.edu.ec');
  await page.goto('/pages/dashboard.html');
  await expect(page.locator('#bloques')).toContainText('Rendimiento del periodo', { timeout: 15000 });
});

test('crear estudiante con representante nuevo inline', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/estudiante-form.html');
  const tag = Date.now().toString(36);
  await page.locator('#cedula').fill('19' + String(Date.now()).slice(-8));
  await page.locator('#nombre1').fill('PWEst' + tag);
  await page.locator('#nombre2').fill('Auto');
  await page.locator('#apellido1').fill('Prueba');
  await page.locator('#apellido2').fill('V&V');
  await page.locator('#fecha_nacimiento').fill('2011-03-04');
  // Buscar algo inexistente y crearlo inline.
  await page.locator('#rep-buscar').fill('ZZZ-sin-coincidencia-' + tag);
  await expect(page.locator('#rep-resultados')).toContainText('Sin coincidencias', { timeout: 10000 });
  await page.locator('#rep-nombre1').fill('PWRep' + tag);
  await page.locator('#rep-nombre2').fill('Auto');
  await page.locator('#rep-apellido1').fill('Prueba');
  await page.locator('#rep-apellido2').fill('V&V');
  await page.locator('#rep-telefono').fill('0990000' + String(Date.now()).slice(-3));
  await page.locator('#rep-crear').click();
  await expect(page.locator('#rep-elegido')).toContainText('Elegido:', { timeout: 10000 });
  await page.locator('#form-est button[type="submit"]').click();
  await page.waitForURL('**/estudiantes.html', { timeout: 15000 });
  // Buscarlo (con paginacion de 10 podria quedar en otra pagina).
  await page.locator('#q').fill('PWEst' + tag);
  await page.locator('#btn-buscar').click();
  await expect(page.locator('#resultado')).toContainText('PWEst' + tag, { timeout: 15000 });
  // Nota: estudiantes no tienen DELETE (se desactivan); el PWEst/PWRep
  // quedan como datos de prueba con timestamp unico. No rompen nada.
});
