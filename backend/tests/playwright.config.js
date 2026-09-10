// =========================================================
// Playwright: Vias 1 (headed) y 2 (headless) del plan v2.
// Requiere API en :3000 y BD de pruebas (ver tests/README.md).
//   npx playwright test --config tests/playwright.config.js        (headless)
//   npx playwright test --config tests/playwright.config.js --headed  (visible)
// =========================================================
const path = require('path');
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1, // una sola BD compartida: sin paralelismo entre archivos
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './report' }]],
  // Lanza la API (backend) sola al correr desde VSCode o CLI; si ya
  // esta corriendo en :3000 la reusa. El frontend es servido por la propia
  // API (backend/app.js), asi que no hace falta un servidor extra.
  webServer: {
    command: 'node app.js',
    cwd: path.join(__dirname, '..'),
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: true,
    timeout: 120000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
});
