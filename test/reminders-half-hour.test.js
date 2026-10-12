// send-reminders corre cada 30 minutos: el recordatorio diario NO puede salir duplicado, y el resumen semanal sale en un único turno.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const sent = [];
const fcmPath = require.resolve(path.join('..', 'api', '_lib', 'fcm.js'));
require.cache[fcmPath] = { id: fcmPath, filename: fcmPath, loaded: true, exports: { sendFcmPush: async (token, title, body) => { sent.push({ token, title, body }); return false; } } };
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

async function runAt(isoUtc, users) {
  sent.length = 0;
  const RealDate = Date;
  const fixed = new RealDate(isoUtc).getTime();
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    url = String(url);
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => '' });
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

test('resumen semanal SIN sesión el domingo: lo recibe en su turno (19:00-21:30) y en ningún otro', async () => {
  const id = userWithSlot(3, false);   // 20:30 local
  const users = [{ id, plan: planNoSunday, weekStart: '2026-10-05', runs: [{ date: '2026-10-08T10:00:00Z', distanceKm: 7 }] }];
  const inSlot = await runAt('2026-10-11T20:30:10Z', users);      // domingo 20:30 UTC
  assert.equal(inSlot.sent.filter(s => /Tu semana/.test(s.title)).length, 1);
  assert.equal(inSlot.res.body.weeklySent, 1);
  for (const t of ['2026-10-11T20:00:10Z', '2026-10-11T21:00:10Z', '2026-10-11T19:30:10Z', '2026-10-11T22:30:10Z', '2026-10-12T20:30:10Z']) {
    const r = await runAt(t, users);
    assert.equal(r.sent.filter(s => /Tu semana/.test(s.title)).length, 0, 'sin resumen a las ' + t);
  }
});

test('resumen semanal CON sesión el domingo: se posterga a la última instancia (22:00-23:30) y no sale antes', async () => {
  const id = userWithSlot(8, true);    // 23:00 local
  const users = [{ id, plan, weekStart: '2026-10-05', runs: [{ date: '2026-10-08T10:00:00Z', distanceKm: 7 }, { date: '2026-10-11T23:00:00Z', distanceKm: 10 }] }];
  for (const t of ['2026-10-11T19:00:10Z', '2026-10-11T20:30:10Z', '2026-10-11T21:30:10Z', '2026-10-11T22:30:10Z']) {
    const r = await runAt(t, users);
    assert.equal(r.sent.filter(s => /Tu semana/.test(s.title)).length, 0, 'todavía no a las ' + t);
  }
  const last = await runAt('2026-10-11T23:00:10Z', users);
  const m = last.sent.filter(s => /Tu semana/.test(s.title));
  assert.equal(m.length, 1);
  assert.match(m[0].body, /2 salidas/, 'ya incluye la salida del domingo a la noche');
});
