// Header de periodo global (fix shadowing cargarPeriodos): recorre
// TODAS las paginas con login, como admin y estudiante, y exige
// que #periodoNombre jamas quede en "Cargando".
const { test, expect } = require('@playwright/test');
const { login } = require('./helpers.cjs');

const PAGINAS = [
  'auditoria.html', 'boletin.html', 'calificaciones.html', 'catalogos.html',
  'consulta.html', 'dashboard.html', 'estudiante-form.html', 'estudiantes.html',
  'materias.html', 'matriculas.html', 'mi-matricula.html', 'mis-cursos.html',
  'periodos.html', 'planilla.html', 'psicologo.html', 'reportes.html',
  'respaldos.html', 'supletorio.html'
];

for (const email of ['admin@uteq.edu.ec', 'alumno@uteq.edu.ec']) {
  test(`header periodo en todas (${email})`, { timeout: 240000 }, async ({ page }) => {
    await login(page, email);
    for (const p of PAGINAS) {
      await page.goto('/pages/' + p, { waitUntil: 'domcontentloaded' });
      const nombre = page.locator('#periodoNombre');
      await expect(nombre, p).not.toContainText('Cargando', { timeout: 15000 });
      expect(((await nombre.textContent()) || '').trim().length, p).toBeGreaterThan(0);
    }
  });
}
