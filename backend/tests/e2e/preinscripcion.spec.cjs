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
  await page.locator('#sig2').click();
  await page.locator('#enviar').click();
  await expect(page.locator('#ok')).toContainText('revisara', { timeout: 15000 });
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
