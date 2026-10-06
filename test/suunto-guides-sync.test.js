const test = require('node:test');
const assert = require('node:assert');

const { syncGuides, localDateParts, addDaysIso, mondayOfIso } = require('../api/_lib/suunto-guides-sync');

process.env.SUUNTO_SUBSCRIPTION_KEY = 'sub-key';
process.env.SUPABASE_URL = 'http://sb';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.CRON_SECRET = 'cron-secret';
process.env.SUUNTO_CLIENT_ID = 'cid';
process.env.SUUNTO_CLIENT_SECRET = 'sec';

const ZONES = { 1: { min: 95, max: 114 }, 2: { min: 115, max: 133 }, 3: { min: 134, max: 152 }, 4: { min: 153, max: 171 }, 5: { min: 172, max: 190 } };
const LABELS = { warmup: 'Calentamiento', cooldown: 'Vuelta calma', work: 'Fuerte', rest: 'Suave' };
const day = (date, name) => ({ date, name, typeKey: 'easy', zone: 2, distKm: 6, desc: name, interval: null, repSec: 0 });

test('fechas: lunes de una fecha y suma de días', () => {
  assert.strictEqual(mondayOfIso('2026-10-07'), '2026-10-05'); // miércoles -> lunes
  assert.strictEqual(mondayOfIso('2026-10-05'), '2026-10-05'); // lunes
  assert.strictEqual(mondayOfIso('2026-10-11'), '2026-10-05'); // domingo
  assert.strictEqual(addDaysIso('2026-10-30', 3), '2026-11-02');
});

test('localDateParts: lunes 2:30 am en Argentina es todavía domingo en UTC', () => {
  // 2026-10-05 05:30 UTC = lunes 2:30 am en Buenos Aires (UTC-3)
  const now = Date.UTC(2026, 9, 5, 5, 30);
  const ar = localDateParts('America/Argentina/Buenos_Aires', now);
  assert.deepStrictEqual(ar, { date: '2026-10-05', hour: 2 });
  const utc = localDateParts('UTC', now);
  assert.deepStrictEqual(utc, { date: '2026-10-05', hour: 5 });
  // 1:30 am en Buenos Aires = 04:30 UTC: todavía no son las 2
  assert.strictEqual(localDateParts('America/Argentina/Buenos_Aires', Date.UTC(2026, 9, 5, 4, 30)).hour, 1);
  // zona inválida: cae a UTC sin tirar
  assert.strictEqual(localDateParts('No/Existe', now).hour, 5);
});

function mockSuunto(existing) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url), m = opts.method || 'GET';
    calls.push(`${m} ${u.replace('https://cloudapi.suunto.com/v2/guides', '')}`);
    if (u.endsWith('/items')) return { ok: true, status: 200, json: async () => ({ payload: existing }) };
    return { ok: true, status: m === 'POST' ? 201 : 200, text: async () => '', json: async () => ({}) };
  };
  return calls;
}
const g = (id, date) => ({ id, owner: 'Zancada', externalId: 'zancada-' + date });

test('syncGuides (reconcile): actualiza la existente, crea la nueva y borra la que sobra', async () => {
  const calls = mockSuunto([g('idMon', '2026-10-05'), g('idTue', '2026-10-06'), { id: 'other', owner: 'OtraApp', externalId: 'zancada-2026-10-08' }]);
  const out = await syncGuides('tok', {
    days: [day('2026-10-05', 'Lunes'), day('2026-10-07', 'Miercoles')],
    zones: ZONES, labels: LABELS,
    keepDates: new Set(['2026-10-05', '2026-10-07'])
  });
  assert.strictEqual(out.pushed, 2);
  assert.strictEqual(out.removed, 1);
  assert.deepStrictEqual(out.pushedDates.sort(), ['2026-10-05', '2026-10-07']);
  // sube de la fecha más lejana a la más cercana
  const uploads = calls.filter(c => c.startsWith('POST') || c.startsWith('PUT'));
  assert.deepStrictEqual(uploads, ['POST /files', 'PUT /files/idMon']);
  assert.ok(calls.includes('DELETE /files/idTue'));
  assert.ok(!calls.some(c => c.includes('other')), 'no toca guías de otras apps');
});

test('syncGuides: keepDates vacío borra todas las guías de Zancada', async () => {
  const calls = mockSuunto([g('a', '2026-10-05'), g('b', '2026-10-06')]);
  const out = await syncGuides('tok', { days: [], zones: ZONES, labels: LABELS, keepDates: new Set() });
  assert.strictEqual(out.removed, 2);
  assert.strictEqual(calls.filter(c => c.startsWith('DELETE')).length, 2);
});

test('syncGuides (manual): solo borra las anteriores a hoy', async () => {
  const calls = mockSuunto([g('old', '2026-10-01'), g('future', '2026-10-09')]);
  const out = await syncGuides('tok', { days: [day('2026-10-07', 'Mie')], zones: ZONES, labels: LABELS, keepDates: null, today: '2026-10-05' });
  assert.strictEqual(out.removed, 1);
  assert.ok(calls.includes('DELETE /files/old'));
  assert.ok(!calls.includes('DELETE /files/future'));
});

test('syncGuides: PUT 404 (la guía ya no existe) la vuelve a crear con POST', async () => {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url), m = opts.method || 'GET';
    calls.push(m + ' ' + u.replace('https://cloudapi.suunto.com/v2/guides', ''));
    if (u.endsWith('/items')) return { ok: true, status: 200, json: async () => ({ payload: [g('gone', '2026-10-07')] }) };
    if (m === 'PUT') return { ok: false, status: 404, text: async () => '{"error":{"code":"404"}}', json: async () => ({}) };
    return { ok: true, status: 201, text: async () => '', json: async () => ({}) };
  };
  const out = await syncGuides('tok', { days: [day('2026-10-07', 'Mie')], zones: ZONES, labels: LABELS, keepDates: new Set(['2026-10-07']) });
  assert.strictEqual(out.pushed, 1);
  assert.strictEqual(out.failed, 0);
  assert.deepStrictEqual(calls.filter(c => c.startsWith('PUT') || c.startsWith('POST')), ['PUT /files/gone', 'POST /files']);
});

test('syncGuides: POST 409 (ya existía) re-lista y la actualiza con PUT', async () => {
  const calls = [];
  let listCount = 0;
  global.fetch = async (url, opts = {}) => {
    const u = String(url), m = opts.method || 'GET';
    calls.push(m + ' ' + u.replace('https://cloudapi.suunto.com/v2/guides', ''));
    if (u.endsWith('/items')) { listCount++; return { ok: true, status: 200, json: async () => ({ payload: listCount === 1 ? [] : [g('late', '2026-10-07')] }) }; }
    if (m === 'POST') return { ok: false, status: 409, text: async () => 'dup', json: async () => ({}) };
    return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
  };
  const out = await syncGuides('tok', { days: [day('2026-10-07', 'Mie')], zones: ZONES, labels: LABELS, keepDates: new Set(['2026-10-07']) });
  assert.strictEqual(out.pushed, 1);
  assert.ok(calls.includes('PUT /files/late'));
});

test('syncGuides: si no se puede listar, no sube nada (evita duplicar)', async () => {
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' });
  const out = await syncGuides('tok', { days: [day('2026-10-07', 'x')], zones: ZONES, labels: LABELS, keepDates: new Set(['2026-10-07']) });
  assert.strictEqual(out.listFailed, true);
  assert.strictEqual(out.pushed, 0);
});

// ---------- cron de los lunes ----------
const cron = require('../api/suunto-guides-cron');
const mkRes = () => ({ code: 200, body: null, headersSent: false, status(c) { this.code = c; return this; }, json(o) { this.body = o; this.headersSent = true; return this; } });

function mockCronWorld({ guidesWeek, tz, nowMs, plan }) {
  const calls = [];
  const realNow = Date.now;
  Date.now = () => nowMs;
  global.fetch = async (url, opts = {}) => {
    const u = String(url), m = opts.method || 'GET';
    calls.push(`${m} ${u.replace('http://sb', '').replace('https://cloudapi.suunto.com', '')}`);
    if (u.includes('/rest/v1/suunto_connections?select=')) return { ok: true, json: async () => [{ user_id: 'u1', guides_week: guidesWeek, access_token: 't', refresh_token: 'r', expires_at: Math.floor(nowMs / 1000) + 3600 }] };
    if (u.includes('/rest/v1/app_state')) return { ok: true, json: async () => [{ plan, tz, auto: null }] };
    if (u.endsWith('/v2/guides/items')) return { ok: true, status: 200, json: async () => ({ payload: [g('oldSun', '2026-10-04')] }) };
    return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
  };
  return { calls, restore: () => { Date.now = realNow; } };
}
const PLAN = {
  zones: ZONES, labels: LABELS,
  days: [day('2026-10-04', 'Domingo viejo'), day('2026-10-06', 'Martes'), day('2026-10-08', 'Jueves'), day('2026-10-13', 'Martes que viene')]
};

test('cron: lunes 2:30 am locales con semana nueva -> sube la semana y borra la vieja', async () => {
  const w = mockCronWorld({ guidesWeek: '2026-09-28', tz: 'America/Argentina/Buenos_Aires', nowMs: Date.UTC(2026, 9, 5, 5, 30), plan: PLAN });
  const res = mkRes();
  await cron({ headers: { authorization: 'Bearer cron-secret' }, url: '/api/suunto-guides-cron' }, res);
  w.restore();
  assert.strictEqual(res.body.synced, 1);
  assert.ok(w.calls.includes('DELETE /v2/guides/files/oldSun'), 'borra la guía de la semana pasada');
  assert.strictEqual(w.calls.filter(c => c.startsWith('POST /v2/guides/files')).length, 2, 'sube solo martes y jueves de ESTA semana');
  assert.ok(w.calls.some(c => c.startsWith('PATCH /rest/v1/suunto_connections')), 'marca la semana reconciliada');
});

test('cron: antes de las 2 am locales no hace nada (ni llama a Suunto)', async () => {
  const w = mockCronWorld({ guidesWeek: '2026-09-28', tz: 'America/Argentina/Buenos_Aires', nowMs: Date.UTC(2026, 9, 5, 4, 30), plan: PLAN });
  const res = mkRes();
  await cron({ headers: { authorization: 'Bearer cron-secret' }, url: '/' }, res);
  w.restore();
  assert.strictEqual(res.body.early, 1);
  assert.ok(!w.calls.some(c => c.includes('/v2/guides')));
});

test('cron: semana ya reconciliada (por la app) no repite nada', async () => {
  const w = mockCronWorld({ guidesWeek: '2026-10-05', tz: 'America/Argentina/Buenos_Aires', nowMs: Date.UTC(2026, 9, 5, 8, 0), plan: PLAN });
  const res = mkRes();
  await cron({ headers: { authorization: 'Bearer cron-secret' }, url: '/' }, res);
  w.restore();
  assert.strictEqual(res.body.done, 1);
  assert.ok(!w.calls.some(c => c.includes('/v2/guides')));
});

test('cron: sin la columna guides_week no hace nada (protege la cuota)', async () => {
  const calls = [];
  const realNow = Date.now; Date.now = () => Date.UTC(2026, 9, 5, 8, 0);
  global.fetch = async (url) => { calls.push(String(url)); return { ok: true, json: async () => [{ user_id: 'u1', access_token: 't', refresh_token: 'r', expires_at: 9999999999 }] }; };
  const res = mkRes();
  await cron({ headers: { authorization: 'Bearer cron-secret' }, url: '/' }, res);
  Date.now = realNow;
  assert.strictEqual(res.body.nocolumn, 1);
  assert.ok(!calls.some(c => c.includes('app_state') || c.includes('/v2/guides')));
});

test('cron: sin secret correcto responde 401', async () => {
  const res = mkRes();
  await cron({ headers: { authorization: 'Bearer nope' }, url: '/' }, res);
  assert.strictEqual(res.code, 401);
});
