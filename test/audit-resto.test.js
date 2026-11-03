// Auditoría 2026-11-03, resto: duplicados en los crons, topes globales, seguridad del coach, desconexiones, cierre de sesión local, borrado de cuenta y SQL de límites.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const { isDuplicateOfExisting } = require('../api/_lib/duplicate-run');
const { withinHourlyCap, capId } = require('../api/_lib/daily-cap');
const { removeAllGarminWorkouts } = require('../api/_lib/garmin-plan-sync');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split(String.fromCharCode(13)).join('');
const SRC = read('app.js');

test('duplicado de una carrera ya guardada: mismo criterio que el cliente y el merge (10 min, 10 % de distancia, 10 % de duración)', () => {
  const t0 = Date.parse('2026-11-02T10:00:00Z');
  const runs = [{ date: '2026-11-02T10:02:00Z', distanceKm: 5, durationSec: 1800 }];
  assert.equal(isDuplicateOfExisting(runs, t0, 5.1, 1810), true, 'la misma actividad de otra fuente');
  assert.equal(isDuplicateOfExisting(runs, t0 + 3600000, 5, 1800), false, 'una hora después no');
  assert.equal(isDuplicateOfExisting(runs, t0, 8, 1800), false, 'distancia distinta');
  assert.equal(isDuplicateOfExisting(runs, t0, 5, 3000), false, 'duración muy distinta: dos esfuerzos distintos seguidos no se confunden');
  assert.equal(isDuplicateOfExisting(runs, t0, 5, 0), true, 'sin duración solo mira distancia');
  assert.equal(isDuplicateOfExisting([], t0, 5, 1800), false);
  assert.equal(isDuplicateOfExisting(null, t0, 5, 1800), false);
  assert.equal(isDuplicateOfExisting(runs, NaN, 5, 1800), false);
  for (const f of ['sync-strava', 'polar-sync', 'wahoo-sync']) assert.ok(read('api/' + f + '.js').includes('isDuplicateOfExisting('), f + ' lo usa antes de bajar streams/FIT');
});

test('tope por hora: cada hora UTC cuenta aparte y se pasa al limitador con ese id', async () => {
  const seen = [];
  const real = global.fetch;
  global.fetch = async (url, opts) => { seen.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => true }; };
  try {
    assert.equal(await withinHourlyCap('https://x.test', {}, 'garmin-plan-global', null, 60), true);
    const hour = new Date().toISOString().slice(0, 13);
    assert.equal(seen[0].p_user_id, capId('garmin-plan-global:' + hour, null));
    assert.equal(seen[0].p_limit, 60);
  } finally { global.fetch = real; }
  assert.ok(read('api/garmin-push-plan.js').includes("'garmin-plan-global'") && read('api/wahoo-sync-plan.js').includes("'wahoo-plan-global'") && read('api/suunto-push-plan.js').includes("'suunto-plan-global'"), 'topes globales en los tres envíos de plan');
});

test('el coach no puede armar series/cuestas/tempo ni zonas 4-5 para un principiante, con molestia activa, cautela alta o posparto; un corredor activo sano sí', () => {
  const app = loadApp();
  const active = { name: 'A', weeklyKm: 30, currentWeeklyKm: 30, goal: '10k', runnerType: 'active', trainBy: 'distance', units: 'metric', trainingDays: ['tue', 'thu'], birth: '1990-01-01', weight: 70, height: 175 };
  app.state.profile = Object.assign({}, active);
  assert.equal(app.coachSafetyRefusal({ tipo_categoria: 'intervals', zona: 4 }), null, 'activo sano: puede');
  assert.equal(app.coachSafetyRefusal({ tipo_categoria: 'easy', zona: 2 }), null, 'sesión suave: siempre puede');
  app.state.profile = Object.assign({}, active, { runnerType: 'new', currentWeeklyKm: 0 });
  assert.match(app.coachSafetyRefusal({ tipo_categoria: 'intervals', zona: 4 }), /principiante/);
  assert.match(app.coachSafetyRefusal({ tipo_categoria: 'easy', zona: 5 }), /principiante/, 'una zona 5 sola también');
  assert.equal(app.coachSafetyRefusal({ tipo_categoria: 'easy', zona: 2 }), null);
  app.state.profile = Object.assign({}, active, { birth: '1955-01-01' });
  assert.match(app.coachSafetyRefusal({ tipo_categoria: 'tempo' }), /cautela/);
  app.state.profile = Object.assign({}, active, { pregnancyPostpartum: true });
  assert.match(app.coachSafetyRefusal({ tipo_categoria: 'hills' }), /posparto/);
  assert.ok(SRC.includes('const safetyRefusal = coachSafetyRefusal(input);'), 'applyPlanChange la usa');
});

test('cerrar sesión cierra SOLO este dispositivo (scope local), también al rechazar el consentimiento', () => {
  assert.ok(!/auth\.signOut\(\); *location\.reload\(\)/.test(SRC), 'no quedó ningún signOut global seguido de reload');
  assert.ok(SRC.includes("await supabaseClient.auth.signOut({ scope:'local' });   // solo ESTE dispositivo"));
});

test('una corrida interrumpida se ofrece recuperar siempre que tenga algo real (sin el límite de 6 h ni exigir puntos GPS)', () => {
  assert.ok(SRC.includes("saved && saved.startedAt && ((saved.points||[]).length || Number(saved.distanceKm) > 0.05 || Number(saved.elapsedSec) >= 120)"));
  assert.ok(!SRC.includes('< 6*3600*1000 && (saved.points||[]).length'));
});

test('si falla un pedido posterior del coach con cambios ya aplicados no se muestra un error (el reintento los aplicaba dos veces)', () => {
  assert.ok(SRC.includes('if(data.error){ if(!anyToolApplied) finalText = data.error.message || t(\'coach_connection_error\'); break; }'));
});

test('Perfil: el estado de conexión de Strava/Polar/COROS/Garmin lo dice el servidor (la consulta directa devolvió vacío sin error en el iPhone)', () => {
  for (const k of ['strava', 'polar', 'coros', 'garmin']) assert.ok(SRC.includes(`typeof srvState.${k} === 'boolean'`), k);
});

test('desconexión de Garmin y borrado de cuenta: solo se olvida lo que Garmin confirmó borrado, y se recorren las fechas futuras en orden', async () => {
  const calls = [];
  const real = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url), m = (opts && opts.method) || 'GET';
    calls.push(m + ' ' + u);
    if (m === 'GET' && u.includes('sent_notifications')) {
      const mk = (d, w) => ({ period: `${d}|${w}|${w}1|abc` });
      return { ok: true, status: 200, json: async () => [mk('2026-11-20', '22'), mk('2026-11-10', '11')], text: async () => '' };
    }
    if (m === 'DELETE' && u.includes('training-api/workout/v2/11')) return { ok: false, status: 429, text: async () => '', json: async () => ({}) };   // Garmin no pudo borrar el de la fecha 11-10
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  };
  try {
    const removed = await removeAllGarminWorkouts('https://x.test', {}, 'u1', 'tok');
    const get = calls.find(c => c.startsWith('GET') && c.includes('sent_notifications'));
    assert.match(get, /period=gte\.\d{4}-\d{2}-\d{2}/, 'solo desde ayer');
    assert.notEqual(get.includes('period=gte.0000-00-00'), true);
    const forgets = calls.filter(c => c.startsWith('DELETE') && c.includes('sent_notifications'));
    assert.equal(removed, 1, 'solo uno confirmado');
    assert.equal(forgets.length, 1, 'se olvida solo la fecha que Garmin confirmó');
    assert.ok(forgets[0].includes('2026-11-20'));
  } finally { global.fetch = real; }
});

test('borrado de cuenta: Wahoo y COROS se revocan con un token renovado (el guardado dura ~2 h) y con tope de tiempo', () => {
  const d = read('api/delete-account.js');
  assert.ok(d.includes('async function freshAccessToken('));
  assert.ok(d.includes('freshAccessToken(base, headers, userId, conn, refreshWahooToken)') && d.includes('freshAccessToken(base, headers, userId, conn, refreshCorosToken)'));
  assert.ok(d.includes("step: 'coros-revoke'"));
});

test('los crons de planes de Suunto y Wahoo no reintentan cada hora a una cuenta que falla: pasan 24 h', () => {
  for (const [f, kind] of [['suunto-guides-cron', 'suunto_guides_fail'], ['wahoo-plans-cron', 'wahoo_plans_fail']]) {
    const src = read('api/' + f + '.js');
    assert.ok(src.includes(`isDuplicate(base, headers, conn.user_id, '${kind}', weekStart, 24 * 3600 * 1000)`), f + ' consulta el backoff');
    assert.ok(src.includes(`remember(base, headers, conn.user_id, '${kind}', weekStart)`), f + ' lo anota al fallar');
  }
});

test('SQL de límites: app_state de 12 MB (el uso real más grande es ~0,1 MB), chat de 3 MB y zapatillas de 256 KB', () => {
  const sql = read('sql/limits_app_state_and_push.sql');
  assert.ok(sql.includes('> 12 * 1024 * 1024') && !sql.includes('> 30 * 1024 * 1024'));
  assert.ok(sql.includes("(v_data->'chat')::text, '')) > 3 * 1024 * 1024") && sql.includes("(v_data->'shoes')::text, '')) > 256 * 1024"));
});
