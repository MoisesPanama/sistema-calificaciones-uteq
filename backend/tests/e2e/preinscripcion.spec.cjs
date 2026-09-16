// Preinscripcion publica + bandeja admin (M3).
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

test('wizard publico envia solicitud sin login', async ({ page }) => {
  const tag = Date.now().toString(36);
  await page.goto('/pages/preinscripcion.html');
  await expect(page.locator('#paso-1')).toBeVisible({ timeout: 15000 });
  await page.locator('#nombres').fill('Preinscrito');
  await page.locator('#apellidos').fill('Publico ' + tag);
  await page.locator('#cedula').fill('27' + String(Date.now()).slice(-8));
  await page.locator('#fecha_nacimiento').fill('2012-06-07');
  await page.locator('#sig1').click();
  await page.locator('#rep_nombres').fill('Padre');
  await page.locator('#rep_apellidos').fill('Publico ' + tag);
  await page.locator('#rep_parentesco').selectOption('padre');
  await page.locator('#rep_documento').fill('17' + String(Date.now()).slice(-8));
  await page.locator('#sig2').click();
  await page.locator('#documento').setInputFiles({
    name: 'documento.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test evidencia M7\n')
  });
  await page.locator('#enviar').click();
  await expect(page.locator('#ok')).toContainText('revisara', { timeout: 15000 });
});

test('sin PDF la solicitud se rechaza (400)', async ({ page }) => {
  const tag = Date.now().toString(36);
  await page.goto('/pages/preinscripcion.html');
  await expect(page.locator('#paso-1')).toBeVisible({ timeout: 15000 });
  await page.locator('#nombres').fill('SinPdf');
  await page.locator('#apellidos').fill('Rechazo ' + tag);
  await page.locator('#cedula').fill('28' + String(Date.now()).slice(-8));
  await page.locator('#fecha_nacimiento').fill('2012-06-07');
  await page.locator('#sig1').click();
  await page.locator('#rep_nombres').fill('Madre');
  await page.locator('#rep_apellidos').fill('Rechazo ' + tag);
  await page.locator('#rep_parentesco').selectOption('madre');
  await page.locator('#rep_documento').fill('18' + String(Date.now()).slice(-8));
  await page.locator('#sig2').click();
  await page.locator('#enviar').click();
  await expect(page.locator('#error')).toContainText('PDF', { timeout: 15000 });
});

test('bandeja filtra por cedula', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/matriculas.html');
  await expect(page.locator('#bandeja-sol')).toBeVisible({ timeout: 15000 });
  await page.locator('#busqueda-sol').fill('0000000000');
  await page.locator('#btn-buscar-sol').click();
  await expect(page.locator('#lista-sol')).toContainText('Sin solicitudes', { timeout: 15000 });
});

test('admin aprueba desde la bandeja', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/matriculas.html');
  await expect(page.locator('#bandeja-sol')).toBeVisible({ timeout: 15000 });
  await expect.poll(async () =>
    (await page.locator('#sol-count').textContent())?.trim() || '',
    { timeout: 15000 }).not.toBe('');
  const antes = await page.locator('#sol-count').textContent();
  expect(Number(antes) >= 1).toBe(true);
  page.on('dialog', d => d.accept());
  await page.locator('[data-aprobar]').first().click();
  await expect(page.locator('#ok')).toContainText('Matricula aprobada', { timeout: 20000 });
});
