// Full end-to-end test (using http module with proper cookie handling)
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
        // Parse cookies
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

(async () => {
  const results = [];
  const log = (test, ok, detail) => { results.push({ test, ok }); console.log(ok ? '  OK' : '  FAIL', test, detail || ''); };

  console.log('\n=== 1. LOGIN TESTS ===');
  const users = [
    { email: 'admin@uteq.edu.ec', role: 'administrador' },
    { email: 'elena.romero@uteq.edu.ec', role: 'profesor' },
    { email: 'andres.torres@uteq.edu.ec', role: 'profesor' },
    { email: 'fernando.castillo@uteq.edu.ec', role: 'representante' },
    { email: 'maria.torres@uteq.edu.ec', role: 'psicologo' },
  ];

  for (const u of users) {
    // Clear cookies before each login
    for (const k of Object.keys(cookies)) delete cookies[k];
    const r = await post('/auth/login', { email: u.email, password: 'UTEQ2026' });
    const ok = r.status === 200 && r.body.usuario && r.body.usuario.nombre_rol === u.role;
    log(`Login ${u.role}`, ok, ok ? '' : JSON.stringify(r.body));
  }

  // --- 2. Elena saves calificaciones ---
  console.log('\n=== 2. CALIFICACIONES (Elena como profesor) ===');
  for (const k of Object.keys(cookies)) delete cookies[k];
  await post('/auth/login', { email: 'elena.romero@uteq.edu.ec', password: 'UTEQ2026' });

  const ctx = await get('/calificaciones/contexto?id_periodo=3&id_materia=4');
  log('Context loaded', ctx.status === 200, `materias=${ctx.body.materias?.length} students=${ctx.body.estudiantes?.length}`);

  const save = await post('/calificaciones/lote', {
    id_periodo: '3', id_materia: '4',
    notas: { '1': { '1': '8.50', '2': '9.00' }, '2': { '1': '7.75' } }
  });
  log('Save 3 grades', save.status === 200 && save.body.ok, save.body.mensaje || save.body.error);

  // --- 3. Check audit as admin ---
  console.log('\n=== 3. AUDITORIA (solo admin) ===');
  for (const k of Object.keys(cookies)) delete cookies[k];
  await post('/auth/login', { email: 'admin@uteq.edu.ec', password: 'UTEQ2026' });

  const audit = await get('/auditoria/?page=1&limit=5&tabla=calificaciones');
  log('Audit query', audit.status === 200, `total=${audit.body.paginacion?.total}`);

  const recentInsert = audit.body.registros?.find(r => r.operacion === 'INSERT' && r.tabla_afectada === 'calificaciones');
  if (recentInsert) {
    log('Audit has user', recentInsert.id_usuario_app === 4, `id_usuario_app=${recentInsert.id_usuario_app} user=${recentInsert.usuario_nombres} ${recentInsert.usuario_apellidos}`);
    log('Audit has data', !!recentInsert.datos_nuevos, `valor=${recentInsert.datos_nuevos?.valor}`);
  }

  // Elena blocked from audit
  for (const k of Object.keys(cookies)) delete cookies[k];
  await post('/auth/login', { email: 'elena.romero@uteq.edu.ec', password: 'UTEQ2026' });
  const elenaAudit = await get('/auditoria/');
  log('Elena blocked from audit', elenaAudit.status === 403);

  // --- 4. Admin-only pages ---
  console.log('\n=== 4. ACCESS CONTROL ===');
  for (const k of Object.keys(cookies)) delete cookies[k];
  await post('/auth/login', { email: 'elena.romero@uteq.edu.ec', password: 'UTEQ2026' });
  const elenaRespaldos = await get('/respaldos/');
  log('Elena blocked from respaldos', elenaRespaldos.status === 403);

  // Representante can see consulta
  for (const k of Object.keys(cookies)) delete cookies[k];
  await post('/auth/login', { email: 'fernando.castillo@uteq.edu.ec', password: 'UTEQ2026' });
  const fernandoConsulta = await get('/consulta/');
  log('Fernando (representante) can see consulta', fernandoConsulta.status === 200);

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
