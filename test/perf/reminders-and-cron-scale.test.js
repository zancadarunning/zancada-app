// test/perf/reminders-and-cron-scale.test.js
//
// Pruebas de carga del servidor con una base simulada (nada sale a internet ni toca producción):
//  - send-reminders con miles de usuarios: consultas dirigidas (no toda la tabla), costos calculados una vez, y tiempo.
//  - rotación de los crons de sincronización: con más cuentas de las que entran en el tope de 8 s, TODAS se sincronizan.
// Si una de estas falla es que un cambio hizo al servidor más caro o injusto con muchos usuarios: se arregla acá, no en producción.

const test = require('node:test');
const assert = require('node:assert/strict');

// web-push real intentaría salir a la red: se reemplaza por un contador
let pushesSent = 0;
const webpushPath = require.resolve('web-push');
require.cache[webpushPath] = { id: webpushPath, filename: webpushPath, loaded: true, exports: { setVapidDetails() {}, sendNotification: async () => { pushesSent++; } } };

const { rotateForFairness } = require('../../api/_lib/cron-rotation');

function fakeRes() {
  const r = { code: 200, body: null, headers: {}, headersSent: false };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; r.headersSent = true; return r; };
  r.send = b => { r.body = b; r.headersSent = true; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}

test('send-reminders con 20.000 usuarios y 3.000 suscripciones: consultas dirigidas, rápido y sin pedir toda la tabla', async () => {
  const USERS = 20000, SUBS = 3000;
  const todayIdxByTz = tz => null; // el plan se arma para todos los días: el día de hoy siempre tiene sesión
  const plan = Array.from({ length: 7 }, (_, i) => ({ day: i, typeKey: 'easy', dist: 5 }));
  const subs = Array.from({ length: SUBS }, (_, i) => ({ user_id: 'u' + i, subscription: { endpoint: 'e' + i }, platform: 'web' }));
  const tzs = ['America/Argentina/Buenos_Aires', 'America/New_York', 'Europe/Madrid', 'Asia/Tokyo', 'Australia/Sydney', 'America/Mexico_City'];
  const states = new Map();
  for (let i = 0; i < USERS; i++) states.set('u' + i, { user_id: 'u' + i, plan, weekStart: new Date().toISOString().slice(0, 10), tz: tzs[i % tzs.length], lang: 'es' });

  const calls = { subscriptions: 0, appStateBatches: 0, appStateFull: 0, rowsServed: 0 };
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    url = String(url);
    if (url.includes('/rest/v1/push_subscriptions')) { calls.subscriptions++; return { ok: true, status: 200, json: async () => subs, text: async () => '' }; }
    if (url.includes('/rest/v1/app_state')) {
      const m = url.match(/user_id=in\.\(([^)]*)\)/);
      if (!m) { calls.appStateFull++; calls.rowsServed += USERS; return { ok: true, status: 200, json: async () => [...states.values()], text: async () => '' }; }
      calls.appStateBatches++;
      const rows = m[1].split(',').map(decodeURIComponent).map(id => states.get(id)).filter(Boolean);
      calls.rowsServed += rows.length;
      return { ok: true, status: 200, json: async () => rows, text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  };
  process.env.CRON_SECRET = 'test-secret'; process.env.SUPABASE_URL = 'https://x.test'; process.env.SUPABASE_SERVICE_KEY = 'k';
  process.env.VAPID_PUBLIC_KEY = 'p'; process.env.VAPID_PRIVATE_KEY = 'q';
  try {
    const handler = require('../../api/send-reminders');
    const res = fakeRes();
    const t0 = process.hrtime.bigint();
    await handler({ headers: { authorization: 'Bearer test-secret' }, url: '/api/send-reminders', method: 'GET' }, res);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.equal(res.code, 200, JSON.stringify(res.body));
    assert.equal(calls.appStateFull, 0, 'nunca se pide app_state entero');
    assert.equal(calls.appStateBatches, Math.ceil(SUBS / 100), 'una consulta por lote de 100 usuarios con suscripción');
    assert.equal(calls.rowsServed, SUBS, 'solo se leen las filas de quienes tienen push (3.000 de 20.000)');
    assert.ok(ms < 1500, `tardó ${ms.toFixed(0)} ms (tope 1500)`);
    assert.equal(res.body.sent + res.body.skipped + res.body.failed, SUBS);
  } finally { global.fetch = realFetch; }
});

test('rotación de crons: 120 cuentas y solo 8 por corrida -> todas se sincronizan en pocas corridas', () => {
  const conns = Array.from({ length: 120 }, (_, i) => ({ user_id: 'user-' + String(i).padStart(3, '0') }));
  const CAPACIDAD = 8;            // cuántas alcanzan a procesarse antes del tope de 8 s
  const CADENCIA = 15 * 60 * 1000;
  const visited = new Set();
  let corridas = 0;
  const base = Date.UTC(2026, 9, 7, 12, 0, 0);
  while (visited.size < conns.length && corridas < 200) {
    const orden = rotateForFairness(conns, CADENCIA, 3, base + corridas * CADENCIA);
    orden.slice(0, CAPACIDAD).forEach(c => visited.add(c.user_id));
    corridas++;
  }
  assert.equal(visited.size, conns.length, 'cada cuenta tiene que sincronizarse alguna vez');
  assert.ok(corridas <= 40, `tardó ${corridas} corridas (tope 40 = 10 h con cron cada 15 min)`);
});

test('rotación de crons: sin rotación las últimas cuentas nunca se sincronizan (el problema que arregla)', () => {
  const conns = Array.from({ length: 120 }, (_, i) => ({ user_id: 'user-' + String(i).padStart(3, '0') }));
  const sinRotar = new Set();
  for (let corrida = 0; corrida < 100; corrida++) conns.slice(0, 8).forEach(c => sinRotar.add(c.user_id));
  assert.equal(sinRotar.size, 8, 'sin rotación solo las primeras 8 de 120 se sincronizan, siempre las mismas');
});

test('rotateForFairness: no pierde ni duplica cuentas, y listas chicas o vacías no rompen', () => {
  const conns = Array.from({ length: 7 }, (_, i) => ({ user_id: 'u' + i }));
  for (let slot = 0; slot < 30; slot++) {
    const out = rotateForFairness(conns, 1000, 3, slot * 1000);
    assert.deepEqual(out.map(c => c.user_id).sort(), conns.map(c => c.user_id).sort());
  }
  assert.deepEqual(rotateForFairness([], 1000, 3, 0), []);
  assert.deepEqual(rotateForFairness([{ user_id: 'solo' }], 1000, 3, 5), [{ user_id: 'solo' }]);
  assert.deepEqual(rotateForFairness(null, 1000, 3, 0), []);
});
