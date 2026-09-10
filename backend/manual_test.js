// =========================================================
// manual_test.js — Tests manuales exhaustivos (v3 final)
// =========================================================
const http = require('http');
const crypto = require('crypto');

const jar = {};
let passed = 0, failed = 0, total = 0;
const uid = Date.now().toString(36) + crypto.randomBytes(2).toString('hex');

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const cookieStr = Object.entries(jar).map(([k,v])=>k+'='+v).join('; ');
    const headers = {'Content-Type':'application/json'};
    if (cookieStr) headers.Cookie = cookieStr;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({hostname:'localhost',port:3000,path:'/api'+path,method,headers}, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
        (res.headers['set-cookie']||[]).forEach(s => { const [k,v]=s.split('='); jar[k]=v.split(';')[0]; });
        resolve({status:res.statusCode, body:JSON.parse(d||'{}')});
      });
    });
    r.on('error',reject);
    if (data) r.write(data);
    r.end();
  });
}

function getStatic(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000'+path, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode,body:d}));
    }).on('error',reject);
  });
}

function log(name, ok, detail='') {
  total++;
  if (ok) { passed++; console.log(`  OK ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

(async()=>{
  // =========================================================
  console.log('=== A. LOGIN (5 roles + edge cases) ===');
  for (const email of ['admin@uteq.edu.ec','elena.romero@uteq.edu.ec','andres.torres@uteq.edu.ec','fernando.castillo@uteq.edu.ec','maria.torres@uteq.edu.ec']) {
    const r = await req('POST','/auth/login',{email,password:'UTEQ2026'});
    log('Login '+email.split('@')[0], r.status===200 && r.body.usuario);
  }
  const badLogin = await req('POST','/auth/login',{email:'admin@uteq.edu.ec',password:'MALA'});
  log('Password incorrecto -> 401', badLogin.status===401);
  const noExiste = await req('POST','/auth/login',{email:'noexiste@uteq.edu.ec',password:'UTEQ2026'});
  log('Email inexistente -> 401', noExiste.status===401);

  // =========================================================
  console.log('\n=== B. CONTEXTO CALIFICACIONES ===');
  await req('POST','/auth/login',{email:'elena.romero@uteq.edu.ec',password:'UTEQ2026'});
  const ctx = await req('GET','/calificaciones/contexto?id_periodo=3&id_materia=4');
  log('Contexto con materia', ctx.status===200 && ctx.body.estudiantes?.length>0);
  log('Tipos evaluacion filtrados (6)', ctx.body.tiposEvaluacion?.length===6);
  log('Paginacion presente', !!ctx.body.paginacion);
  log('Materias del profesor', ctx.body.materias?.length>0);
  log('Cursos del profesor', ctx.body.cursos?.length>0);
  const ctxSin = await req('GET','/calificaciones/contexto?id_periodo=3');
  log('Contexto sin materia -> vacio', ctxSin.status===200 && ctxSin.body.estudiantes.length===0);

  // =========================================================
  console.log('\n=== C. PAGINACION CALIFICACIONES ===');
  const pg1 = await req('GET','/calificaciones/contexto?id_periodo=3&id_materia=4&page=1&limit=5');
  log('Page 1 limit 5', pg1.status===200 && pg1.body.estudiantes.length===5);
  log('page=1 limit=5 total>=10', pg1.body.paginacion.page===1 && pg1.body.paginacion.limit===5 && pg1.body.paginacion.total>=10);
  const pg2 = await req('GET','/calificaciones/contexto?id_periodo=3&id_materia=4&page=2&limit=5');
  log('Page 2 diferente de page 1', pg1.body.estudiantes[0].id_estudiante !== pg2.body.estudiantes[0].id_estudiante);
  const pgHigh = await req('GET','/calificaciones/contexto?id_periodo=3&id_materia=4&page=999&limit=5');
  log('Page 999 -> vacia sin error', pgHigh.status===200 && pgHigh.body.estudiantes.length===0);
  const pgZero = await req('GET','/calificaciones/contexto?id_periodo=3&id_materia=4&page=0&limit=5');
  log('Page 0 -> normaliza a 1', pgZero.status===200 && pgZero.body.paginacion.page===1);

  // =========================================================
  console.log('\n=== D. LOTE CALIFICACIONES ===');
  const est = pg1.body.estudiantes[0];
  const tipo = pg1.body.tiposEvaluacion[1];
  const save = await req('POST','/calificaciones/lote',{
    id_periodo:'3', id_materia:4, id_parcial:null, id_ciclo:null,
    notas:{[est.id_estudiante]:{[tipo.id_tipo_evaluacion]:'7.50'}}
  });
  log('Guardar nota 7.50', save.status===200 && save.body.ok && save.body.total===1);
  const saveBad = await req('POST','/calificaciones/lote',{
    id_periodo:'3', id_materia:4, notas:{[est.id_estudiante]:{[tipo.id_tipo_evaluacion]:'11'}}
  });
  log('Valor 11 -> error', saveBad.status>=400);
  const saveEmpty = await req('POST','/calificaciones/lote',{id_periodo:'3', id_materia:4, notas:{}});
  log('Sin notas -> 400', saveEmpty.status===400);
  const saveText = await req('POST','/calificaciones/lote',{
    id_periodo:'3', id_materia:4, notas:{[est.id_estudiante]:{[tipo.id_tipo_evaluacion]:'hola'}}
  });
  log('Texto como nota -> error', saveText.status>=400);

  // =========================================================
  console.log('\n=== E. ESTUDIANTES CRUD ===');
  await req('POST','/auth/login',{email:'admin@uteq.edu.ec',password:'UTEQ2026'});
  const ests = await req('GET','/estudiantes/?page=1&limit=5');
  log('Estudiantes paginados', ests.status===200 && ests.body.datos?.length>0 && ests.body.paginacion?.total>=10);

  const reps = await req('GET','/representantes/?q=castillo&limit=1');
  const idRep = reps.body.datos?.[0]?.id_representante;
  log('Representante para test', !!idRep);

  let estId = null;
  if (idRep) {
    const cedula = (1000000000 + crypto.randomBytes(4).readUInt32BE(0) % 9000000000).toString();
    const nombreEst = 'Maria Fernanda '+uid.slice(-2);
    const apellidoEst = 'Garcia Lopez '+uid.slice(-4);
    const nuevoEst = await req('POST','/estudiantes/',{
      cedula, nombres:nombreEst, apellidos:apellidoEst,
      fecha_nacimiento:'2010-03-15', id_representante: idRep, activo: true
    });
    log('Crear estudiante 2n+2a', nuevoEst.status===201 && nuevoEst.body.ok);
    log('Email generado @uteq.edu.ec', nuevoEst.body.email?.endsWith('@uteq.edu.ec'));
    log('Password UTEQ2026', nuevoEst.body.password==='UTEQ2026');
    estId = nuevoEst.body.id_estudiante;

    const badEst = await req('POST','/estudiantes/',{
      cedula:'1899999999',nombres:'Maria',apellidos:'Garcia',
      fecha_nacimiento:'2010-03-15',id_representante:idRep
    });
    log('1 nombre -> 400', badEst.status===400 && badEst.body.error?.includes('dos'));
    const badApe = await req('POST','/estudiantes/',{
      cedula:'1899999998',nombres:'Maria Ana',apellidos:'Garcia',
      fecha_nacimiento:'2010-03-15',id_representante:idRep
    });
    log('1 apellido -> 400', badApe.status===400);
    const dupCed = await req('POST','/estudiantes/',{
      cedula, nombres:nombreEst, apellidos:apellidoEst,
      fecha_nacimiento:'2010-03-15',id_representante:idRep
    });
    log('Cedula duplicada -> 409', dupCed.status===409);

    if (estId) {
      const editEst = await req('PUT','/estudiantes/'+estId,{
        cedula, nombres:nombreEst, apellidos:apellidoEst,
        fecha_nacimiento:'2010-03-15', id_representante: idRep, activo: false
      });
      log('Editar estudiante', editEst.status===200 && editEst.body.ok);
      const verEst = await req('GET','/estudiantes/'+estId);
      log('Ver estudiante editado', verEst.status===200 && verEst.body.estudiante?.activo===false);
    }
  }

  // =========================================================
  console.log('\n=== F. REPRESENTANTES CRUD ===');
  const repApe = 'Z'+uid.slice(-6)+' Vega';
  const repTest = await req('POST','/representantes/',{
    nombres:'Ximena Reyes', apellidos:repApe, telefono:'0991112233'
  });
  log('Crear representante 2n+2a', repTest.status===201 && repTest.body.ok);
  log('Email generado @uteq.edu.ec', repTest.body.email?.endsWith('@uteq.edu.ec'));
  log('Password UTEQ2026', repTest.body.password==='UTEQ2026');

  const dupRep = await req('POST','/representantes/',{
    nombres:'Ximena Reyes', apellidos:repApe, telefono:'0991112233'
  });
  log('Duplicado -> 409 con id', dupRep.status===409 && !!dupRep.body.id_representante);
  const badRep = await req('POST','/representantes/',{nombres:'Carlos',apellidos:'Morales'});
  log('1 nombre -> 400', badRep.status===400);
  const badApe2 = await req('POST','/representantes/',{nombres:'Carlos Eduardo',apellidos:'Morales'});
  log('1 apellido -> 400', badApe2.status===400);

  if (repTest.body.id_representante) {
    const editRep = await req('PUT','/representantes/'+repTest.body.id_representante,{
      nombres:'Ximena Reyes', apellidos:repApe, telefono:'0993334455'
    });
    log('Editar representante', editRep.status===200 && editRep.body.ok);
    const busq = await req('GET','/representantes/?q=Ximena&limit=5');
    log('Buscar representante', busq.status===200 && busq.body.datos?.length>0);
    const delRep = await req('DELETE','/representantes/'+repTest.body.id_representante);
    log('Borrar sin hijos', delRep.status===200 && delRep.body.ok);
  }
  const repConHijos = await req('DELETE','/representantes/7');
  log('Borrar CON hijos -> 409', repConHijos.status===409);

  // =========================================================
  console.log('\n=== G. DESGLOSE POR MATERIA ===');
  await req('POST','/auth/login',{email:'elena.romero@uteq.edu.ec',password:'UTEQ2026'});
  const estSearch = await req('GET','/estudiantes/?q=Isabella&limit=1');
  const testEstId = estSearch.body.datos?.[0]?.id_estudiante || 8;
  const desg = await req('GET',`/consulta/materia/4?id_estudiante=${testEstId}&id_periodo=3`);
  log('Desglose 200', desg.status===200);
  log('Ciclos array con parciales', desg.body.ciclos?.length>0 && desg.body.ciclos[0].parciales?.length>0);
  log('minimo_insumos number', typeof desg.body.minimo_insumos === 'number');
  log('promedio + escala', desg.body.promedio !== undefined && desg.body.escala !== undefined);
  log('materia + estudiante', desg.body.materia?.nombre && desg.body.estudiante?.nombres);
  const desgBad = await req('GET','/consulta/materia/4?id_estudiante=&id_periodo=3');
  log('Sin estudiante -> 400', desgBad.status===400);
  const desg404 = await req('GET',`/consulta/materia/9999?id_estudiante=${testEstId}&id_periodo=3`);
  log('Materia inexistente -> 404', desg404.status===404);

  // =========================================================
  console.log('\n=== H. CONSULTA POR MATRICULA ===');
  await req('POST','/auth/login',{email:'fernando.castillo@uteq.edu.ec',password:'UTEQ2026'});
  const cons = await req('GET','/consulta/?id_periodo=3');
  log('Consulta 200', cons.status===200);
  log('Tiene periodos', cons.body.periodos?.length>0);

  await req('POST','/auth/login',{email:'admin@uteq.edu.ec',password:'UTEQ2026'});
  const consAdmin = await req('GET','/consulta/?id_periodo=3');
  log('Admin ve materias', consAdmin.status===200 && consAdmin.body.materias?.length>=0);

  // =========================================================
  console.log('\n=== I. AUDITORIA ===');
  const audit = await req('GET','/auditoria/?page=1&limit=10');
  log('Auditoria paginada', audit.status===200 && audit.body.datos?.length>0);
  log('Paginacion', audit.body.paginacion?.total>=1);
  log('Filtros', audit.body.filtros !== undefined);
  const resumen = await req('GET','/auditoria/resumen');
  log('Resumen endpoint', resumen.status===200 && Array.isArray(resumen.body.resumen));
  const auditTab = await req('GET','/auditoria/?page=1&limit=10&tabla=calificaciones');
  log('Filtro tabla', auditTab.status===200);
  const tablas = await req('GET','/auditoria/tablas?categoria=calificaciones');
  log('Tablas endpoint', tablas.status===200 && Array.isArray(tablas.body.tablas));
  log('Tablas sin internas', !tablas.body.tablas?.some(t => ['parciales','ciclos_evaluativos','profesor_materia_periodo','tipos_evaluacion'].includes(t)));
  await req('POST','/auth/login',{email:'elena.romero@uteq.edu.ec',password:'UTEQ2026'});
  const auditNo = await req('GET','/auditoria/');
  log('Profesor bloqueado -> 403', auditNo.status===403);

  // =========================================================
  console.log('\n=== J. RESPALDOS ===');
  await req('POST','/auth/login',{email:'admin@uteq.edu.ec',password:'UTEQ2026'});
  const resp = await req('POST','/respaldos/manual',{});
  log('Respaldo manual', resp.status===200 && resp.body.ok && resp.body.respaldo?.nombre);
  const hist = await req('GET','/respaldos/historial?page=1&limit=5');
  log('Historial', hist.status===200 && hist.body.datos?.length>=1);
  await req('POST','/auth/login',{email:'elena.romero@uteq.edu.ec',password:'UTEQ2026'});
  log('Profesor bloqueado -> 403', (await req('POST','/respaldos/manual',{})).status===403);

  // =========================================================
  console.log('\n=== K. CATALOGOS ===');
  await req('POST','/auth/login',{email:'admin@uteq.edu.ec',password:'UTEQ2026'});
  const ciclos = await req('GET','/catalogos/ciclos?id_periodo=3');
  log('Ciclos periodo', ciclos.status===200 && ciclos.body.ciclos?.length>0);
  const parciales = await req('GET','/catalogos/parciales?id_ciclo=3');
  log('Parciales ciclo', parciales.status===200 && parciales.body.parciales?.length>0);
  const asigOpts = await req('GET','/asignaciones/opciones?id_periodo=3');
  log('Opciones asignaciones', asigOpts.status===200 && asigOpts.body.profesores?.length>0);

  // =========================================================
  console.log('\n=== L. CONSULTA GRUPOS ===');
  const grupos = await req('GET','/consulta/grupos?id_periodo=3');
  log('Grupos periodo 3', grupos.status===200 && grupos.body.grupos?.length>0);
  if (grupos.body.grupos?.length>0) {
    const g = grupos.body.grupos[0];
    const cursoParam = g.id_curso ? '&id_curso='+g.id_curso : '';
    const grupoDet = await req('GET',`/consulta/grupo?id_periodo=3&id_materia=${g.id_materia}${cursoParam}&page=1&limit=5`);
    log('Grupo detalle', grupoDet.status===200);
  }

  // =========================================================
  console.log('\n=== M. DASHBOARD POR ROL ===');
  await req('POST','/auth/login',{email:'admin@uteq.edu.ec',password:'UTEQ2026'});
  const dashAdmin = await req('GET','/dashboard/');
  log('Dashboard admin', dashAdmin.status===200 && Array.isArray(dashAdmin.body.ultimosEventos));
  await req('POST','/auth/login',{email:'elena.romero@uteq.edu.ec',password:'UTEQ2026'});
  log('Dashboard profesor', (await req('GET','/dashboard/')).body.misMaterias !== undefined);
  await req('POST','/auth/login',{email:'fernando.castillo@uteq.edu.ec',password:'UTEQ2026'});
  log('Dashboard representante', (await req('GET','/dashboard/')).body.hijos?.length>0);
  await req('POST','/auth/login',{email:'maria.torres@uteq.edu.ec',password:'UTEQ2026'});
  const psi = await req('GET','/dashboard/');
  log('Dashboard psicologo', psi.status===200);

  // Psicologo endpoint
  const psiRend = await req('GET','/psicologo/rendimiento?page=1&limit=10');
  log('Psicologo rendimiento', psiRend.status===200 && psiRend.body.datos?.length>0);
  log('Psicologo tiene promedios/alertas', psiRend.body.resumen !== undefined || psiRend.body.paginacion !== undefined);

  // =========================================================
  console.log('\n=== N. PERIODOS ===');
  await req('POST','/auth/login',{email:'admin@uteq.edu.ec',password:'UTEQ2026'});
  const pers = await req('GET','/periodos/');
  log('Listar periodos', pers.status===200 && pers.body.periodos?.length>0);
  log('Periodo activo', pers.body.periodoActivo !== undefined);

  // =========================================================
  console.log('\n=== O. CRUD CICLOS + PESOS ===');
  const cicOrder = 50 + Math.floor(Math.random()*100);
  const cicC = await req('POST','/ciclos/',{nombre:'TestCiclo '+uid.slice(-4),tipo:'quimestre',orden:cicOrder,id_periodo:3,peso:0.10,peso_formativa:0.80,peso_sumativa:0.20});
  log('Crear ciclo con pesos', cicC.status===201 && cicC.body.ok);
  if (cicC.body.id_ciclo) {
    const cicE = await req('PUT','/ciclos/'+cicC.body.id_ciclo,{nombre:'TestCiclo '+uid.slice(-4),tipo:'quimestre',orden:cicOrder,id_periodo:3,peso:0.15,peso_formativa:0.70,peso_sumativa:0.30});
    log('Editar ciclo', cicE.status===200);
    const cicD = await req('DELETE','/ciclos/'+cicC.body.id_ciclo);
    log('Borrar ciclo sin notas', cicD.status===200);
  }

  // =========================================================
  console.log('\n=== P. FRONTEND STATIC FILES ===');
  const files = ['/', '/js/config.js', '/js/pagination.js', '/css/style.css',
    '/pages/calificaciones.html', '/pages/estudiantes.html', '/pages/estudiante-form.html',
    '/pages/auditoria.html', '/pages/reportes.html', '/pages/consulta.html',
    '/pages/respaldos.html', '/pages/catalogos.html', '/pages/psicologo.html', '/pages/dashboard.html'];
  for (const f of files) {
    const r = await getStatic(f);
    log('GET '+f, r.status===200);
  }
  // Contenido
  const pagJS = (await getStatic('/js/pagination.js')).body;
  log('pagination.js: SVG arrows', pagJS.includes('svg') && pagJS.includes('pag-arrow'));
  const estForm = (await getStatic('/pages/estudiante-form.html')).body;
  log('estudiante-form: nombre1/nombre2', estForm.includes('nombre1') && estForm.includes('nombre2'));
  log('estudiante-form: apellido1/apellido2', estForm.includes('apellido1') && estForm.includes('apellido2'));
  log('estudiante-form: email preview', estForm.includes('email-preview') && estForm.includes('generarEmail'));
  log('estudiante-form: rep fields', estForm.includes('rep-nombre1') && estForm.includes('rep-apellido1'));
  const calHTML = (await getStatic('/pages/calificaciones.html')).body;
  log('calificaciones: pagination.js', calHTML.includes('pagination.js'));
  log('calificaciones: paginacion-cal', calHTML.includes('paginacion-cal'));

  // =========================================================
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTADOS: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
