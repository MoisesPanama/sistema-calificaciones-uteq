// =========================================================
// e2e_test.js — test end-to-end de la API (sin navegador).
// Uso (backend corriendo en :3000, BD con seeds):
//   npm test
// Cubre Fases 1-7 del plan v2: auth por rol, calificaciones
// con parcial/ciclo, auditoria (detalle+resumen), paginacion,
// CRUD de catalogos con reglas 409/400 y respaldos con log.
// Limpia lo que crea (cursos/ciclos/parciales/tipos E2E-*).
// Las notas de prueba quedan (son el punto del seed 11).
// =========================================================
const http = require('http');

const cookies = {};

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    const opts = {
      hostname: 'localhost', port: 3000, path: '/api' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookieStr ? { 'Cookie': cookieStr } : {})
      }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        const sc = res.headers['set-cookie'];
        if (sc) {
          sc.forEach(c => {
            const m = c.match(/^([^=]+)=([^;]+)/);
            if (m) cookies[m[1]] = m[2];
          });
        }
        let json; try { json = JSON.parse(buf); } catch { json = buf; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const get = (path) => makeRequest('GET', path);
const post = (path, body) => makeRequest('POST', path, body);
const put = (path, body) => makeRequest('PUT', path, body);
const del = (path) => makeRequest('DELETE', path);
const loginAs = async (email) => {
  for (const k of Object.keys(cookies)) delete cookies[k];
  return post('/auth/login', { email, password: 'UTEQ2026' });
};

(async () => {
  const results = [];
  const log = (test, ok, detail) => { results.push({ test, ok }); console.log(ok ? '  OK' : '  FAIL', test, detail || ''); };
  const stamp = Date.now().toString(36);

  console.log('\n=== 1. LOGIN (5 roles) ===');
  const users = [
    { email: 'admin@uteq.edu.ec', role: 'administrador' },
    { email: 'elena.romero@uteq.edu.ec', role: 'profesor' },
    { email: 'andres.torres@uteq.edu.ec', role: 'profesor' },
    { email: 'fernando.castillo@uteq.edu.ec', role: 'representante' },
    { email: 'maria.torres@uteq.edu.ec', role: 'psicologo' },
  ];
  for (const u of users) {
    const r = await loginAs(u.email);
    log(`Login ${u.role}`, r.status === 200 && r.body.usuario && r.body.usuario.nombre_rol === u.role,
      r.status === 200 ? '' : JSON.stringify(r.body));
  }

  console.log('\n=== 2. DESCUBRIR IDS (sin hardcodear) ===');
  await loginAs('admin@uteq.edu.ec');
  const per = await get('/periodos/');
  const idPeriodo = per.body.periodoActivo?.id_periodo || per.body.periodos?.[0]?.id_periodo;
  log('Periodo activo', !!idPeriodo, `id=${idPeriodo}`);
  const ciclos = await get(`/catalogos/ciclos?id_periodo=${idPeriodo}`);
  const ciclo = (ciclos.body.ciclos || [])[0];
  log('Hay ciclos', !!ciclo, ciclo ? ciclo.nombre : 'sin ciclos');
  let parcial = null;
  if (ciclo) {
    const pars = await get(`/catalogos/parciales?id_ciclo=${ciclo.id_ciclo}`);
    parcial = (pars.body.parciales || [])[0];
    log('Hay parciales', !!parcial, parcial ? parcial.nombre : 'sin parciales');
  }

  console.log('\n=== 3. CALIFICACIONES CON PARCIAL/CICLO (Elena) ===');
  await loginAs('elena.romero@uteq.edu.ec');
  const ctx0 = await get(`/calificaciones/contexto?id_periodo=${idPeriodo}`);
  const materia = (ctx0.body.materias || [])[0];
  // Sin id_materia el contexto devuelve estudiantes=[] por diseno;
  // se pide de nuevo con la materia para obtener estudiantes y tipos.
  const ctx = materia
    ? await get(`/calificaciones/contexto?id_periodo=${idPeriodo}&id_materia=${materia.id_materia}`)
    : ctx0;
  const estudiante = (ctx.body.estudiantes || [])[0];
  const tipo = (ctx.body.tiposEvaluacion || [])[0];
  log('Contexto usable', !!(materia && estudiante && tipo),
    `mat=${materia?.id_materia} est=${estudiante?.id_estudiante} tipo=${tipo?.id_tipo_evaluacion}`);
  if (materia && estudiante && tipo) {
    const save = await post('/calificaciones/lote', {
      id_periodo: String(idPeriodo), id_materia: materia.id_materia,
      id_parcial: parcial ? parcial.id_parcial : null,
      id_ciclo: ciclo ? ciclo.id_ciclo : null,
      notas: { [estudiante.id_estudiante]: { [tipo.id_tipo_evaluacion]: '8.50' } }
    });
    log('Lote con parcial/ciclo', save.status === 200 && save.body.ok, save.body.mensaje || save.body.error);
    const bad = await post('/calificaciones/lote', {
      id_periodo: String(idPeriodo), id_materia: materia.id_materia,
      id_parcial: 999999,
      notas: { [estudiante.id_estudiante]: { [tipo.id_tipo_evaluacion]: '8.50' } }
    });
    log('Parcial invalido -> 400', bad.status === 400, bad.body.error || '');
  }

  console.log('\n=== 4. AUDITORIA DETALLE + RESUMEN ===');
  await loginAs('admin@uteq.edu.ec');
  const audit = await get('/auditoria/?page=1&limit=5&tabla=calificaciones');
  log('Audit query', audit.status === 200 && Array.isArray(audit.body.datos), `total=${audit.body.paginacion?.total}`);
  const recentInsert = audit.body.datos?.find(r => r.operacion === 'INSERT' && r.tabla_afectada === 'calificaciones');
  if (recentInsert) {
    log('Audit has user', !!recentInsert.id_usuario_app, `id_usuario_app=${recentInsert.id_usuario_app}`);
  }
  const resumen = await get('/auditoria/resumen');
  log('Resumen por categorias', resumen.status === 200 && Array.isArray(resumen.body.resumen) && resumen.body.resumen.length > 0,
    `${resumen.body.resumen?.length || 0} bloques`);
  const hoy = new Date().toISOString().slice(0, 10);
  const porFecha = await get(`/auditoria/?page=1&limit=5&desde=${hoy}&hasta=${hoy}`);
  log('Filtro por fecha', porFecha.status === 200 && Array.isArray(porFecha.body.datos), '');
  const porCat = await get('/auditoria/?page=1&limit=5&categoria=calificaciones');
  log('Filtro por categoria', porCat.status === 200 && Array.isArray(porCat.body.datos), '');
  const malaCat = await get('/auditoria/?categoria=noexiste');
  log('Categoria invalida -> 400', malaCat.status === 400, '');
  const elenaLogin = await loginAs('elena.romero@uteq.edu.ec');
  void elenaLogin;
  const elenaAudit = await get('/auditoria/');
  log('Elena blocked from audit', elenaAudit.status === 403);

  console.log('\n=== 5. PAGINACION UNICA (10 por pagina) ===');
  await loginAs('admin@uteq.edu.ec');
  const est = await get('/estudiantes/?page=1&limit=5');
  log('Estudiantes {datos,paginacion}', est.status === 200 && Array.isArray(est.body.datos) && !!est.body.paginacion,
    `total=${est.body.paginacion?.total}`);
  const estDefault = await get('/estudiantes/');
  log('Estudiantes default limit=10', estDefault.status === 200 && estDefault.body.paginacion?.limit === 10,
    `limit=${estDefault.body.paginacion?.limit}`);
  const rep = await get(`/reportes/?id_periodo=${idPeriodo}&page=1&limit=10`);
  log('Reportes {datos,paginacion}', rep.status === 200 && Array.isArray(rep.body.datos),
    rep.body.mensajeSinDatos || `total=${rep.body.paginacion?.total}`);
  await loginAs('maria.torres@uteq.edu.ec');
  const psi = await get('/psicologo/rendimiento?page=1&limit=5');
  log('Psicologo paginado + resumen', psi.status === 200 && Array.isArray(psi.body.datos)
    && psi.body.datos.length <= 5 && !!psi.body.resumen && Array.isArray(psi.body.alertas),
    `total=${psi.body.paginacion?.total} alertas=${psi.body.alertas?.length}`);

  console.log('\n=== 6. CRUD CATALOGOS + REGLAS ===');
  await loginAs('admin@uteq.edu.ec');
  const listaCiclos = await get(`/ciclos/?id_periodo=${idPeriodo}`);
  const ordenCicloLibre = 1 + Math.max(0, ...((listaCiclos.body.ciclos || []).map(c => c.orden)));
  const nombreCurso = `E2E-Curso-${stamp}`;
  const creaCurso = await post('/cursos/', { nombre: nombreCurso, paralelo: 'A', id_periodo: idPeriodo });
  log('Crear curso', creaCurso.status === 201 && !!creaCurso.body.id_curso, creaCurso.body.error || '');
  const idCurso = creaCurso.body.id_curso;
  const dupCurso = await post('/cursos/', { nombre: nombreCurso, paralelo: 'A', id_periodo: idPeriodo });
  log('Curso duplicado -> 409', dupCurso.status === 409, '');
  if (idCurso) {
    const editaCurso = await put(`/cursos/${idCurso}`, { nombre: nombreCurso, paralelo: 'B' });
    log('Editar curso', editaCurso.status === 200, editaCurso.body.error || '');
    const borraCurso = await del(`/cursos/${idCurso}`);
    log('Borrar curso sin uso', borraCurso.status === 200, borraCurso.body.error || '');
  }
  const creaCiclo = await post('/ciclos/', { nombre: `E2E-Ciclo-${stamp}`, tipo: 'bimestre', orden: ordenCicloLibre, peso: 0.05, peso_formativa: 0.7, peso_sumativa: 0.3, id_periodo: idPeriodo });
  log('Crear ciclo (+pesos)', creaCiclo.status === 201, creaCiclo.body.error || JSON.stringify(creaCiclo.body));
  if (creaCiclo.body.advertencia) console.log('  INFO advertencia suma pesos:', creaCiclo.body.advertencia);
  const idCiclo = creaCiclo.body.id_ciclo;
  const malPeso = await post('/ciclos/', { nombre: `E2E-Mal-${stamp}`, orden: 98, peso: 0.05, peso_formativa: 0.5, peso_sumativa: 0.4, id_periodo: idPeriodo });
  log('Pesos que no suman 1 -> 400', malPeso.status === 400, '');
  let idParcial = null;
  if (idCiclo) {
    const creaPar = await post('/parciales/', { nombre: 'E2E-Parcial', orden: 1, id_ciclo: idCiclo });
    log('Crear parcial', creaPar.status === 201, creaPar.body.error || '');
    idParcial = creaPar.body.id_parcial;
    if (idParcial) {
      const borraPar = await del(`/parciales/${idParcial}`);
      log('Borrar parcial sin notas', borraPar.status === 200, borraPar.body.error || '');
    }
    const borraCiclo = await del(`/ciclos/${idCiclo}`);
    log('Borrar ciclo sin notas', borraCiclo.status === 200, borraCiclo.body.error || '');
  }
  const creaTipo = await post('/tipos/', { nombre: `E2E-Tipo-${stamp}`, peso: 1, categoria: 'formativa' });
  log('Crear tipo', creaTipo.status === 201, creaTipo.body.error || '');
  if (creaTipo.body.id_tipo_evaluacion) {
    const borraTipo = await del(`/tipos/${creaTipo.body.id_tipo_evaluacion}`);
    log('Borrar tipo sin notas', borraTipo.status === 200, borraTipo.body.error || '');
  }
  if (tipo) {
    const tipoConNotas = await del(`/tipos/${tipo.id_tipo_evaluacion}`);
    log('Borrar tipo CON notas -> 409', tipoConNotas.status === 409, '');
  }

  console.log('\n=== 7. DESGLOSE POR MATERIA ===');
  if (materia && estudiante) {
    const desg = await get(`/consulta/materia/${materia.id_materia}?id_estudiante=${estudiante.id_estudiante}&id_periodo=${idPeriodo}`);
    log('Desglose materia', desg.status === 200 && Array.isArray(desg.body.ciclos),
      `ciclos=${desg.body.ciclos?.length} minimo=${desg.body.minimo_insumos}`);
  }

  console.log('\n=== 8. RESPALDOS + LOG ===');
  await loginAs('admin@uteq.edu.ec');
  const manual = await post('/respaldos/manual', {});
  log('Respaldo manual', manual.status === 200 && manual.body.ok, manual.body.respaldo?.nombre || manual.body.error);
  const hist = await get('/respaldos/historial?page=1&limit=5');
  log('Historial paginado', hist.status === 200 && Array.isArray(hist.body.datos) && hist.body.datos.length > 0,
    `${hist.body.datos?.length || 0} filas`);

  console.log('\n=== 9. ACCESS CONTROL ===');
  await loginAs('elena.romero@uteq.edu.ec');
  const elenaRespaldos = await get('/respaldos/');
  log('Elena blocked from respaldos', elenaRespaldos.status === 403);
  await loginAs('fernando.castillo@uteq.edu.ec');
  const fernandoConsulta = await get('/consulta/');
  log('Fernando (representante) can see consulta', fernandoConsulta.status === 200);
  const fernandoCatalogos = await post('/cursos/', { nombre: 'X', id_periodo: idPeriodo });
  log('Representante blocked from cursos POST', fernandoCatalogos.status === 403);

  // --- Summary ---
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n=== RESULTS: ${passed}/${results.length} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log('FAILURES:');
    results.filter(r => !r.ok).forEach(r => console.log(`  - ${r.test}`));
  }
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
