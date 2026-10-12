// send-reminders corre cada 30 minutos: el recordatorio diario NO puede salir duplicado, y el resumen semanal sale en un único turno.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const sent = [];
const fcmPath = require.resolve(path.join('..', 'api', '_lib', 'fcm.js'));
require.cache[fcmPath] = { id: fcmPath, filename: fcmPath, loaded: true, exports: { sendFcmPush: async (token, title, body) => { if (globalThis.__failPush) throw new Error('fcm caído'); sent.push({ token, title, body }); return false; } } };
const { weeklySlotOf } = require('../api/_lib/weekly-summary.js');

function fakeRes() {
  const r = { headers: {}, code: 200, body: null };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  r.send = b => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}

// 'u0'... hasta encontrar un usuario cuyo turno semanal sea el pedido
function userWithSlot(slot) { for (let i = 0; ; i++) if (weeklySlotOf('user-' + i) === slot) return 'user-' + i; }

// registro simulado de sent_notifications (clave user|kind|period); registry.available=false simula que la tabla no existe todavía
const registry = { rows: new Set(), available: true, failPush: false };
async function runAt(isoUtc, users) {
  sent.length = 0;
  const RealDate = Date;
  const fixed = new RealDate(isoUtc).getTime();
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    url = String(url);
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => '' });
    if (url.includes('/rest/v1/sent_notifications')) {
      if (!registry.available) return { ok: false, status: 404, json: async () => ({ code: 'PGRST205' }), text: async () => '' };
      if (opts && opts.method === 'POST') {
        const b = JSON.parse(opts.body), key = b.user_id + '|' + b.kind + '|' + b.period;
        if (registry.rows.has(key)) return { ok: true, status: 201, json: async () => [], text: async () => '' };
        registry.rows.add(key); return { ok: true, status: 201, json: async () => [b], text: async () => '' };
      }
      if (opts && opts.method === 'DELETE') {
        const q = new URL(url).searchParams;
        if (q.get('user_id')) registry.rows.delete(q.get('user_id').replace('eq.', '') + '|' + q.get('kind').replace('eq.', '') + '|' + q.get('period').replace('eq.', ''));
        return ok([]);
      }
      const q = new URL(url).searchParams, kind = q.get('kind').replace('eq.', ''), period = q.get('period').replace('eq.', '');
      const ids = q.get('user_id').replace(/^in\.\(|\)$/g, '').split(',');
      return ok(ids.filter(id => registry.rows.has(id + '|' + kind + '|' + period)).map(id => ({ user_id: id })));
    }
    if (url.includes('/rest/v1/push_subscriptions')) return ok(users.map(u => ({ user_id: u.id, platform: 'android', subscription: { token: 'tok-' + u.id } })));
    if (url.includes('select=runs:')) { const id = url.match(/user_id=eq\.([^&]+)/)[1]; return ok([{ runs: users.find(u => u.id === id).runs }]); }
    if (url.includes('/rest/v1/app_state')) return ok(users.map(u => ({ user_id: u.id, plan: u.plan, weekStart: u.weekStart, tz: 'UTC', rh: '8', lang: 'es', streak: '0', units: null })));
    return ok([]);
  };
  process.env.CRON_SECRET = 'test-secret'; process.env.SUPABASE_URL = 'https://x.test'; process.env.SUPABASE_SERVICE_KEY = 'k';
  const vapid = require('web-push').generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = vapid.publicKey; process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  try {
    delete require.cache[require.resolve('../api/send-reminders')];
    const handler = require('../api/send-reminders');
    const res = fakeRes();
    await handler({ headers: { authorization: 'Bearer test-secret' }, url: '/api/send-reminders', method: 'GET' }, res);
    return { res, sent: sent.slice() };
  } finally { global.Date = RealDate; global.fetch = realFetch; }
}

const plan = Array.from({ length: 7 }, (_, i) => ({ day: i, typeKey: 'easy', dist: 5 }));

test('recordatorio diario: sale en la corrida de :00 y NO en la de :30 (no se duplica)', async () => {
  // martes 13/10/2026 (no es domingo), 08:00 y 08:30 UTC; el usuario tiene huso UTC y quiere el aviso a las 8
  const users = [{ id: 'u1', plan, weekStart: '2026-10-12', runs: [] }];
  const a = await runAt('2026-10-13T08:00:10Z', users);
  assert.equal(a.res.code, 200, JSON.stringify(a.res.body));
  assert.equal(a.sent.filter(s => s.title === 'Zancada' && /Hoy toca/.test(s.body)).length, 1);
  const b = await runAt('2026-10-13T08:30:10Z', users);
  assert.equal(b.sent.length, 0, 'la corrida de :30 no manda el recordatorio diario otra vez');
});

// usuario cuyo turno (normal o tardío) sea el pedido
function userWithSlot(slot, sunday) { for (let i = 0; ; i++) if (weeklySlotOf('user-' + i, sunday) === slot) return 'user-' + i; }
const planNoSunday = plan.map((d, i) => i === 6 ? { ...d, dist: 0 } : d);
const weekly = (r) => r.sent.filter(s => /Tu semana/.test(s.title));
const resetRegistry = () => { registry.rows.clear(); registry.available = true; globalThis.__failPush = false; };
const lastWeek = [{ date: '2026-10-08T10:00:00Z', distanceKm: 7 }];

test('resumen semanal SIN sesión el domingo: sale desde su turno (19:00-21:30), una sola vez, y no antes', async () => {
  resetRegistry();
  const id = userWithSlot(3, false);   // 20:30 local
  const users = [{ id, plan: planNoSunday, weekStart: '2026-10-05', runs: lastWeek }];
  for (const t of ['2026-10-11T19:00:10Z', '2026-10-11T20:00:10Z']) assert.equal(weekly(await runAt(t, users)).length, 0, 'todavía no a las ' + t);
  const inSlot = await runAt('2026-10-11T20:30:10Z', users);
  assert.equal(weekly(inSlot).length, 1);
  assert.equal(inSlot.res.body.weeklySent, 1);
  for (const t of ['2026-10-11T21:00:10Z', '2026-10-11T22:30:10Z', '2026-10-11T23:30:10Z']) assert.equal(weekly(await runAt(t, users)).length, 0, 'ya recibido: no se repite a las ' + t);
  assert.equal(weekly(await runAt('2026-10-12T20:30:10Z', users)).length, 0, 'el lunes ya no es del resumen');
});

test('resumen semanal CON sesión el domingo: se posterga a la última instancia (22:00-23:30)', async () => {
  resetRegistry();
  const id = userWithSlot(8, true);    // 23:00 local
  const users = [{ id, plan, weekStart: '2026-10-05', runs: [...lastWeek, { date: '2026-10-11T23:00:00Z', distanceKm: 10 }] }];
  for (const t of ['2026-10-11T19:00:10Z', '2026-10-11T20:30:10Z', '2026-10-11T21:30:10Z', '2026-10-11T22:30:10Z']) assert.equal(weekly(await runAt(t, users)).length, 0, 'todavía no a las ' + t);
  const m = weekly(await runAt('2026-10-11T23:00:10Z', users));
  assert.equal(m.length, 1);
  assert.match(m[0].body, /2 salidas/, 'ya incluye la salida del domingo a la noche');
});

test('con la sesión del domingo ya marcada como hecha, el resumen no espera a la última instancia', async () => {
  resetRegistry();
  const planDone = plan.map((d, i) => i === 6 ? { ...d, status: 'done' } : d);
  const id = userWithSlot(1, false);   // 19:30 local
  const users = [{ id, plan: planDone, weekStart: '2026-10-05', runs: lastWeek }];
  assert.equal(weekly(await runAt('2026-10-11T19:30:10Z', users)).length, 1);
});

test('REINTENTO: si en su turno la corrida falló, la corrida siguiente de la noche lo manda (y solo una vez)', async () => {
  resetRegistry();
  const id = userWithSlot(2, false);   // 20:00 local
  const users = [{ id, plan: planNoSunday, weekStart: '2026-10-05', runs: lastWeek }];
  globalThis.__failPush = true;                                   // el servicio de push falla justo en su turno
  assert.equal(weekly(await runAt('2026-10-11T20:00:10Z', users)).length, 0);
  assert.equal(registry.rows.size, 0, 'el envío fallido devolvió el reclamo (queda para reintentar)');
  globalThis.__failPush = false;
  const retry = await runAt('2026-10-11T20:30:10Z', users);        // 30 minutos después
  assert.equal(weekly(retry).length, 1);
  assert.equal(retry.res.body.weeklyRetried, 1);
  assert.equal(weekly(await runAt('2026-10-11T21:00:10Z', users)).length, 0, 'ya recibido: no se duplica');
});

test('un usuario sin salidas esta semana queda registrado y no se reevalúa en cada corrida', async () => {
  resetRegistry();
  const id = userWithSlot(0, false);
  const users = [{ id, plan: planNoSunday, weekStart: '2026-10-05', runs: [{ date: '2026-09-20T10:00:00Z', distanceKm: 5 }] }];
  assert.equal(weekly(await runAt('2026-10-11T19:00:10Z', users)).length, 0);
  assert.equal(registry.rows.size, 1, 'queda atendido');
});

test('sin la tabla sent_notifications (todavía no creada): sigue funcionando solo en el turno exacto, sin duplicar', async () => {
  resetRegistry(); registry.available = false;
  const id = userWithSlot(3, false);
  const users = [{ id, plan: planNoSunday, weekStart: '2026-10-05', runs: lastWeek }];
  assert.equal(weekly(await runAt('2026-10-11T20:00:10Z', users)).length, 0);
  const r = await runAt('2026-10-11T20:30:10Z', users);
  assert.equal(weekly(r).length, 1);
  assert.equal(r.res.body.weeklyRegistry, false);
  assert.equal(weekly(await runAt('2026-10-11T21:00:10Z', users)).length, 0);
});
