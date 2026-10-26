// Ronda 6 de seguridad: topes diarios por cuenta, vinculacion de relojes sin filtrar datos del secreto, push dado de baja al cerrar sesion,
// respaldo local por cuenta, Health Connect acotado, estado con forma rota y topes de la base (sql/limits_app_state_and_push.sql).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const { capId, withinDailyCap } = require('../api/_lib/daily-cap');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function withFetch(handler, fn) {
  const real = global.fetch;
  global.fetch = async (url, opts) => handler(String(url), opts || {});
  return Promise.resolve(fn()).finally(() => { global.fetch = real; });
}
const json = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body, text: async () => '' });

test('capId: UUID valido, estable, distinto por ambito y por usuario', () => {
  const a = capId('wahoo-plan', 'u1');
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(a, capId('wahoo-plan', 'u1'));
  assert.notEqual(a, capId('wahoo-plan', 'u2'));
  assert.notEqual(a, capId('suunto-plan', 'u1'));
  assert.notEqual(capId('feedback-global', null), capId('login-alert-global', null));
});

test('withinDailyCap: respeta lo que devuelve el contador y falla cerrado/abierto segun se pida', async () => {
  await withFetch(() => json(true), async () => assert.equal(await withinDailyCap('http://x', {}, 's', 'u', 5), true));
  await withFetch(() => json(false), async () => assert.equal(await withinDailyCap('http://x', {}, 's', 'u', 5), false));
  await withFetch(() => json({}, false), async () => {
    assert.equal(await withinDailyCap('http://x', {}, 's', 'u', 5), true, 'por defecto deja pasar si el limitador cae');
    assert.equal(await withinDailyCap('http://x', {}, 's', 'u', 5, { failClosed: true }), false, 'failClosed corta');
  });
  await withFetch(() => { throw new Error('red'); }, async () => assert.equal(await withinDailyCap('http://x', {}, 's', 'u', 5, { failClosed: true }), false));
});

test('los endpoints que gastan cuota compartida o mandan mails tienen tope diario y cooldowns largos', () => {
  for (const [f, scope] of [['api/strava-sync-now.js', 'strava-sync-now'], ['api/suunto-sync-now.js', 'suunto-sync-now'], ['api/wahoo-sync-plan.js', 'wahoo-plan'], ['api/suunto-push-plan.js', 'suunto-plan'], ['api/send-feedback.js', 'feedback-global'], ['api/login-alert.js', 'login-alert-global']]) {
    assert.match(read(f), new RegExp("withinDailyCap\\([^)]*'" + scope + "'"), f);
  }
  assert.match(read('api/strava-sync-now.js'), /SYNC_COOLDOWN_MS = 60000/);
  assert.match(read('api/suunto-sync-now.js'), /SYNC_COOLDOWN_MS = 300000/);
  assert.match(read('api/wahoo-sync-plan.js'), /const MAX_DAYS = 7;/);
  assert.match(read('api/suunto-push-plan.js'), /const MAX_DAYS = 7;/);
  assert.match(read('api/chat.js'), /48 \* 3600 \* 1000\) \? Math\.min\(CHAT_DAILY_LIMIT, 20\)/, 'cuentas nuevas con tope de chat mas bajo');
});

test('vinculacion de relojes: cooldown en cada -init y en la confirmacion, y nada de la huella del secreto hacia el cliente', () => {
  for (const p of ['strava', 'polar', 'wahoo', 'suunto', 'coros']) assert.match(read(`api/${p}-init.js`), new RegExp("userCooldown\\(userId, '" + p + "-init'"), p);
  assert.match(read('api/_lib/oauth-link.js'), /userCooldown\(auth\.userId, provider \+ '-link'/);
  assert.doesNotMatch(read('api/_lib/oauth-link.js'), /dx:/, 'la respuesta no lleva dx');
  assert.doesNotMatch(read('api/suunto-auth.js'), /&dx=/, 'la URL de vuelta no lleva dx');
  assert.match(read('api/coros-init.js'), /if \(!keyIsValid\(\)\)/);
});

test('webhook de Strava: sin STRAVA_WEBHOOK_SECRET configurado se ignora el evento (falla cerrado)', () => {
  assert.match(read('api/strava-webhook.js'), /if \(!webhookSecret \|\| !safeEqual\(/);
});

test('send-reminders: un lote de app_state que falla no tumba el recordatorio de todos', () => {
  const s = read('api/send-reminders.js');
  assert.doesNotMatch(s, /throw new Error\(`app_state fetch failed/);
  assert.match(s, /app_state fetch failed: \$\{statesRes\.status\} \$\{body\.slice/);
});

test('hosting: carpetas locales fuera del despliegue', () => {
  const v = read('.vercelignore');
  assert.match(v, /^scratch$/m);
  assert.match(v, /^CLAUDE-SECURITY-\*$/m);
});

test('cerrar sesion da de baja el push de este dispositivo ANTES de signOut', () => {
  const s = read('app.js');
  const i = s.indexOf('async function logout(){');
  const body = s.slice(i, s.indexOf('\n}\n', i));
  assert.ok(body.indexOf('deletePushRowsForThisDevice()') > -1);
  assert.ok(body.indexOf('deletePushRowsForThisDevice()') < body.indexOf('auth.signOut()'));
});

test('wipeLocalUserData solo borra las claves de la cuenta que se va, no el respaldo sin subir de otra', () => {
  const app = loadApp();
  const store = new Map([
    ['zancada_pending_userA', 'respaldo de A sin subir'],
    ['zancada_pending_userB', 'respaldo de B sin subir'],
    ['zancada_run_in_progress_userB', 'carrera en curso de B'],
    ['zancada_run_in_progress_userA', 'carrera en curso de A'],
    ['zancada_pending_link', 'x'],
    ['otra_cosa', 'queda']
  ]);
  // el localStorage falso del helper no se puede recorrer (sin length/key): se pone uno iterable
  const m = new Map();
  const ls = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), get length() { return m.size; }, key: i => [...m.keys()][i] ?? null };
  app.localStorage = ls;
  store.forEach((v, k) => ls.setItem(k, v));
  app.wipeLocalUserData('userB');
  assert.equal(ls.getItem('zancada_pending_userB'), null);
  assert.equal(ls.getItem('zancada_run_in_progress_userB'), null);
  assert.equal(ls.getItem('zancada_pending_link'), null);
  assert.equal(ls.getItem('zancada_pending_userA'), 'respaldo de A sin subir', 'el respaldo de A sigue ahi');
  assert.equal(ls.getItem('zancada_run_in_progress_userA'), 'carrera en curso de A');
  assert.equal(ls.getItem('otra_cosa'), 'queda');
});

test('wipeLocalUserData: ya no borra por prefijo todas las cuentas', () => {
  const s = read('app.js');
  const i = s.indexOf('function wipeLocalUserData(uid){');
  const body = s.slice(i, i + 900);
  assert.doesNotMatch(body, /indexOf\('zancada_pending_'\) === 0/);
  assert.match(body, /pendingBackupKey\(uid\)/);
});

test('Health Connect: distancia, duracion y pulso se acotan a rangos humanos', () => {
  const app = loadApp();
  const r = app.healthConnectExerciseToRun({ id: 'x1', startTime: '2026-10-20T10:00:00Z', distanceMeters: 9e9, durationSec: 9e9, avgHr: 9999, maxHr: 5, avgCadence: 99999, calories: 1e9 });
  assert.equal(r.distanceKm, 0);
  assert.equal(r.durationSec, 0);
  assert.equal(r.avgHr, null);
  assert.equal(r.maxHr, null);
  assert.equal(r.avgCadence, null);
  assert.equal(r.calories, null);
  const ok = app.healthConnectExerciseToRun({ id: 'x2', startTime: '2026-10-20T10:00:00Z', distanceMeters: 10250, durationSec: 3300, avgHr: 152.4, maxHr: 178, avgCadence: 170, calories: 640 });
  assert.equal(ok.distanceKm, 10.25);
  assert.equal(ok.durationSec, 3300);
  assert.equal(ok.avgHr, 152);
  assert.equal(ok.maxHr, 178);
});

test('normalizeLoadedState: fuerza la forma minima y descarta entradas que no son objetos', () => {
  const app = loadApp();
  const bad = app.normalizeLoadedState({ profile: null, plan: 'x', runs: [null, 5, { id: 1 }], shoes: {}, chat: [{ role: 'user' }, 'texto'], lang: 7 });
  assert.deepEqual(JSON.parse(JSON.stringify(bad.profile)), {});
  assert.deepEqual(JSON.parse(JSON.stringify(bad.plan)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(bad.runs)), [{ id: 1 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(bad.shoes)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(bad.chat)), [{ role: 'user' }]);
  assert.equal(typeof bad.lang, 'string');
  assert.equal(app.normalizeLoadedState(null).onboarded, false);
  const s = read('app.js');
  assert.equal((s.match(/normalizeLoadedState\(/g) || []).length, 4, 'definicion + 3 puntos de carga');
});

test('sql/limits_app_state_and_push.sql: triggers con tope de tamano y forma, sin permisos para el cliente', () => {
  const sql = read('sql/limits_app_state_and_push.sql').replace(/--.*$/gm, '');
  assert.match(sql, /CREATE TRIGGER app_state_limit\s+BEFORE INSERT OR UPDATE ON public\.app_state/i);
  assert.match(sql, /CREATE TRIGGER push_subscriptions_limit\s+BEFORE INSERT OR UPDATE ON public\.push_subscriptions/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.limit_app_state\(\) FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.limit_push_subscriptions\(\) FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /SET search_path = public/);
});

test('al completar la recuperacion de contrasena se cierran las demas sesiones (queda solo la actual)', () => {
  const s = read('app.js');
  const i = s.indexOf('async function submitNewPassword(){');
  const body = s.slice(i, i + 1800);
  assert.ok(body.indexOf("updateUser({ password: newPw })") > -1);
  assert.ok(body.indexOf("signOut({ scope: 'others' })") > body.indexOf('updateUser({ password: newPw })'));
});
