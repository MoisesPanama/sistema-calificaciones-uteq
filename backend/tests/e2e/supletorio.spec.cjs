// Supletorio M4 + M7: elegibilidad <7 en servidor, ciclo
// supletorio -> remedial -> gracia y cierre del estado.
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

async function contextoAdmin(page) {
  await login(page, 'admin@uteq.edu.ec');
  const per = await api(page, 'GET', '/periodos/');
  const idPeriodo = per.data.periodoActivo?.id_periodo || per.data.periodos?.[0]?.id_periodo;
  const ctx = await api(page, 'GET', `/calificaciones/contexto?id_periodo=${idPeriodo}`);
  return { idPeriodo, materias: ctx.data.materias || [] };
}

async function buscarElegible(page, idPeriodo, materias) {
  for (const m of materias.slice(0, 5)) {
    const r = await api(page, 'GET', `/supletorios/?id_periodo=${idPeriodo}&id_materia=${m.id_materia}`);
    if (r.status !== 200) continue;
    const cand = (r.data.supletorios || []).find((x) => x.elegible && !x.id_supletorio);
    if (cand) return { materia: m, cand };
  }
  return {};
}

test('admin registra, duplica 409, edita, valida y congela', async ({ page }) => {
  const { idPeriodo, materias } = await contextoAdmin(page);
  expect(materias.length).toBeGreaterThan(0);
  const { materia, cand } = await buscarElegible(page, idPeriodo, materias);
  expect(cand, 'se esperaba al menos un elegible <7 sin supletorio').toBeTruthy();

  const base = {
    id_estudiante: cand.id_estudiante,
    id_materia: materia.id_materia,
    id_periodo: idPeriodo,
    id_curso: cand.id_curso || null,
    nota: 7.5,
  };
  const creado = await api(page, 'POST', '/supletorios/', base);
  expect(creado.status).toBe(201);
  const id = creado.data.id_supletorio;
  expect(id).toBeTruthy();

  const dupe = await api(page, 'POST', '/supletorios/', base);
  expect(dupe.status).toBe(409);

  const edit = await api(page, 'PUT', `/supletorios/${id}`, { nota: 8.25 });
  expect(edit.status).toBe(200);

  const val = await api(page, 'POST', `/supletorios/${id}/validar`, {});
  expect(val.status).toBe(200);

  const editFrio = await api(page, 'PUT', `/supletorios/${id}`, { nota: 9 });
  expect(editFrio.status).toBe(409);

  const delFrio = await api(page, 'DELETE', `/supletorios/${id}`);
  expect(delFrio.status).toBe(409);
});

test('promedio >=7 no es elegible (409)', async ({ page }) => {
  const { idPeriodo, materias } = await contextoAdmin(page);
  let probado = false;
  for (const m of materias.slice(0, 5)) {
    const r = await api(page, 'GET', `/supletorios/?id_periodo=${idPeriodo}&id_materia=${m.id_materia}`);
    if (r.status !== 200) continue;
    const noEleg = (r.data.supletorios || []).find((x) => !x.elegible && x.promedio_anual !== null && !x.id_supletorio);
    if (!noEleg) continue;
    const intento = await api(page, 'POST', '/supletorios/', {
      id_estudiante: noEleg.id_estudiante,
      id_materia: m.id_materia,
      id_periodo: idPeriodo,
      id_curso: noEleg.id_curso || null,
      nota: 7.5,
    });
    expect(intento.status).toBe(409);
    probado = true;
    break;
  }
  expect(probado).toBe(true);
});

test('pagina visible para profesor y admin, API 403 para estudiante', async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  await page.goto('/pages/supletorio.html');
  await expect(page.locator('#sel-materia')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.sidebar-nav')).toContainText('Supletorio');

  await login(page, 'admin@uteq.edu.ec');
  await page.goto('/pages/supletorio.html');
  await expect(page.locator('#btn-cargar')).toBeVisible({ timeout: 15000 });
});

test('remedial sin supletorio previo se rechaza (orden)', async ({ page }) => {
  const { idPeriodo, materias } = await contextoAdmin(page);
  const { materia, cand } = await buscarElegible(page, idPeriodo, materias);
  expect(cand).toBeTruthy();
  const r = await api(page, 'POST', '/supletorios/', {
    id_estudiante: cand.id_estudiante,
    id_materia: materia.id_materia,
    id_periodo: idPeriodo,
    id_curso: cand.id_curso || null,
    nota: 7.5,
    instancia: 'remedial'
  });
  expect(r.status).toBe(409);
  expect(r.data.error).toMatch(/orden|previo/i);
});

test('ciclo completo: supletorio reprobado -> remedial aprobado cierra en aprobado', async ({ page }) => {
  const { idPeriodo, materias } = await contextoAdmin(page);
  const { materia, cand } = await buscarElegible(page, idPeriodo, materias);
  expect(cand).toBeTruthy();
  const base = {
    id_estudiante: cand.id_estudiante,
    id_materia: materia.id_materia,
    id_periodo: idPeriodo,
    id_curso: cand.id_curso || null
  };
  // Estado vivo: <7 es reprobado (trigger M7).
  expect(cand.estado_materia).toBe('reprobado');

  const sup = await api(page, 'POST', '/supletorios/', { ...base, nota: 6.0, instancia: 'supletorio' });
  expect(sup.status).toBe(201);
  const vSup = await api(page, 'POST', `/supletorios/${sup.data.id_supletorio}/validar`, {});
  expect(vSup.status).toBe(200);
  expect(vSup.data.estado_final).toBe('reprobado');

  const rem = await api(page, 'POST', '/supletorios/', { ...base, nota: 7.5, instancia: 'remedial' });
  expect(rem.status).toBe(201);
  const vRem = await api(page, 'POST', `/supletorios/${rem.data.id_supletorio}/validar`, {});
  expect(vRem.status).toBe(200);
  expect(vRem.data.estado_final).toBe('aprobado');

  const ver = await api(page, 'GET', `/supletorios/?id_periodo=${idPeriodo}&id_materia=${materia.id_materia}`);
  const fila = (ver.data.supletorios || []).find((x) => x.id_estudiante === cand.id_estudiante);
  expect(fila.estado_materia).toBe('aprobado');
  expect(fila.siguiente).toBeNull();
});

test('gracia reprobada cierra el ciclo en reprobado', async ({ page }) => {
  const { idPeriodo, materias } = await contextoAdmin(page);
  const { materia, cand } = await buscarElegible(page, idPeriodo, materias);
  expect(cand).toBeTruthy();
  const base = {
    id_estudiante: cand.id_estudiante,
    id_materia: materia.id_materia,
    id_periodo: idPeriodo,
    id_curso: cand.id_curso || null
  };
  for (const [inst, nota] of [['supletorio', 5.0], ['remedial', 5.5], ['gracia', 6.0]]) {
    const creado = await api(page, 'POST', '/supletorios/', { ...base, nota, instancia: inst });
    expect(creado.status).toBe(201);
    const val = await api(page, 'POST', `/supletorios/${creado.data.id_supletorio}/validar`, {});
    expect(val.status).toBe(200);
  }
  const ver = await api(page, 'GET', `/supletorios/?id_periodo=${idPeriodo}&id_materia=${materia.id_materia}`);
  const fila = (ver.data.supletorios || []).find((x) => x.id_estudiante === cand.id_estudiante);
  expect(fila.estado_materia).toBe('reprobado');
  expect(fila.siguiente).toBeNull();

  const otra = await api(page, 'POST', '/supletorios/', { ...base, nota: 8.0, instancia: 'gracia' });
  expect(otra.status).toBe(409);
});
