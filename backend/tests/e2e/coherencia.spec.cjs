// M8 una sola verdad: reporte == consulta == boletin, y la
// recuperacion validada se ve en consulta/boletin.
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

async function periodoYMaterias(page) {
  await login(page, 'admin@uteq.edu.ec');
  const per = await api(page, 'GET', '/periodos/');
  const idPeriodo = per.data.periodoActivo?.id_periodo || per.data.periodos?.[0]?.id_periodo;
  const ctx = await api(page, 'GET', `/calificaciones/contexto?id_periodo=${idPeriodo}`);
  return { idPeriodo, materias: ctx.data.materias || [] };
}

test('reporte usa la misma oficial que consulta', { timeout: 180000 }, async ({ page }) => {
  const { idPeriodo, materias } = await periodoYMaterias(page);
  let comparados = 0;
  for (const m of materias.slice(0, 10)) {
    const rep = await api(page, 'GET', `/reportes/?id_periodo=${idPeriodo}&id_materia=${m.id_materia}&limit=100`);
    expect(rep.status).toBe(200);
    const conNota = (rep.data.datos || []).filter((x) => x.promedio !== null && x.promedio !== undefined).slice(0, 3);
    if (conNota.length === 0) continue;
    for (const r of conNota) {
      const con = await api(page, 'GET', `/consulta/materia/${m.id_materia}?id_estudiante=${r.id_estudiante}&id_periodo=${idPeriodo}`);
      expect(con.status).toBe(200);
      expect(Number(con.data.promedio)).toBe(Number(r.promedio));
      comparados += 1;
    }
    if (comparados >= 3) break;
  }
  expect(comparados).toBeGreaterThanOrEqual(3);
});

test('recuperacion validada visible en consulta y boletin', { timeout: 180000 }, async ({ page }) => {
  const { idPeriodo, materias } = await periodoYMaterias(page);
  // Crea su propio validado (determinista, no depende de otros tests):
  // busca un elegible <7 sin supletorio en las primeras materias.
  let hallado = null;
  for (const m of materias.slice(0, 6)) {
    const r = await api(page, 'GET', `/supletorios/?id_periodo=${idPeriodo}&id_materia=${m.id_materia}`);
    if (r.status !== 200) continue;
    const cand = (r.data.supletorios || []).find((x) => x.elegible && !x.id_supletorio);
    if (!cand) continue;
    const creado = await api(page, 'POST', '/supletorios/', {
      id_estudiante: cand.id_estudiante, id_materia: m.id_materia,
      id_periodo: idPeriodo, id_curso: cand.id_curso || null,
      nota: 8.0, instancia: 'supletorio'
    });
    if (creado.status !== 201) continue;
    const val = await api(page, 'POST', `/supletorios/${creado.data.id_supletorio}/validar`, {});
    expect(val.status).toBe(200);
    hallado = { materia: m, fila: cand, instancia: 'supletorio', nota: 8.0 };
    break;
  }
  expect(hallado, 'se esperaba al menos un elegible <7 sin supletorio').toBeTruthy();

  const det = await api(page, 'GET', `/consulta/materia/${hallado.materia.id_materia}?id_estudiante=${hallado.fila.id_estudiante}&id_periodo=${idPeriodo}`);
  expect(det.status).toBe(200);
  expect(det.data.recuperacion).toBeTruthy();
  expect(det.data.recuperacion.instancia).toBe(hallado.instancia);
  expect(det.data.estado_final).toMatch(/aprobado|reprobado/);

  const gen = await api(page, 'GET', `/consulta/?id_periodo=${idPeriodo}&id_estudiante=${hallado.fila.id_estudiante}`);
  expect(gen.status).toBe(200);
  const mat = (gen.data.materias || []).find((x) => String(x.id_materia) === String(hallado.materia.id_materia));
  expect(mat.recuperacion).toBeTruthy();
  expect(mat.estado_final).toBe(det.data.estado_final);

  // Boletin UI: la fila trae la pill de recuperacion.
  await page.goto('/pages/boletin.html');
  await expect(page.locator('#sel-est option').nth(1)).toBeAttached({ timeout: 15000 });
  await page.locator('#sel-est').selectOption(String(hallado.fila.id_estudiante));
  await page.locator('#btn-ver').click();
  await expect(page.locator('#boletin table')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#boletin')).toContainText(hallado.instancia, { timeout: 10000 });
});

test('cambio de clave propia y rechazo con actual mala', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  const c1 = await api(page, 'PUT', '/auth/password', { actual: 'UTEQ2026', nueva: 'Tmp9876!' });
  expect(c1.status).toBe(200);
  try {
    await login(page, 'admin@uteq.edu.ec', 'Tmp9876!');
    const bad = await api(page, 'PUT', '/auth/password', { actual: 'clave-mala', nueva: 'Xyz1234!' });
    expect(bad.status).toBe(401);
    const corta = await api(page, 'PUT', '/auth/password', { actual: 'Tmp9876!', nueva: 'abc' });
    expect(corta.status).toBe(400);
  } finally {
    const back = await api(page, 'PUT', '/auth/password', { actual: 'Tmp9876!', nueva: 'UTEQ2026' });
    expect(back.status).toBe(200);
  }
  await login(page, 'admin@uteq.edu.ec');
});
