// Auditoría 2026-11-03, grupo 4: topes de entrada, test de Cooper, vuelta de OAuth en el inicio, desconexiones y borrado de cuenta.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split(String.fromCharCode(13)).join('');
const SRC = read('app.js');

test('los km semanales actuales tienen tope (200): un tipeo de 400 por 40 ya no arma un plan de cientos de km', () => {
  assert.ok(SRC.includes('const MAX_CURRENT_WEEKLY_KM = 200;'));
  assert.ok(SRC.includes('Math.min(currentWeeklyKmRaw, MAX_CURRENT_WEEKLY_KM)'), 'onboarding');
  assert.ok(SRC.includes('Math.min(parseDistInput(currentKmInput.value), MAX_CURRENT_WEEKLY_KM)'), 'Perfil');
});

test('test de Cooper: con poca distancia no hay rangos de ritmo invertidos ni ritmos de 12 a 18 min/km; menos de 1200 m no cuenta como test', () => {
  const app = loadApp();
  for (const m of [1200, 1300, 1500, 1700, 2000, 2400, 3000, 4000]) {
    const ev = app.evaluateLevelTest(m);
    assert.ok(ev.paces.easy[0] <= ev.paces.easy[1], 'ritmo suave en orden a ' + m + ' m: ' + ev.paces.easy);
    assert.ok(ev.paces.tempo[0] <= ev.paces.tempo[1] + 0.001 || ev.paces.tempo[0] >= ev.paces.tempo[1], 'tempo definido');
  }
  const slow = app.trainingPacesFromVdot(app.vdotFromCooper(1200));
  assert.ok(slow.easy[1] >= slow.easy[0] + 0.29, 'el extremo lento queda por encima del rápido');
  assert.ok(SRC.includes('const LEVEL_TEST_MIN_M = 1200,'));
});

test('web/iPhone: al volver de autorizar un reloj en medio del inicio, la conexión se confirma enseguida y se repintan las filas', () => {
  const body = SRC.slice(SRC.indexOf('async function loadUserAndEnter'), SRC.indexOf('function isPasswordStrong'));
  const iReset = body.indexOf('resetOnboardSteps();');
  const iFinish = body.indexOf('finishPendingProviderLink().then(()=>{ if(obCurrentStep === 19) obRefreshConnections(); })');
  assert.ok(iReset > 0 && iFinish > iReset, 'se confirma justo después de armar el inicio');
});

test('Garmin: si no se pueden borrar las carreras al desconectar NO se responde ok (Garmin exige borrarlas) y se avisa a Sentry; las otras marcas avisan a Sentry', () => {
  const g = read('api/garmin-disconnect.js');
  assert.ok(g.includes("res.status(502).json({ error: 'Could not delete imported runs' });"));
  assert.ok(g.includes("step: 'purge'"));
  for (const b of ['suunto', 'wahoo', 'polar', 'coros']) assert.ok(read('api/' + b + '-disconnect.js').includes("step: 'purge'"), b);
});

test('borrado de cuenta: las revocaciones de Polar y Wahoo tienen tope de tiempo y se reportan si fallan', () => {
  const d = read('api/delete-account.js');
  assert.ok(d.includes("fetchWithTimeout(`https://www.polaraccesslink.com/v3/users/${conn.polar_user_id}`"));
  assert.ok(d.includes("fetchWithTimeout('https://api.wahooligan.com/v1/permissions'"));
  assert.ok(d.includes("step: 'polar-revoke'") && d.includes("step: 'wahoo-revoke'"));
});

test('el script de rotación de la clave de cifrado cubre TODAS las tablas de conexiones que guardan tokens cifrados (Garmin se había olvidado)', () => {
  const script = read('scripts/encrypt-existing-tokens.js');
  const tables = [...script.matchAll(/^\s*([a-z_]+_connections):/gm)].map(m => m[1]);
  for (const t of ['strava_connections', 'polar_connections', 'wahoo_connections', 'suunto_connections', 'coros_connections', 'garmin_connections']) assert.ok(tables.includes(t), t + ' en el script');
  // toda tabla *_connections que el backend consulta con tokens tiene que estar en el script
  const used = new Set();
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'api'))) {
    if (!f.endsWith('.js')) continue;
    const src = read('api/' + f);
    if (!/encToken|decToken/.test(src)) continue;
    for (const m of src.matchAll(/rest\/v1\/([a-z]+_connections)/g)) used.add(m[1]);
  }
  for (const t of used) assert.ok(tables.includes(t), t + ' se usa con tokens cifrados pero falta en el script de rotación');
});

test('las herramientas del coach tienen topes: repeticiones, minutos de esfuerzo/recuperación y duración ya no se aceptan sin límite', () => {
  const app = loadApp();
  const iv = app.resolveCustomInterval({ repeticiones: 500, esfuerzo_min: 999, recuperacion_min: 99 });
  assert.deepEqual(JSON.parse(JSON.stringify(iv)), { reps: 40, workMin: 30, restMin: 10 });
  const ok = app.resolveCustomInterval({ repeticiones: 8, esfuerzo_min: 3, recuperacion_min: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(ok)), { reps: 8, workMin: 3, restMin: 2 }, 'los valores normales no cambian');
  assert.equal(app.resolveCustomInterval({ repeticiones: 0, esfuerzo_min: 3 }), null);
  assert.equal((SRC.match(/MAX_CUSTOM_DURATION_MIN, Math\.round\(input\.duracion_min\)/g) || []).length, 2, 'duración topeada en la semana actual y en la que viene');
});
