// =========================================================
// Playwright: Vias 1 (headed) y 2 (headless) del plan v2.
// Requiere API en :3000 y BD de pruebas (ver tests/README.md).
//   npx playwright test --config tests/playwright.config.cjs        (headless)
//   npx playwright test --config tests/playwright.config.cjs --headed  (visible)
// =========================================================
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1, // una sola BD compartida: sin paralelismo entre archivos
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './report' }]],
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
});
