// Preinscripcion publica + bandeja admin (M3 + M9 cupos).
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

// Autocura: garantiza un 8vo con cupo (las corridas acumulan
// pendientes que ocupan lugar) y devuelve su id_curso.
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
    const r = await api(page, 'PUT', `/cursos/${c8.id_curso}`, {
      nombre: c8.nombre, paralelo: c8.paralelo, nivel: 8,
      cupo_max: Number(c8.ocupados) + 5
    });
    expect(r.status).toBe(200);
  }
  return c8.id_curso;
}

test('wizard publico envia solicitud sin login', async ({ page }) => {
  const tag = Date.now().toString(36);
  const idCurso = await asegurarCupo8vo(page);
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
  // Curso obligatorio: 8vo con cupo asegurado.
  await expect(page.locator(`#sel-curso option[value="${idCurso}"]`)).toBeAttached({ timeout: 15000 });
  await page.locator('#sel-curso').selectOption(String(idCurso));
  await expect(page.locator('#aviso-tipo')).toContainText('nueva', { timeout: 10000 });
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
  const idCurso = await asegurarCupo8vo(page);
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
  await expect(page.locator(`#sel-curso option[value="${idCurso}"]`)).toBeAttached({ timeout: 15000 });
  await page.locator('#sel-curso').selectOption(String(idCurso));
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
