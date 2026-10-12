// Aviso "Entrenamiento cargado" cuando llega una carrera nueva desde un reloj (api/_lib/notify-new-run.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// firebase-admin real no: se reemplaza api/_lib/fcm.js por un espía antes de cargar el módulo a probar
const sent = [];
const fcmPath = require.resolve(path.join('..', 'api', '_lib', 'fcm.js'));
require.cache[fcmPath] = { id: fcmPath, filename: fcmPath, loaded: true, exports: { sendFcmPush: async (token, title, body, opts) => { sent.push({ token, title, body, opts }); return false; } } };
const { mergeAndNotify, buildMessage, fmtPace } = require('../api/_lib/notify-new-run.js');

const recent = () => new Date(Date.now() - 20 * 60000).toISOString();
const mkRun = (id, over) => Object.assign({ id, date: recent(), distanceKm: 8, durationSec: 2928 }, over || {});

// fetch falso: `stored` = ids ya guardados; el merge los agrega
function fakeFetch(db) {
  return async (url) => {
    const u = String(url);
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.includes('/rest/v1/app_state') && u.includes('data=cs.')) {
      const id = JSON.parse(decodeURIComponent(u.split('data=cs.')[1].split('&')[0])).runs[0].id;
      return ok(db.stored.has(id) ? [{ user_id: 'u1' }] : []);
    }
    if (u.includes('/rest/v1/app_state') && u.includes('select=lang')) return ok([{ lang: db.lang || 'es', units: db.units || null }]);
    if (u.includes('/rest/v1/push_subscriptions')) return ok(db.subs === undefined ? [{ platform: 'android', subscription: { token: 'tok' } }] : db.subs);
    return ok([]);
  };
}

test('mensaje de una carrera: distancia, tiempo y ritmo, en el idioma y la unidad del usuario', () => {
  const es = buildMessage([mkRun('suunto_1')], 'suunto', 'es', false);
  assert.equal(es.title, 'Entrenamiento cargado');
  assert.match(es.body, /Suunto: 8\.00 km · 48:48 · 6:06\/km/);
  const en = buildMessage([mkRun('x')], 'strava', 'en', true);
  assert.match(en.body, /Strava/);
  assert.match(en.body, /4\.97 mi/);
  assert.match(en.body, /\/mi/);
  assert.equal(fmtPace(0, 5, false), '--:--');
});

test('varias carreras nuevas: un solo mensaje con el total', () => {
  const m = buildMessage([mkRun('a', { distanceKm: 5 }), mkRun('b', { distanceKm: 3 })], 'wahoo', 'es', false);
  assert.match(m.body, /2 entrenamientos de Wahoo \(8\.00 km en total\)/);
});

test('carrera nueva: se hace el merge y se manda la notificación con etiqueta', async () => {
  sent.length = 0;
  const db = { stored: new Set() };
  global.fetch = fakeFetch(db);
  let merged = 0;
  const run = mkRun('suunto_9');
  await mergeAndNotify(async () => { merged++; db.stored.add(run.id); return { merged: true }; }, 'http://db', {}, 'u1', [run], 'skip', 'suunto');
  assert.equal(merged, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].token, 'tok');
  assert.equal(sent[0].opts.tag, 'zancada-run-import');
  assert.match(sent[0].body, /Suunto/);
});

test('carrera que ya estaba guardada (evento de edición): no avisa', async () => {
  sent.length = 0;
  const run = mkRun('strava_5');
  const db = { stored: new Set([run.id]) };
  global.fetch = fakeFetch(db);
  await mergeAndNotify(async () => ({ merged: true }), 'http://db', {}, 'u1', [run], 'upsert', 'strava');
  assert.equal(sent.length, 0);
});

test('el merge la descartó por duplicada (ya llegó por otra marca): no avisa', async () => {
  sent.length = 0;
  global.fetch = fakeFetch({ stored: new Set() });
  await mergeAndNotify(async () => ({ merged: true }), 'http://db', {}, 'u1', [mkRun('wahoo_2')], 'skip', 'wahoo');
  assert.equal(sent.length, 0);
});

test('entreno viejo (relleno de historial) o usuario sin notificaciones: no avisa', async () => {
  sent.length = 0;
  const db = { stored: new Set() };
  global.fetch = fakeFetch(db);
  const old = mkRun('coros_1', { date: new Date(Date.now() - 5 * 86400000).toISOString() });
  await mergeAndNotify(async () => { db.stored.add(old.id); }, 'http://db', {}, 'u1', [old], 'skip', 'coros');
  assert.equal(sent.length, 0);

  const db2 = { stored: new Set(), subs: [] };
  global.fetch = fakeFetch(db2);
  const fresh = mkRun('coros_2');
  await mergeAndNotify(async () => { db2.stored.add(fresh.id); }, 'http://db', {}, 'u1', [fresh], 'skip', 'coros');
  assert.equal(sent.length, 0);
});

test('si la notificación falla, el merge igual termina bien', async () => {
  const db = { stored: new Set() };
  global.fetch = async (url) => { if (String(url).includes('push_subscriptions')) throw new Error('red caída'); return fakeFetch(db)(url); };
  const run = mkRun('polar_3');
  const r = await mergeAndNotify(async () => { db.stored.add(run.id); return { merged: true }; }, 'http://db', {}, 'u1', [run], 'skip', 'polar');
  assert.deepEqual(r, { merged: true });
});
