// Aviso de la noche "hoy tenías una salida y todavía no aparece cargada" (api/_lib/missing-run-nudge.js + api/send-reminders.js)
// y comparación con el plan en "Entrenamiento cargado" (api/_lib/notify-new-run.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const sent = [];
const fcmPath = require.resolve(path.join('..', 'api', '_lib', 'fcm.js'));
require.cache[fcmPath] = { id: fcmPath, filename: fcmPath, loaded: true, exports: { sendFcmPush: async (token, title, body) => { sent.push({ token, title, body }); return false; } } };
const nudge = require('../api/_lib/missing-run-nudge.js');
const { buildMessage, planFor } = require('../api/_lib/notify-new-run.js');

test('momento: solo a las 20:00-20:29 locales', () => {
  assert.equal(nudge.isNudgeTime(20, 0), true);
  assert.equal(nudge.isNudgeTime(20, 29), true);
  assert.equal(nudge.isNudgeTime(20, 30), false);
  assert.equal(nudge.isNudgeTime(19, 59), false);
  assert.equal(nudge.isNudgeTime(8, 0), false);
});

test('sessionDueToday: solo con el plan de esta semana, sesión planeada hoy y sin resolver', () => {
  const plan = [{ dist: 0 }, { dist: 5 }, { dist: 6, status: 'done' }, { dist: 7, status: 'skipped' }, {}, null, { dist: 8 }];
  assert.equal(nudge.sessionDueToday(plan, '2026-10-12', '2026-10-12', 1).dist, 5);
  assert.equal(nudge.sessionDueToday(plan, '2026-10-12', '2026-10-12', 0), null, 'descanso');
  assert.equal(nudge.sessionDueToday(plan, '2026-10-12', '2026-10-12', 2), null, 'ya hecha');
  assert.equal(nudge.sessionDueToday(plan, '2026-10-12', '2026-10-12', 3), null, 'saltada');
  assert.equal(nudge.sessionDueToday(plan, '2026-10-12', '2026-10-12', 5), null, 'día vacío');
  assert.equal(nudge.sessionDueToday(plan, '2026-10-05', '2026-10-12', 1), null, 'plan de una semana vieja');
  assert.equal(nudge.sessionDueToday(null, '2026-10-12', '2026-10-12', 1), null);
  assert.equal(nudge.sessionDueToday('texto', '2026-10-12', '2026-10-12', 1), null);
});

test('mondayOf: el lunes de la semana en curso, cualquier día y en el huso de la persona', () => {
  assert.equal(nudge.mondayOf(Date.parse('2026-10-13T20:00:00Z'), 'UTC', 1), '2026-10-12');   // martes
  assert.equal(nudge.mondayOf(Date.parse('2026-10-12T20:00:00Z'), 'UTC', 0), '2026-10-12');   // lunes
  assert.equal(nudge.mondayOf(Date.parse('2026-10-18T20:00:00Z'), 'UTC', 6), '2026-10-12');   // domingo
  assert.equal(nudge.mondayOf(Date.parse('2026-10-14T01:00:00Z'), 'America/Argentina/Buenos_Aires', 1), '2026-10-12');   // aún martes 22:00 en Argentina
});

test('texto: kilómetros, millas y minutos, limpio de saltos de línea, en los 6 idiomas', () => {
  assert.equal(nudge.describeSession({ dist: 8 }, 'Rodaje suave', false, false), 'Rodaje suave · 8.0 km');
  assert.equal(nudge.describeSession({ dist: 8 }, 'Easy', true, false), 'Easy · 5.0 mi');
  assert.equal(nudge.describeSession({ dist: 8, durMin: 45 }, 'Rodaje', false, true), 'Rodaje · 45 min');
  assert.equal(nudge.describeSession({ dist: 8 }, 'a\nb\r\n' + 'x'.repeat(100), false, false).includes('\n'), false);
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const m = nudge.buildNudge(l, 'X · 8.0 km');
    assert.equal(m.title, 'Zancada');
    assert.ok(m.body.includes('X · 8.0 km') && /Strava/.test(m.body), l);
  }
  assert.ok(nudge.buildNudge('zz', 'X').body.includes('Hoy tenías'), 'idioma desconocido cae a español');
});

test('ventana del día local: medianoche local en UTC y fecha local', () => {
  const w = nudge.localDayWindow('America/Argentina/Buenos_Aires', Date.parse('2026-10-21T23:30:00Z'));   // 20:30 del 21 en UTC-3
  assert.equal(w.dayKey, '2026-10-21');
  assert.equal(w.fromIso, '2026-10-21T03:00:00.000Z');
  const u = nudge.localDayWindow('UTC', Date.parse('2026-10-13T20:00:00Z'));
  assert.equal(u.fromIso, '2026-10-13T00:00:00.000Z');
  const t = nudge.localDayWindow('Asia/Tokyo', Date.parse('2026-10-13T20:00:00Z'));   // ya es el 14 en Tokio (UTC+9)
  assert.equal(t.dayKey, '2026-10-14');
  assert.equal(t.fromIso, '2026-10-13T15:00:00.000Z');
});

test('planFor: compara con el día del plan; descanso, plan viejo o datos raros no se comentan', () => {
  const plan = [{ dist: 0 }, { dist: 8, durMin: 50 }, { dist: 'x' }, {}, {}, {}, {}];
  const run = { date: '2026-10-13T11:00:00Z', distanceKm: 8.2, durationSec: 3000 };   // martes en UTC
  assert.deepEqual(planFor(run, plan, '2026-10-12', 'UTC', false), { timeMode: false, planned: 8, actual: 8.2 });
  assert.deepEqual(planFor(run, plan, '2026-10-12', 'UTC', true), { timeMode: true, planned: 50, actual: 50 });
  assert.equal(planFor({ ...run, date: '2026-10-12T11:00:00Z' }, plan, '2026-10-12', 'UTC', false), null, 'lunes = descanso');
  assert.equal(planFor({ ...run, date: '2026-10-14T11:00:00Z' }, plan, '2026-10-12', 'UTC', false), null, 'dist inválida');
  assert.equal(planFor({ ...run, date: '2026-10-20T11:00:00Z' }, plan, '2026-10-12', 'UTC', false), null, 'fuera de la semana del plan');
  assert.equal(planFor(run, plan, 'no-es-fecha', 'UTC', false), null);
  assert.equal(planFor(run, null, '2026-10-12', 'UTC', false), null);
  assert.equal(planFor({ date: 'basura' }, plan, '2026-10-12', 'UTC', false), null);
  // la carrera de las 23:30 hora Argentina del lunes ya es martes en UTC: se usa el huso de la persona
  assert.equal(planFor({ date: '2026-10-13T02:30:00Z', distanceKm: 5, durationSec: 1800 }, plan, '2026-10-12', 'America/Argentina/Buenos_Aires', false), null, 'lunes local');
});

test('"Entrenamiento cargado" suma la comparación con el plan (una carrera), no en varias', () => {
  const run = { id: 'a', distanceKm: 8.2, durationSec: 2928 };
  const withPlan = buildMessage([run], 'strava', 'es', false, { timeMode: false, planned: 8, actual: 8.2 });
  assert.match(withPlan.body, /Plan del día: 8\.00 km \(hiciste el 102%\)\./);
  assert.match(buildMessage([run], 'strava', 'en', true, { timeMode: false, planned: 8, actual: 8.2 }).body, /Today's plan: 4\.97 mi \(you did 102%\)\./);
  assert.match(buildMessage([run], 'strava', 'es', false, { timeMode: true, planned: 50, actual: 48.8 }).body, /Plan del día: 50 min \(hiciste el 98%\)\./);
  assert.doesNotMatch(buildMessage([run], 'strava', 'es', false).body, /Plan del día/);
  assert.doesNotMatch(buildMessage([run, run], 'strava', 'es', false, { timeMode: false, planned: 8, actual: 8 }).body, /Plan del día/);
  assert.match(buildMessage([run], 'strava', 'es', false, { timeMode: false, planned: 0.5, actual: 99999 }).body, /999%/, 'tope');
  for (const l of ['pt', 'fr', 'it', 'de']) assert.match(buildMessage([run], 'strava', l, false, { timeMode: false, planned: 8, actual: 8 }).body, /100/, l);
});

// ---- el cron completo ----
function fakeRes() {
  const r = { headers: {}, code: 200, body: null };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}
const registry = new Set();
async function runAt(isoUtc, user, rpc) {
  sent.length = 0;
  const RealDate = Date, fixed = new RealDate(isoUtc).getTime();
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    url = String(url);
    const ok = data => ({ ok: true, status: 200, json: async () => data, text: async () => '' });
    if (url.includes('/rpc/has_run_between')) {
      if (rpc === 'missing') return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
      return ok(rpc);
    }
    if (url.includes('/rest/v1/sent_notifications')) {
      if (opts && opts.method === 'POST') {
        const b = JSON.parse(opts.body), key = b.user_id + '|' + b.kind + '|' + b.period;
        if (registry.has(key)) return { ok: true, status: 201, json: async () => [], text: async () => '' };
        registry.add(key); return { ok: true, status: 201, json: async () => [b], text: async () => '' };
      }
      return ok([]);
    }
    if (url.includes('/rest/v1/push_subscriptions')) return ok([{ user_id: user.id, platform: 'android', subscription: { token: 'tok' } }]);
    if (url.includes('/rest/v1/app_state')) return ok([{ user_id: user.id, plan: user.plan, weekStart: user.weekStart, tz: 'UTC', rh: '8', lang: 'es', streak: '0', units: null, trainBy: user.trainBy || null }]);
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
const mkPlan = over => Array.from({ length: 7 }, (_, i) => Object.assign({ day: i, typeKey: 'easy', dist: 5, durMin: 40 }, over && over[i]));
const TUE = '2026-10-13';

test('cron: a las 20:00 con sesión planeada y sin carrera hoy manda el aviso, una sola vez por día', async () => {
  registry.clear();
  const user = { id: 'n1', plan: mkPlan(), weekStart: '2026-10-12' };
  const a = await runAt(TUE + 'T20:00:10Z', user, false);
  assert.equal(a.res.code, 200, JSON.stringify(a.res.body));
  assert.equal(a.sent.length, 1);
  assert.match(a.sent[0].body, /Hoy tenías Rodaje suave · 5\.0 km y todavía no aparece/);
  assert.equal(a.res.body.nudgeSent, 1);
  const b = await runAt(TUE + 'T20:00:40Z', user, false);   // una corrida repetida en la misma media hora
  assert.equal(b.sent.length, 0, 'ya se le mandó hoy');
});

test('cron: plan por tiempo muestra minutos', async () => {
  registry.clear();
  const a = await runAt(TUE + 'T20:00:10Z', { id: 'n2', plan: mkPlan(), weekStart: '2026-10-12', trainBy: 'time' }, false);
  assert.match(a.sent[0].body, /Rodaje suave · 40 min/);
});

test('cron: no manda si ya corrió, si la base no pudo contestar, fuera de las 20:00, o con la sesión ya resuelta o el plan viejo', async () => {
  registry.clear();
  const user = { id: 'n3', plan: mkPlan(), weekStart: '2026-10-12' };
  assert.equal((await runAt(TUE + 'T20:00:10Z', user, true)).sent.length, 0, 'ya hay una carrera hoy');
  assert.equal((await runAt(TUE + 'T20:00:10Z', user, 'missing')).sent.length, 0, 'la función de la base no existe: no se manda');
  assert.equal((await runAt(TUE + 'T20:30:10Z', user, false)).sent.length, 0, 'la corrida de :30 no manda');
  assert.equal((await runAt(TUE + 'T19:00:10Z', user, false)).sent.length, 0, 'antes de las 20:00');
  const done = { id: 'n4', plan: mkPlan({ 1: { status: 'done' } }), weekStart: '2026-10-12' };
  assert.equal((await runAt(TUE + 'T20:00:10Z', done, false)).sent.length, 0, 'sesión ya hecha');
  const stale = { id: 'n5', plan: mkPlan(), weekStart: '2026-10-05' };
  assert.equal((await runAt(TUE + 'T20:00:10Z', stale, false)).sent.length, 0, 'plan de otra semana');
  const rest = { id: 'n6', plan: mkPlan({ 1: { dist: 0 } }), weekStart: '2026-10-12' };
  assert.equal((await runAt(TUE + 'T20:00:10Z', rest, false)).sent.length, 0, 'día de descanso');
});
