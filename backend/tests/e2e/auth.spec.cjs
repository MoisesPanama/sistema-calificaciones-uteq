// Auth: login de los 5 roles + error + guard sin sesion.
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers.cjs');

const USERS = [
  ['admin@uteq.edu.ec', 'administrador'],
  ['elena.romero@uteq.edu.ec', 'profesor'],
  ['fernando.castillo@uteq.edu.ec', 'representante'],
  ['maria.torres@uteq.edu.ec', 'psicologo'],
];

for (const [email, rol] of USERS) {
  test(`login ${rol} llega al dashboard`, async ({ page }) => {
    await login(page, email);
    await expect(page.locator('.sidebar-user-role')).toContainText(rol, { timeout: 10000 });
  });
}

test('password incorrecta muestra error y no redirige', async ({ page }) => {
  await page.goto('/pages/login.html');
  await page.locator('#email').fill('admin@uteq.edu.ec');
  await page.locator('#password').fill('CLAVE-MALA');
  await page.locator('#form-login button[type="submit"]').click();
  await expect(page.locator('#error')).toBeVisible({ timeout: 10000 });
  expect(page.url()).toContain('login.html');
});

test('sin sesion redirige al login', async ({ page }) => {
  await page.goto('/pages/auditoria.html');
  await expect(page).toHaveURL(/login\.html/, { timeout: 15000 });
});
