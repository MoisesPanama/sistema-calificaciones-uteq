// M9 matricula ciega: sin creacion manual, cupos, ventana,
// rematricula por nivel y Mi matricula.
const { test, expect } = require('@playwright/test');
const { login, api } = require('./helpers.cjs');

// POST publico (multipart) sin login, via page.evaluate.
async function postSolicitud(page, campos, conPdf = true) {
  return page.evaluate(async ({ campos, conPdf }) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.append(k, v);
    if (conPdf) fd.append('documento', new File(['%PDF-1.4 m9'], 'doc.pdf', { type: 'application/pdf' }));
    const r = await fetch('/api/preinscripciones', { method: 'POST', body: fd });
    let data = {};
    try { data = await r.json(); } catch { /* vacio */ }
    return { status: r.status, data };
  }, { campos, conPdf });
}

function nuevaCedula(prefijo) {
  return prefijo + String(Date.now()).slice(-8);
}

test('creacion manual solo admin (profesor 403)', async ({ page }) => {
  await login(page, 'elena.romero@uteq.edu.ec');
  const e = await api(page, 'POST', '/estudiantes/', {
    cedula: nuevaCedula('19'), nombres: 'Manual', apellidos: 'Bloqueado Uno',
    fecha_nacimiento: '2011-05-06', id_representante: 1
  });
  expect(e.status).toBe(403);
  const r = await api(page, 'POST', '/representantes/', {
    nombres: 'Manual', apellidos: 'Bloqueado Dos', telefono: '0990000099'
  });
  expect(r.status).toBe(403);
  const m = await api(page, 'POST', '/matriculas/', { id_estudiante: 1, id_periodo: 1, id_curso: null });
  expect(m.status).toBe(403);
});

test('sin cupo se rechaza (409) y se libera al ampliar', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  const per = await api(page, 'GET', '/periodos/');
  const idPeriodo = per.data.periodoActivo.id_periodo;
  const cur = await api(page, 'GET', `/cursos/?id_periodo=${idPeriodo}`);
  const objetivo = (cur.data.cursos || []).find((c) => Number(c.disponibles) > 0);
  expect(objetivo, 'se esperaba un curso con cupo').toBeTruthy();
  const cupoOriginal = Number(objetivo.cupo_max);
  // Cierra el cupo exacto a la ocupacion actual.
  const cierra = await api(page, 'PUT', `/cursos/${objetivo.id_curso}`, {
    nombre: objetivo.nombre, paralelo: objetivo.paralelo,
    nivel: objetivo.nivel, cupo_max: Number(objetivo.ocupados)
  });
  expect(cierra.status).toBe(200);
  try {
    const sol = await postSolicitud(page, {
      nombres: 'SinCupo', apellidos: 'Lleno Uno', cedula: nuevaCedula('29'),
      fecha_nacimiento: '2012-04-05', rep_nombres: 'Padre', rep_apellidos: 'Lleno Uno',
      rep_parentesco: 'padre', rep_documento: nuevaCedula('17'),
      id_periodo: String(idPeriodo), id_curso: String(objetivo.id_curso)
    });
    expect(sol.status).toBe(409);
    expect(sol.data.error).toMatch(/cupo/i);
  } finally {
    await api(page, 'PUT', `/cursos/${objetivo.id_curso}`, {
      nombre: objetivo.nombre, paralelo: objetivo.paralelo,
      nivel: objetivo.nivel, cupo_max: cupoOriginal
    });
  }
});

test('fuera de ventana se bloquea (403) y dentro pasa', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  const per = await api(page, 'GET', '/periodos/');
  // Ojo: periodoActivo trae solo id+nombre; la ficha completa esta en periodos.
  const p = (per.data.periodos || []).find((x) => x.id_periodo === per.data.periodoActivo?.id_periodo)
    || per.data.periodoActivo;
  // Autocura de cupo (las corridas acumulan pendientes).
  const curV = await api(page, 'GET', `/cursos/?id_periodo=${p.id_periodo}`);
  const c8v = (curV.data.cursos || []).filter((c) => Number(c.nivel) === 8)
    .sort((a, b) => Number(b.disponibles) - Number(a.disponibles))[0];
  if (c8v && Number(c8v.disponibles) < 2) {
    await api(page, 'PUT', `/cursos/${c8v.id_curso}`, {
      nombre: c8v.nombre, paralelo: c8v.paralelo, nivel: 8, cupo_max: Number(c8v.ocupados) + 5
    });
  }
  const opt0 = await api(page, 'GET', `/preinscripciones/opciones?id_periodo=${p.id_periodo}`);
  const curso = (opt0.data.elegibles || [])[0];
  expect(curso).toBeTruthy();
  // Cierra la ventana (ayer).
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await api(page, 'POST', `/periodos/${p.id_periodo}/editar`, {
    nombre: p.nombre, fecha_inicio: String(p.fecha_inicio).slice(0, 10),
    fecha_fin: String(p.fecha_fin).slice(0, 10),
    matricula_desde: ayer, matricula_hasta: ayer
  });
  try {
    const cerrada = await postSolicitud(page, {
      nombres: 'Ventana', apellidos: 'Cerrada Uno', cedula: nuevaCedula('29'),
      fecha_nacimiento: '2012-04-05', rep_nombres: 'Padre', rep_apellidos: 'Cerrada Uno',
      rep_parentesco: 'madre', rep_documento: nuevaCedula('18'),
      id_periodo: String(p.id_periodo), id_curso: String(curso.id_curso)
    });
    expect(cerrada.status).toBe(403);
    expect(cerrada.data.error).toMatch(/cerrado/i);
  } finally {
    const futuro = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    await api(page, 'POST', `/periodos/${p.id_periodo}/editar`, {
      nombre: p.nombre, fecha_inicio: String(p.fecha_inicio).slice(0, 10),
      fecha_fin: String(p.fecha_fin).slice(0, 10),
      matricula_desde: ayer, matricula_hasta: futuro
    });
  }
  const abierta = await postSolicitud(page, {
    nombres: 'Ventana', apellidos: 'Abierta Dos', cedula: nuevaCedula('29'),
    fecha_nacimiento: '2012-04-05', rep_nombres: 'Padre', rep_apellidos: 'Abierta Dos',
    rep_parentesco: 'madre', rep_documento: nuevaCedula('18'),
    id_periodo: String(p.id_periodo), id_curso: String(curso.id_curso)
  });
  expect(abierta.status).toBe(201);
});

test('rematricula en periodo nuevo respeta nivel y aprueba', async ({ page }) => {
  await login(page, 'admin@uteq.edu.ec');
  // Sandbox fijo reutilizable (cero crecimiento entre corridas).
  const NOMBRE_P2 = 'E2E Sandbox Next';
  let idP2 = null;
  const np = await api(page, 'POST', '/periodos/', {
    nombre: NOMBRE_P2, fecha_inicio: '2027-09-01', fecha_fin: '2028-07-31'
  });
  if (np.status === 201) {
    idP2 = np.data.id_periodo;
  } else {
    const per = await api(page, 'GET', '/periodos/');
    idP2 = (per.data.periodos || []).find((p) => p.nombre === NOMBRE_P2)?.id_periodo;
  }
  expect(idP2).toBeTruthy();
  for (const [nom, par, niv] of [['Octavo EGB', 'SBX', 8], ['Noveno EGB', 'SBX', 9]]) {
    const nc = await api(page, 'POST', '/cursos/', {
      nombre: nom, paralelo: par, id_periodo: idP2, nivel: niv, cupo_max: 5
    });
    // 201 nuevo, 409 si ya existe de otra corrida (se reutiliza).
    if (nc.status !== 201 && nc.status !== 409) expect(nc.status).toBe(201);
  }
  // Cedula existente del seed: es rematricula (solo lectura).
  const cedulaExistente = '1000000002';
  const optR = await api(page, 'GET', `/preinscripciones/opciones?id_periodo=${idP2}&cedula=${cedulaExistente}`);
  expect(optR.data.tipo).toBe('rematricula');
  expect(optR.data.elegibles.length).toBeGreaterThanOrEqual(1);
  // Flujo completo con un candidato del pool (el primero libre;
  // la matricula se borra al final, la solicitud aprobada queda
  // como historial invisible en bandeja).
  const lista = await api(page, 'GET', '/estudiantes/?page=1&limit=100');
  let hecho = null;
  for (const cand of (lista.data.datos || []).slice(0, 30)) {
    const op = await api(page, 'GET', `/preinscripciones/opciones?id_periodo=${idP2}&cedula=${cand.cedula}`);
    const dest = (op.data.elegibles || [])[0];
    if (!dest) continue;
    const sol = await postSolicitud(page, {
      nombres: 'Remat', apellidos: 'ricula Uno', cedula: cand.cedula,
      fecha_nacimiento: '2012-04-05', rep_nombres: 'Padre', rep_apellidos: 'Remat Uno',
      rep_parentesco: 'padre', rep_documento: nuevaCedula('17'),
      id_periodo: String(idP2), id_curso: String(dest.id_curso)
    });
    if (sol.status !== 201) continue;
    expect(sol.data.tipo).toBe('rematricula');
    const apr = await api(page, 'POST', `/preinscripciones/${sol.data.id_solicitud}/aprobar`, {});
    if (apr.status === 201 && /Rematricula/.test(apr.data.mensaje || '')) {
      hecho = { est: cand.id_estudiante };
      break;
    }
  }
  expect(hecho, 'ningun candidato libre para rematricula (reseed si se agota)').toBeTruthy();
  try {
    expect(hecho).toBeTruthy();
  } finally {
    const lm = await api(page, 'GET', `/matriculas/?id_periodo=${idP2}&limit=100`);
    for (const m of (lm.data.datos || [])) {
      await api(page, 'DELETE', `/matriculas/${m.id_matricula}`);
    }
  }
});

test('mi matricula: estudiante la ve; resto 403', async ({ page }) => {
  await login(page, 'alumno@uteq.edu.ec');
  await page.goto('/pages/mi-matricula.html');
  await expect(page.locator('#lista table')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.sidebar-nav')).toContainText('Mi matrícula');
  await login(page, 'admin@uteq.edu.ec');
  const r = await api(page, 'GET', '/matriculas/mia');
  expect(r.status).toBe(403);
  await login(page, 'fernando.castillo@uteq.edu.ec');
  const r2 = await api(page, 'GET', '/matriculas/mia');
  expect(r2.status).toBe(403);
});
