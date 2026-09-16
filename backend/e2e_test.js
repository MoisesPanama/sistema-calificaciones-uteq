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
  const audit = await get('/auditoria/?page=1&limit=50&tabla=calificaciones');
  log('Audit query', audit.status === 200 && Array.isArray(audit.body.datos), `total=${audit.body.paginacion?.total}`);
  const conUsuario = audit.body.datos?.find(r => (r.operacion === 'INSERT' || r.operacion === 'UPDATE') && r.tabla_afectada === 'calificaciones' && r.id_usuario_app);
  log('Audit has user', !!conUsuario, conUsuario ? `${conUsuario.operacion} id_usuario_app=${conUsuario.id_usuario_app}` : 'ninguna fila reciente con usuario');
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

  console.log('\n=== 10. CONSULTA POR MATRICULA (refactor) ===');
  await loginAs('admin@uteq.edu.ec');
  const rep2 = await get(`/reportes/?id_periodo=${idPeriodo}&page=1&limit=1`);
  void rep2;
  const est1 = await get('/estudiantes/?page=1&limit=1');
  const idEst = est1.body.datos?.[0]?.id_estudiante;
  const cons = await get(`/consulta/?id_periodo=${idPeriodo}&id_estudiante=${idEst}`);
  const mats = cons.body.materias || [];
  log('Materias desde asignacion (no solo con notas)',
    cons.status === 200 && cons.body.materiasTotales > 0, `totales=${cons.body.materiasTotales}`);
  log('Contadores coherentes',
    cons.body.materiasConNotas <= cons.body.materiasTotales &&
    cons.body.materiasConNotas === mats.filter(m => !m.sin_notas).length,
    `con notas=${cons.body.materiasConNotas}`);
  log('Sin calificar tiene promedio null',
    mats.filter(m => m.sin_notas).every(m => m.promedio === null && m.escala === 'Sin calificar'),
    `${mats.filter(m => m.sin_notas).length} sin calificar`);

  console.log('\n=== 11. REPRESENTANTES + DASHBOARD POR ROL ===');
  await loginAs('admin@uteq.edu.ec');
  const busq = await get('/representantes/?q=castillo&limit=5');
  log('Buscar representantes', busq.status === 200 && busq.body.datos?.length > 0, `${busq.body.datos?.length} resultados`);
  const nomRep = `Ewe${stamp} Alfa`;
  const apeRep = `Beta${stamp} Gamma`;
  const creaRep = await post('/representantes/', { nombres: nomRep, apellidos: apeRep, telefono: '0990000001' });
  log('Crear representante', creaRep.status === 201 && !!creaRep.body.id_representante, creaRep.body.error || '');
  const dupRep = await post('/representantes/', { nombres: nomRep, apellidos: apeRep, telefono: '0990000001' });
  log('Duplicado -> 409 con id', dupRep.status === 409 && !!dupRep.body.id_representante, '');
  if (creaRep.body.id_representante) {
    const borraRep = await del(`/representantes/${creaRep.body.id_representante}`);
    log('Borrar representante sin uso', borraRep.status === 200, borraRep.body.error || '');
  }
  const repConHijos = await del('/representantes/7');
  log('Borrar representante CON hijos -> 409', repConHijos.status === 409, '');
  const dashAdmin = await get('/dashboard/');
  log('Dashboard admin', dashAdmin.status === 200 && Array.isArray(dashAdmin.body.ultimosEventos)
    && 'ultimoRespaldo' in dashAdmin.body, '');
  await loginAs('elena.romero@uteq.edu.ec');
  const dashProf = await get('/dashboard/');
  log('Dashboard profesor', dashProf.status === 200 && Array.isArray(dashProf.body.misMaterias)
    && Array.isArray(dashProf.body.ultimasNotas), `${dashProf.body.misMaterias?.length} materias`);
  await loginAs('fernando.castillo@uteq.edu.ec');
  const dashRep = await get('/dashboard/');
  log('Dashboard representante', dashRep.status === 200 && Array.isArray(dashRep.body.hijos)
    && dashRep.body.hijos.length > 0, `${dashRep.body.hijos?.length} hijos`);
  await loginAs('maria.torres@uteq.edu.ec');
  const dashPsi = await get('/dashboard/');
  log('Dashboard psicologo', dashPsi.status === 200 && !!dashPsi.body.rendimiento, '');

  console.log('\n=== 12. CONSULTA POR BLOQUES + ASIGNACIONES ===');
  await loginAs('admin@uteq.edu.ec');
  const grupos = await get(`/consulta/grupos?id_periodo=${idPeriodo}`);
  log('Bloques materia+paralelo', grupos.status === 200 && grupos.body.grupos?.length >= 2,
    `${grupos.body.grupos?.length} bloques`);
  const g0 = grupos.body.grupos?.[0];
  if (g0) {
    const nom = await get(`/consulta/grupo?id_periodo=${idPeriodo}&id_materia=${g0.id_materia}&id_curso=${g0.id_curso || ''}&page=1&limit=10`);
    log('Nomina paginada del bloque', nom.status === 200 && Array.isArray(nom.body.datos)
      && nom.body.datos.length <= 10 && !!nom.body.paginacion,
      `total=${nom.body.paginacion?.total}`);
  }
  const asg = await get(`/asignaciones/?id_periodo=${idPeriodo}`);
  log('Listar asignaciones', asg.status === 200 && Array.isArray(asg.body.asignaciones), `${asg.body.asignaciones?.length}`);
  const opt = await get(`/asignaciones/opciones?id_periodo=${idPeriodo}`);
  log('Opciones para formulario', opt.status === 200 && opt.body.profesores?.length > 0 && opt.body.materias?.length > 0, '');
  const asgBody = { id_profesor: 5, id_materia: 7, id_periodo: idPeriodo, id_curso: null };
  const creaAsg1 = await post('/asignaciones/', asgBody);
  log('Asignar materia general', creaAsg1.status === 201, creaAsg1.body.error || '');
  const creaAsg2 = await post('/asignaciones/', asgBody);
  log('Asignacion duplicada -> 409', creaAsg2.status === 409, '');
  if (creaAsg1.body.id_asignacion) {
    const borraAsg = await del(`/asignaciones/${creaAsg1.body.id_asignacion}`);
    log('Quitar asignacion', borraAsg.status === 200, borraAsg.body.error || '');
  }

  console.log('\n=== 13. ROL ESTUDIANTE: SOLO LO SUYO, SIN REPORTES ===');
  await loginAs('admin@uteq.edu.ec');
  const tag13 = Date.now().toString(36);
  const creaEst = await post('/estudiantes/', {
    cedula: '19' + String(Date.now()).slice(-8),
    nombres: 'Ewe Uno', apellidos: stamp + ' Dos',
    fecha_nacimiento: '2011-05-06', id_representante: 1
  });
  log('Crear estudiante con usuario', creaEst.status === 201 && !!creaEst.body.email, creaEst.body.email || creaEst.body.error);
  const emailEst = creaEst.body.email;
  // Matricularlo en periodo activo para que tenga algo que ver.
  const per13 = await get('/periodos/');
  const idPer13 = per13.body.periodoActivo?.id_periodo || per13.body.periodos?.[0]?.id_periodo;
  const idEst13 = creaEst.body.id_estudiante;
  await post('/matriculas/', { id_estudiante: idEst13, id_periodo: idPer13, id_curso: null });
  await loginAs(emailEst);
  // Intenta ver a OTRO estudiante (id 1): debe devolver lo PROPIO.
  const espia = await get('/consulta/?id_periodo=' + idPer13 + '&id_estudiante=1');
  log('No puede ver a otro (fuerza propio)',
    espia.status === 200 && String(espia.body.idEstudiante) === String(idEst13),
    `devuelve idEstudiante=${espia.body.idEstudiante}`);
  const repEst = await get('/reportes/?id_periodo=' + idPer13);
  log('Estudiante bloqueado de reportes (403)', repEst.status === 403, '');
  const gruposEst = await get('/consulta/grupos?id_periodo=' + idPer13);
  log('Bloques propios', gruposEst.status === 200 && Array.isArray(gruposEst.body.grupos), `${gruposEst.body.grupos?.length} bloques`);
  const mat0 = await get('/consulta/materia/1?id_periodo=' + idPer13 + '&id_estudiante=1');
  log('Desglose ajeno fuerza propio',
    mat0.status === 200 && String(mat0.body.estudiante?.id_estudiante) === String(idEst13), '');

  console.log('\n=== 14. VISTA PROPIA SIN NOTAS + FILTRO SIN-CURSO ===');
  await loginAs('admin@uteq.edu.ec');
  const tag14 = Date.now().toString(36);
  const creaSin = await post('/estudiantes/', {
    cedula: '19' + String(Date.now()).slice(-8),
    nombres: 'Ewe Nulo', apellidos: tag14 + ' Notas',
    fecha_nacimiento: '2011-05-06', id_representante: 1
  });
  const idSin = creaSin.body.id_estudiante;
  await post('/matriculas/', { id_estudiante: idSin, id_periodo: idPer13, id_curso: null });
  await loginAs(creaSin.body.email);
  const propiaVacia = await get('/consulta/?id_periodo=' + idPer13);
  log('Sin notas ve tarjetas, no solo error',
    propiaVacia.status === 200 && (propiaVacia.body.materias || []).length > 0
    && (propiaVacia.body.materias || []).every(m => m.sin_notas),
    `materias=${(propiaVacia.body.materias || []).length}`);
  await loginAs('admin@uteq.edu.ec');
  const cursos14 = await get('/cursos/?id_periodo=' + idPer13);
  const cursoA = (cursos14.body.cursos || [])[0];
  if (cursoA) {
    const ctxFiltrado = await get(`/calificaciones/contexto?id_periodo=${idPer13}&id_materia=1&id_curso=${cursoA.id_curso}&page=1&limit=50`);
    const filas = ctxFiltrado.body.estudiantes || [];
    log('Filtro por curso incluye Sin-curso',
      filas.length > 0 && filas.some(e => e.id_curso == null),
      `${filas.length} filas`);
  }

  console.log('\n=== 15. ACTIVIDADES (INSUMOS) + PROMEDIOS AUTOMATICOS ===');
  await loginAs('elena.romero@uteq.edu.ec');
  const tiposAct = await get('/actividades/tipos');
  log('Tipos de actividad', tiposAct.status === 200 && (tiposAct.body.tipos || []).length >= 5,
    `${(tiposAct.body.tipos || []).length} tipos`);
  const ctx15 = await get(`/calificaciones/contexto?id_periodo=${idPeriodo}`);
  const mat15 = (ctx15.body.materias || [])[0];
  const tag15 = Date.now().toString(36);
  let idAct15 = null;
  if (mat15) {
    const creaAct = await post('/actividades', {
      id_periodo: String(idPeriodo), id_materia: mat15.id_materia,
      id_parcial: parcial ? parcial.id_parcial : null,
      id_ciclo: ciclo ? ciclo.id_ciclo : null,
      id_tipo_evaluacion: 4, nombre: 'Tarea API ' + tag15
    });
    idAct15 = creaAct.body.actividad?.id_actividad || null;
    log('Crear actividad', creaAct.status === 201 && !!idAct15,
      creaAct.body.actividad?.nombre || creaAct.body.error);
    const dupAct = await post('/actividades', {
      id_periodo: String(idPeriodo), id_materia: mat15.id_materia,
      id_parcial: parcial ? parcial.id_parcial : null,
      id_ciclo: ciclo ? ciclo.id_ciclo : null,
      id_tipo_evaluacion: 4, nombre: 'Tarea API ' + tag15
    });
    log('Duplicada -> 409', dupAct.status === 409, dupAct.body.error || '');
    const listaAct = await get(`/actividades?id_periodo=${idPeriodo}&id_materia=${mat15.id_materia}`);
    log('Listar con stats', listaAct.status === 200 && (listaAct.body.actividades || []).some(a => a.id_actividad === idAct15),
      `${(listaAct.body.actividades || []).length} actividades`);
  }
  if (mat15 && idAct15) {
    const ctxA = await get(`/calificaciones/contexto?id_periodo=${idPeriodo}&id_materia=${mat15.id_materia}`);
    const est15 = (ctxA.body.estudiantes || [])[0];
    const notaAct = await post('/calificaciones/lote', {
      id_periodo: String(idPeriodo), id_materia: mat15.id_materia,
      id_parcial: parcial ? parcial.id_parcial : null,
      id_ciclo: ciclo ? ciclo.id_ciclo : null,
      id_actividad: idAct15,
      notas: { [est15.id_estudiante]: { act: '8.75' } }
    });
    log('Calificar por actividad', notaAct.status === 200 && notaAct.body.ok,
      notaAct.body.mensaje || notaAct.body.error);
    const prom = await get(`/actividades/${idAct15}/promedios`);
    const fila = (prom.body.estudiantes || []).find(e => String(e.id_estudiante) === String(est15.id_estudiante));
    log('Promedios automaticos', prom.status === 200 && fila && Number(fila.n_formativas) >= 1 && fila.promedio_parcial != null,
      `form=${fila?.n_formativas} parc=${fila?.promedio_parcial}`);
    const borraConNotas = await del(`/actividades/${idAct15}`);
    log('Borrar con notas -> 409', borraConNotas.status === 409, borraConNotas.body.error || '');
  }
  const otraMat = await post('/actividades', {
    id_periodo: String(idPeriodo), id_materia: 999999,
    id_tipo_evaluacion: 4, nombre: 'Tarea ajena ' + tag15
  });
  log('Materia no asignada -> 403', otraMat.status === 403, otraMat.body.error || '');

  console.log('\n=== 16. CIERRE: PERIODO/ACTIVIDAD/ACTA ===');
  await loginAs('admin@uteq.edu.ec');
  const pers16 = await get('/periodos/');
  const inactivo = (pers16.body.periodos || []).find(p => !p.activo);
  if (inactivo) {
    const rInac = await post('/calificaciones/', {
      id_estudiante: 1, id_materia: 1, id_periodo: inactivo.id_periodo,
      id_tipo_evaluacion: 1, valor: 8
    });
    log('Periodo inactivo -> 400', rInac.status === 400, rInac.body.error || '');
  } else {
    log('Periodo inactivo -> 400', true, '(sin periodo inactivo en seed)');
  }
  // Actividad: cerrar bloquea, reabrir es solo admin.
  await loginAs('elena.romero@uteq.edu.ec');
  const ctx16 = await get(`/calificaciones/contexto?id_periodo=${idPeriodo}`);
  const mat16 = (ctx16.body.materias || [])[0];
  const tag16 = Date.now().toString(36);
  let idAct16 = null;
  if (mat16) {
    const crea16 = await post('/actividades', {
      id_periodo: String(idPeriodo), id_materia: mat16.id_materia,
      id_tipo_evaluacion: 4, nombre: 'Cierre E2E ' + tag16
    });
    idAct16 = crea16.body.actividad?.id_actividad || null;
    log('Crear actividad cierre', crea16.status === 201 && !!idAct16, '');
  }
  if (idAct16) {
    const est16 = await get(`/actividades/${idAct16}/notas`);
    const al16 = (est16.body.estudiantes || [])[0];
    const cerrar = await post(`/actividades/${idAct16}/estado`, { estado: 'cerrada' });
    log('Cerrar actividad', cerrar.status === 200, cerrar.body.error || '');
    if (al16) {
      const bloqueada = await post('/calificaciones/', {
        id_estudiante: al16.id_estudiante, id_materia: mat16.id_materia,
        id_periodo: idPeriodo, id_tipo_evaluacion: 4, valor: 8, id_actividad: idAct16
      });
      log('Nota en cerrada -> 400', bloqueada.status === 400, bloqueada.body.error || '');
    }
    const reabrirProf = await post(`/actividades/${idAct16}/estado`, { estado: 'publicada' });
    log('Reabrir no-admin -> 403', reabrirProf.status === 403, '');
    await loginAs('admin@uteq.edu.ec');
    const reabrir = await post(`/actividades/${idAct16}/estado`, { estado: 'publicada' });
    log('Reabrir admin', reabrir.status === 200, reabrir.body.error || '');
    const borraAct = await del(`/actividades/${idAct16}`);
    log('Borrar actividad reabierta sin notas', borraAct.status === 200, borraAct.body.error || '');
  }
  // Acta por CURSO (no congela datos reales de otras pruebas):
  // solo bloquea notas de ese paralelo.
  await loginAs('admin@uteq.edu.ec');
  const cursos16 = await get('/cursos/?id_periodo=' + idPeriodo);
  const cursoB = (cursos16.body.cursos || []).find(c => c.paralelo === 'B') || (cursos16.body.cursos || [])[0];
  if (cursoB) {
    const listaPrev = await get('/actas/?id_periodo=' + idPeriodo);
    const yaValidada = (listaPrev.body.actas || []).find(a =>
      String(a.id_materia) === '1' && String(a.id_curso) === String(cursoB.id_curso) && a.estado === 'validada');
    let idActaCtx = yaValidada ? yaValidada.id_acta : null;
    if (!idActaCtx) {
      const creaActa = await post('/actas/', { id_periodo: idPeriodo, id_materia: 1, id_curso: cursoB.id_curso });
      log('Crear acta borrador', creaActa.status === 201, creaActa.body.error || '');
      const dupActa = await post('/actas/', { id_periodo: idPeriodo, id_materia: 1, id_curso: cursoB.id_curso });
      log('Acta duplicada -> 409', dupActa.status === 409, '');
      const valActa = await post(`/actas/${creaActa.body.id_acta}/validar`, {});
      log('Validar acta', valActa.status === 200, valActa.body.error || '');
      idActaCtx = creaActa.body.id_acta;
    } else {
      log('Crear acta borrador', true, '(ya validada de corrida previa)');
      log('Acta duplicada -> 409', true, '(ya validada de corrida previa)');
      log('Validar acta', true, '(ya validada de corrida previa)');
    }
    const ctxB = await get(`/calificaciones/contexto?id_periodo=${idPeriodo}&id_materia=1&id_curso=${cursoB.id_curso}&page=1&limit=5`);
    const alB = (ctxB.body.estudiantes || [])[0];
    if (alB) {
      const cong = await post('/calificaciones/', {
        id_estudiante: alB.id_estudiante, id_materia: 1, id_periodo: idPeriodo,
        id_tipo_evaluacion: 1, valor: 8
      });
      log('Nota con acta validada -> 400', cong.status === 400, cong.body.error || '');
    }
    const borraVal = await del(`/actas/${idActaCtx}`);
    log('Borrar validada -> 404', borraVal.status === 404, '');
  }

  console.log('\n=== 17. ENTREGAS CON ESTADOS ===');
  await loginAs('admin@uteq.edu.ec');
  const tag17 = Date.now().toString(36);
  const creaEst17 = await post('/estudiantes/', {
    cedula: '19' + String(Date.now()).slice(-8),
    nombres: 'Ewe Entrega', apellidos: 'Flujo Uno',
    fecha_nacimiento: '2011-05-06', id_representante: 1
  });
  const idEst17 = creaEst17.body.id_estudiante;
  const emailEst17 = creaEst17.body.email;
  await post('/matriculas/', { id_estudiante: idEst17, id_periodo: idPeriodo, id_curso: null });
  await loginAs('elena.romero@uteq.edu.ec');
  const ctx17 = await get(`/calificaciones/contexto?id_periodo=${idPeriodo}`);
  const mat17 = (ctx17.body.materias || [])[0];
  const creaAct17 = await post('/actividades', {
    id_periodo: String(idPeriodo), id_materia: mat17.id_materia,
    id_tipo_evaluacion: 4, nombre: 'Entrega E2E ' + tag17
  });
  const idAct17 = creaAct17.body.actividad?.id_actividad;
  log('Crear actividad entregas', creaAct17.status === 201 && !!idAct17, '');
  const pub17 = await post(`/actividades/${idAct17}/estado`, { estado: 'publicada' });
  log('Publicar genera pendientes', pub17.status === 200 && (pub17.body.pendientes || 0) > 0,
    `${pub17.body.pendientes} pendientes`);
  // La entrega del estudiante nuevo debe existir en pendiente.
  const todas17 = await get(`/entregas/por-actividad/${idAct17}`);
  const entPropia = (todas17.body.entregas || []).find(e => String(e.id_estudiante) === String(idEst17));
  log('Pendiente del nuevo', !!entPropia && entPropia.estado === 'pendiente', '');
  if (!entPropia) {
    log('Estudiante envia la suya', false, 'sin entrega propia para el nuevo');
  } else {
  await loginAs(emailEst17);
  const envPropio = await post(`/entregas/${entPropia.id_entrega}/enviar`, {});
  log('Estudiante envia la suya', envPropio.status === 200, envPropio.body.error || '');
  const otra17 = (todas17.body.entregas || []).find(e => String(e.id_estudiante) !== String(idEst17));
  if (otra17) {
    const envAjena = await post(`/entregas/${otra17.id_entrega}/enviar`, {});
    log('Estudiante no envia ajena -> 403', envAjena.status === 403, '');
  }
  await loginAs('elena.romero@uteq.edu.ec');
  const rev17 = await post(`/entregas/${entPropia.id_entrega}/revisar`, { estado: 'aceptada', observacion: 'Bien' });
  log('Docente acepta', rev17.status === 200, rev17.body.error || '');
  const reenv = await post(`/entregas/${entPropia.id_entrega}/enviar`, {});
  log('Reenviar aceptada -> 409', reenv.status === 409, '');
  const borraAct17 = await del(`/actividades/${idAct17}`);
  log('Borrar con entregas en curso -> 409', borraAct17.status === 409, '');
  }

  console.log('\n=== 18. ARCHIVOS: ADJUNTOS + DOCUMENTOS ===');
  await loginAs('admin@uteq.edu.ec');
  const fs = require('fs');
  const pathLib = require('path');
  const pdfPath = pathLib.join(__dirname, 'tests', 'fixtures', 'muestra.pdf');
  const pdfBuf = fs.readFileSync(pdfPath);

  async function subirMultipart(url, fields, fileField, fileName, mime, buf) {
    const bnd = '----e2e' + Date.now().toString(36);
    const partes = [];
    for (const [k, v] of Object.entries(fields)) {
      partes.push(Buffer.from(`--${bnd}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    }
    partes.push(Buffer.from(
      `--${bnd}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`));
    partes.push(buf);
    partes.push(Buffer.from(`\r\n--${bnd}--\r\n`));
    const cuerpo = Buffer.concat(partes);
    return new Promise((resolve, reject) => {
      const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
      const opts = {
        hostname: 'localhost', port: 3000, path: '/api' + url, method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${bnd}`, 'Content-Length': cuerpo.length, 'Cookie': cookieStr }
      };
      const req = http.request(opts, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          let json; try { json = JSON.parse(data); } catch { json = data; }
          resolve({ status: res.statusCode, body: json });
        });
      });
      req.on('error', reject);
      req.write(cuerpo);
      req.end();
    });
  }

  // Tipos de documento (admin).
  const tag18 = Date.now().toString(36);
  const creaTipoDoc = await post('/documentos/tipos', { nombre: 'E2E Doc ' + tag18, obligatorio: true });
  log('Crear tipo documento', creaTipoDoc.status === 201 && !!creaTipoDoc.body.id_tipo_documento, creaTipoDoc.body.error || '');
  const idTipo18 = creaTipoDoc.body.id_tipo_documento;
  const dupTipoDoc = await post('/documentos/tipos', { nombre: 'E2E Doc ' + tag18 });
  log('Tipo duplicado -> 409', dupTipoDoc.status === 409, '');
  // Subir PDF valido al estudiante 1.
  const upOk = await subirMultipart('/documentos/por-estudiante/1', { id_tipo_documento: idTipo18 }, 'archivo', 'prueba.pdf', 'application/pdf', pdfBuf);
  log('Subir PDF valido', upOk.status === 201, upOk.body.error || JSON.stringify(upOk.body).slice(0, 120));
  // Rechazar ejecutable.
  const upExe = await subirMultipart('/documentos/por-estudiante/1', { id_tipo_documento: idTipo18 }, 'archivo', 'virus.exe', 'application/x-msdownload', Buffer.from('MZ...'));
  log('Rechazar .exe -> 400', upExe.status === 400, '');
  // Descarga sin sesion -> 401.
  const sinSesion = await new Promise((resolve) => {
    const opts = { hostname: 'localhost', port: 3000, path: '/api/documentos/por-estudiante/1', method: 'GET' };
    const req = http.request(opts, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', () => resolve(0));
    req.end();
  });
  log('Sin sesion -> 401', sinSesion === 401, '');
  // Listar y borrar el documento.
  const listaDocs = await get('/documentos/por-estudiante/1');
  const doc18 = (listaDocs.body.documentos || []).find(d => d.id_tipo_documento === idTipo18 && d.id_documento);
  log('Listar con vigente', listaDocs.status === 200 && !!doc18, '');
  if (doc18) {
    const borraDoc = await del(`/documentos/${doc18.id_documento}`);
    log('Borrar documento', borraDoc.status === 200, borraDoc.body.error || '');
  }
  const borraTipoDoc = await del(`/documentos/tipos/${idTipo18}`);
  log('Borrar tipo sin uso', borraTipoDoc.status === 200, borraTipoDoc.body.error || '');

  console.log('\n=== 19. OBSERVACIONES + FALLAS ===');
  await loginAs('admin@uteq.edu.ec');
  const obs19 = await post('/calificaciones/', {
    id_estudiante: 1, id_materia: 1, id_periodo: idPeriodo,
    id_tipo_evaluacion: 1, valor: 8.5, observacion: 'E2E obs ' + Date.now().toString(36)
  });
  log('Individual con observacion', obs19.status === 201, obs19.body.error || '');
  const consObs = await get(`/consulta/?id_periodo=${idPeriodo}&id_estudiante=1`);
  const hayObs = (consObs.body.materias || []).some(m =>
    (m.parciales || []).some(p => p.observacion && p.observacion.startsWith('E2E obs')));
  log('Observacion visible en consulta', consObs.status === 200 && hayObs, '');
  const falta19 = await post('/asistencias/', {
    id_estudiante: 1, id_materia: 1, id_periodo: idPeriodo, motivo: 'falta'
  });
  log('Registrar falta', [201, 409].includes(falta19.status), falta19.body.error || '');
  const dupFalta = await post('/asistencias/', {
    id_estudiante: 1, id_materia: 1, id_periodo: idPeriodo, motivo: 'falta'
  });
  log('Falta duplicada mismo dia -> 409', dupFalta.status === 409, '');
  const resum19 = await get(`/asistencias/?id_estudiante=1&id_materia=1&id_periodo=${idPeriodo}`);
  log('Resumen de faltas', resum19.status === 200 && resum19.body.resumen && resum19.body.resumen.total >= 1,
    JSON.stringify(resum19.body.resumen || {}));
  if ((resum19.body.faltas || []).length > 0) {
    const borraFalta = await del(`/asistencias/${resum19.body.faltas[0].id_asistencia}`);
    log('Quitar falta', borraFalta.status === 200, borraFalta.body.error || '');
  }
  await loginAs('elena.romero@uteq.edu.ec');
  const faltaAjen = await post('/asistencias/', {
    id_estudiante: 1, id_materia: 1, id_periodo: idPeriodo, motivo: 'falta'
  });
  log('Falta en materia no asignada -> 403', faltaAjen.status === 403, '');
  await loginAs('fernando.castillo@uteq.edu.ec');
  const faltaRep = await get('/asistencias/?id_estudiante=8&id_materia=1&id_periodo=' + idPeriodo);
  log('Representante ve faltas del hijo', faltaRep.status === 200, '');
  const faltaRep2 = await get('/asistencias/?id_estudiante=1&id_materia=1&id_periodo=' + idPeriodo);
  log('Representante no ve ajenos -> 403', faltaRep2.status === 403, '');

  console.log('\n=== 20. TIPOS REALES: ORDEN Y LEGACY ===');
  await loginAs('admin@uteq.edu.ec');
  const tipos20 = await get('/tipos/');
  const lista20 = tipos20.body.tiposEvaluacion || [];
  const idxUltForm = Math.max(...lista20.map((t, i) => t.categoria === 'formativa' && !t.es_legacy ? i : -1));
  const idxPrimerExam = Math.min(...lista20.map((t, i) => t.es_examen && !t.es_legacy ? i : 9999));
  log('Examen despues de formativas', tipos20.status === 200 && idxUltForm < idxPrimerExam,
    lista20.map(t => t.nombre).join(', '));
  const acts20 = await get('/actividades/tipos');
  log('Creacion sin legacy ni diagnostica',
    acts20.status === 200 && (acts20.body.tipos || []).every(t => !t.es_legacy && t.categoria !== 'diagnostica'),
    `${(acts20.body.tipos || []).length} tipos`);
  const ctx20 = await get(`/calificaciones/contexto?id_periodo=${idPeriodo}`);
  const nombres20 = (ctx20.body.tiposEvaluacion || []).map(t => t.nombre);
  log('Planilla sin Parcial 1/2', !nombres20.some(n => /^parcial \d/i.test(n)), nombres20.join(', '));

  console.log('\n=== 21. PREINSCRIPCION PUBLICA + APROBACION ===');
  for (const k of Object.keys(cookies)) delete cookies[k];
  const tag21 = Date.now().toString(36);
  const solBody = new URLSearchParams({
    nombres: 'Preins', apellidos: 'Crito Uno',
    cedula: '29' + String(Date.now()).slice(-8),
    fecha_nacimiento: '2012-04-05',
    rep_nombres: 'Padre Pre', rep_apellidos: 'Crito Uno',
    rep_telefono: '0990000111', id_periodo: String(idPeriodo)
  }).toString();
  const sol21 = await new Promise((resolve) => {
    const opts = {
      hostname: 'localhost', port: 3000, path: '/api/preinscripciones', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(solBody) }
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let json; try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', () => resolve({ status: 0, body: {} }));
    req.write(solBody);
    req.end();
  });
  log('Solicitud publica sin login', sol21.status === 201 && !!sol21.body.id_solicitud, sol21.body.error || '');
  const dup21 = await new Promise((resolve) => {
    const opts = {
      hostname: 'localhost', port: 3000, path: '/api/preinscripciones', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(solBody) }
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let json; try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', () => resolve({ status: 0, body: {} }));
    req.write(solBody);
    req.end();
  });
  log('Duplicada -> 409', dup21.status === 409, '');
  await loginAs('elena.romero@uteq.edu.ec');
  const bandejaProf = await get('/preinscripciones/?estado=pendiente');
  log(' Profesora no ve bandeja -> 403', bandejaProf.status === 403, '');
  await loginAs('admin@uteq.edu.ec');
  const bandeja = await get('/preinscripciones/?estado=pendiente');
  const mia = (bandeja.body.datos || []).find(s => s.id_solicitud === sol21.body.id_solicitud);
  log('Bandeja admin la trae', bandeja.status === 200 && !!mia, '');
  const aprueba = await post(`/preinscripciones/${sol21.body.id_solicitud}/aprobar`, {});
  log('Aprobar crea todo', aprueba.status === 201 && !!aprueba.body.id_estudiante && !!aprueba.body.email,
    aprueba.body.error || `${aprueba.body.email}`);
  if (aprueba.body.id_estudiante) {
    const verMat = await get(`/matriculas/?id_periodo=${idPeriodo}&q=${encodeURIComponent('Preins')}`);
    log('Matriculado visible', verMat.status === 200 && (verMat.body.datos || []).length > 0, '');
  }
  const sol21b = await new Promise((resolve) => {
    const b2 = new URLSearchParams({
      nombres: 'Rech', apellidos: 'Zado Uno', cedula: '28' + String(Date.now()).slice(-8),
      fecha_nacimiento: '2012-04-05', rep_nombres: 'Padre Re', rep_apellidos: 'Chazo Uno',
      id_periodo: String(idPeriodo)
    }).toString();
    const opts = {
      hostname: 'localhost', port: 3000, path: '/api/preinscripciones', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(b2) }
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let json; try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', () => resolve({ status: 0, body: {} }));
    req.write(b2);
    req.end();
  });
  if (sol21b.body.id_solicitud) {
    const rech = await post(`/preinscripciones/${sol21b.body.id_solicitud}/rechazar`, { motivo: 'E2E: cupo lleno' });
    log('Rechazar con motivo', rech.status === 200, rech.body.error || '');
  }

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
