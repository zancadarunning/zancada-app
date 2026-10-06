const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = 'http://sb';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.CRON_SECRET = 'cron-secret';
process.env.WAHOO_CLIENT_ID = 'cid';
process.env.WAHOO_CLIENT_SECRET = 'sec';

const { buildWahooPlan, planToDataUri, planHash, workoutStartsISO } = require('../api/_lib/wahoo-plan-builder');
const { syncWahooPlans } = require('../api/_lib/wahoo-plans-sync');
const { cleanKnown } = require('../api/_lib/watch-plan-clean');

const ZONES = { 1: { min: 95, max: 114 }, 2: { min: 115, max: 133 }, 3: { min: 134, max: 152 }, 4: { min: 153, max: 171 }, 5: { min: 172, max: 190 } };
const LABELS = { warmup: 'Calentamiento', cooldown: 'Vuelta calma', work: 'Fuerte', rest: 'Suave', main: 'Rodaje' };
const easy = (date, name = 'Rodaje suave') => ({ date, name, typeKey: 'easy', zone: 2, distKm: 6, durMin: 40, desc: name, interval: null, repSec: 0 });
const series = (date) => ({ date, name: 'Series', typeKey: 'intervals', zone: 4, distKm: 8, durMin: 50, desc: 'Series', interval: { reps: 8, repMeters: 400, recoveryMin: 2 }, repSec: 0 });

test('plan.json: series = calentamiento + grupo repeat (reps-1) + vuelta a la calma', () => {
  const p = buildWahooPlan(series('2026-10-07'), ZONES, LABELS);
  assert.strictEqual(p.header.version, '1.0.0');
  assert.strictEqual(p.header.workout_type_family, 1);
  assert.strictEqual(p.header.workout_type_location, 1);
  assert.deepStrictEqual(p.intervals.map(i => i.exit_trigger_type), ['time', 'repeat', 'time']);
  const rep = p.intervals[1];
  assert.strictEqual(rep.exit_trigger_value, 7, '8 repeticiones = 7 después de la primera');
  assert.strictEqual(rep.intervals.length, 2);
  assert.deepStrictEqual([rep.intervals[0].exit_trigger_type, rep.intervals[0].exit_trigger_value], ['distance', 400]);
  assert.deepStrictEqual(rep.intervals[0].targets, [{ type: 'hr', low: 153, high: 171 }]); // zona 4
  assert.deepStrictEqual([rep.intervals[1].exit_trigger_type, rep.intervals[1].exit_trigger_value, rep.intervals[1].intensity_type], ['time', 120, 'recover']);
  assert.strictEqual(p.intervals[0].intensity_type, 'wu');
  assert.strictEqual(p.intervals[2].intensity_type, 'cd');
  assert.ok(!('targets' in rep), 'un intervalo repeat no lleva targets');
});

test('plan.json: rodaje continuo = un solo intervalo por distancia con objetivo de pulso', () => {
  const p = buildWahooPlan(easy('2026-10-08'), ZONES, LABELS);
  assert.strictEqual(p.intervals.length, 1);
  assert.deepStrictEqual([p.intervals[0].exit_trigger_type, p.intervals[0].exit_trigger_value], ['distance', 6000]);
  assert.deepStrictEqual(p.intervals[0].targets, [{ type: 'hr', low: 115, high: 133 }]);
});

test('plan.json: fartlek por tiempo y sin zonas no rompe ni inventa targets', () => {
  const p = buildWahooPlan({ date: '2026-10-09', name: 'Fartlek', typeKey: 'fartlek', zone: null, distKm: 7, interval: { reps: 6, workMin: 2, restMin: 2 } }, {}, LABELS);
  const rep = p.intervals.find(i => i.exit_trigger_type === 'repeat');
  assert.strictEqual(rep.exit_trigger_value, 5);
  assert.deepStrictEqual([rep.intervals[0].exit_trigger_type, rep.intervals[0].exit_trigger_value], ['time', 120]);
  assert.ok(!JSON.stringify(p).includes('"targets"'));
});

test('plan: data URI base64 que decodifica al mismo JSON, y hash estable', () => {
  const p = buildWahooPlan(easy('2026-10-08'), ZONES, LABELS);
  const uri = planToDataUri(p);
  assert.ok(uri.startsWith('data:application/json;base64,'));
  assert.deepStrictEqual(JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf8')), JSON.parse(JSON.stringify(p)));
  assert.strictEqual(planHash(p), planHash(buildWahooPlan(easy('2026-10-08'), ZONES, LABELS)));
  assert.notStrictEqual(planHash(p), planHash(buildWahooPlan(easy('2026-10-08', 'Otro nombre'), ZONES, LABELS)));
});

test('workoutStartsISO: 7:00 am hora local (Argentina = offset 180)', () => {
  assert.strictEqual(workoutStartsISO('2026-10-07', 180), '2026-10-07T10:00:00.000Z');
  assert.strictEqual(workoutStartsISO('2026-10-07', -540), '2026-10-06T22:00:00.000Z'); // Japón
});

test('cleanKnown: descarta fechas y ids con formato raro', () => {
  const k = cleanKnown({ '2026-10-07': { workoutId: 123, planId: 45 }, 'no-fecha': { workoutId: 1 }, '2026-10-08': { workoutId: '../x', planId: 1 } });
  assert.deepStrictEqual(k, { '2026-10-07': { workoutId: '123', planId: '45' } });
});

// ---------- API de Wahoo simulada ----------
function mockWahoo(opts = {}) {
  const calls = [];
  let nextId = 100;
  const existing = opts.existingWorkouts || [];
  global.fetch = async (url, init = {}) => {
    const u = String(url).replace('https://api.wahooligan.com', '');
    const m = init.method || 'GET';
    const bodyStr = init.body instanceof URLSearchParams ? init.body.toString() : (init.body || '');
    calls.push({ m, u, body: bodyStr, ct: init.headers && init.headers['Content-Type'] });
    const hdr = (rem) => ({ get: (n) => (n.toLowerCase() === 'x-ratelimit-remaining' ? rem : null) });
    const rem = opts.remaining ? opts.remaining(calls.length) : '4000, 900, 150';
    const mk = (status, json) => ({ ok: status >= 200 && status < 300, status, headers: hdr(rem), json: async () => json, text: async () => JSON.stringify(json || '') });
    if (m === 'GET' && u.startsWith('/v1/workouts')) return mk(200, { workouts: existing, total: existing.length, page: 1, per_page: 30 });
    if (m === 'POST' && u === '/v1/plans') {
      if (opts.planStatus) {
        const st = opts.planStatus(calls.filter(c => c.u === '/v1/plans').length, init);
        if (st) return mk(st, { error: 'x' });
      }
      return mk(201, { id: nextId++ });
    }
    if (m === 'POST' && u === '/v1/workouts') return mk(201, { id: nextId++ });
    if (m === 'PUT' && u.startsWith('/v1/workouts/')) return mk(200, { id: Number(u.split('/').pop()) });
    if (m === 'DELETE') return mk(200, {});
    return mk(404, {});
  };
  return calls;
}

test('sync Wahoo: día nuevo = POST plan y después POST workout apuntando a ese plan', async () => {
  const calls = mockWahoo();
  const out = await syncWahooPlans('tok', 'user1', { days: [easy('2026-10-07')], removeDates: [], zones: ZONES, labels: LABELS, tzOffsetMin: 180, known: {} });
  assert.strictEqual(out.pushed, 1);
  assert.strictEqual(out.failed, 0);
  const plan = calls.find(c => c.u === '/v1/plans');
  const wk = calls.find(c => c.m === 'POST' && c.u === '/v1/workouts');
  assert.ok(plan.body.includes('plan%5Bfile%5D=data%3Aapplication%2Fjson%3Bbase64'), 'plan[file] como data URI');
  assert.ok(plan.body.includes('plan%5Bexternal_id%5D=zancada-2026-10-07-'));
  const planId = out.pushedMap['2026-10-07'].planId;
  assert.ok(wk.body.includes('workout%5Bplan_id%5D=' + planId));
  assert.ok(wk.body.includes('workout%5Bworkout_token%5D=zancada_user1_2026-10-07'));
  assert.ok(wk.body.includes('workout%5Bworkout_type_id%5D=1'));
  assert.ok(wk.body.includes('workout%5Bstarts%5D=2026-10-07T10%3A00%3A00.000Z'));
  assert.ok(calls.findIndex(c => c.u === '/v1/plans') < calls.findIndex(c => c.u === '/v1/workouts' && c.m === 'POST'));
});

test('sync Wahoo: día ya conocido = plan nuevo, PUT del workout y se borra el plan viejo', async () => {
  const calls = mockWahoo();
  const out = await syncWahooPlans('tok', 'user1', { days: [easy('2026-10-07', 'Cambiado')], removeDates: [], zones: ZONES, labels: LABELS, tzOffsetMin: 180, known: { '2026-10-07': { workoutId: '55', planId: '44' } } });
  assert.strictEqual(out.pushed, 1);
  assert.ok(calls.some(c => c.m === 'PUT' && c.u === '/v1/workouts/55'));
  assert.ok(!calls.some(c => c.m === 'POST' && c.u === '/v1/workouts'), 'no crea otro workout');
  assert.ok(calls.some(c => c.m === 'DELETE' && c.u === '/v1/plans/44'), 'borra el plan viejo');
  assert.ok(!calls.some(c => c.m === 'GET'), 'sin listar la cuenta cuando los ids se conocen');
  assert.strictEqual(out.pushedMap['2026-10-07'].workoutId, 55);
});

test('sync Wahoo: ids desconocidos -> adopta el workout existente por workout_token (no duplica)', async () => {
  const calls = mockWahoo({ existingWorkouts: [{ id: 77, workout_token: 'zancada_user1_2026-10-07', plan_id: 33 }, { id: 78, workout_token: 'otra_cosa' }] });
  const out = await syncWahooPlans('tok', 'user1', { days: [easy('2026-10-07')], removeDates: [], zones: ZONES, labels: LABELS, tzOffsetMin: 0, known: {} });
  assert.strictEqual(out.pushed, 1);
  assert.ok(calls.some(c => c.m === 'PUT' && c.u === '/v1/workouts/77'));
  assert.ok(calls.some(c => c.m === 'DELETE' && c.u === '/v1/plans/33'));
});

test('sync Wahoo: fechas a borrar eliminan workout y plan', async () => {
  const calls = mockWahoo();
  const out = await syncWahooPlans('tok', 'user1', { days: [], removeDates: ['2026-10-06'], zones: ZONES, labels: LABELS, tzOffsetMin: 0, known: { '2026-10-06': { workoutId: '60', planId: '61' } } });
  assert.strictEqual(out.removed, 1);
  assert.deepStrictEqual(out.removedDates, ['2026-10-06']);
  assert.ok(calls.some(c => c.m === 'DELETE' && c.u === '/v1/workouts/60'));
  assert.ok(calls.some(c => c.m === 'DELETE' && c.u === '/v1/plans/61'));
});

test('sync Wahoo: si el servidor rechaza el formato form del plan, reintenta en JSON', async () => {
  const calls = mockWahoo({ planStatus: (n) => (n === 1 ? 422 : 0) });
  const out = await syncWahooPlans('tok', 'user1', { days: [easy('2026-10-07')], removeDates: [], zones: ZONES, labels: LABELS, tzOffsetMin: 0, known: {} });
  assert.strictEqual(out.pushed, 1);
  const plans = calls.filter(c => c.u === '/v1/plans');
  assert.strictEqual(plans.length, 2);
  assert.strictEqual(plans[1].ct, 'application/json');
  assert.ok(JSON.parse(plans[1].body).plan.external_id.startsWith('zancada-2026-10-07-'));
});

test('sync Wahoo: 403 al crear el plan (token sin plans_write) = reconnect_needed y corta', async () => {
  const calls = mockWahoo({ planStatus: () => 403 });
  const out = await syncWahooPlans('tok', 'user1', { days: [easy('2026-10-07'), easy('2026-10-08')], removeDates: [], zones: ZONES, labels: LABELS, tzOffsetMin: 0, known: {} });
  assert.strictEqual(out.reason, 'reconnect_needed');
  assert.strictEqual(out.pushed, 0);
  assert.strictEqual(calls.filter(c => c.u === '/v1/plans').length, 1, 'no insiste con el resto de los días');
});

test('sync Wahoo: poca cuota restante corta el envío y lo marca rate_limited', async () => {
  // la cuota de 5 minutos baja a 1 después de la segunda llamada
  const calls = mockWahoo({ remaining: (n) => (n >= 2 ? '4000, 900, 1' : '4000, 900, 20') });
  const out = await syncWahooPlans('tok', 'user1', { days: [easy('2026-10-07'), easy('2026-10-08'), easy('2026-10-09')], removeDates: [], zones: ZONES, labels: LABELS, tzOffsetMin: 0, known: {} });
  assert.strictEqual(out.reason, 'rate_limited');
  assert.ok(out.pushed < 3);
  assert.ok(calls.length <= 3, 'no sigue llamando con la cuota agotada');
});

// ---------- cron de los lunes ----------
const cron = require('../api/wahoo-plans-cron');
const mkRes = () => ({ code: 200, body: null, headersSent: false, status(c) { this.code = c; return this; }, json(o) { this.body = o; this.headersSent = true; return this; } });

function cronWorld({ plansWeek, withColumn = true, tz, nowMs }) {
  const calls = [];
  const realNow = Date.now;
  Date.now = () => nowMs;
  const conn = { user_id: 'u1', access_token: 't', refresh_token: 'r', expires_at: Math.floor(nowMs / 1000) + 3600 };
  if (withColumn) conn.plans_week = plansWeek;
  global.fetch = async (url, init = {}) => {
    const u = String(url), m = init.method || 'GET';
    calls.push(`${m} ${u.replace('http://sb', '').replace('https://api.wahooligan.com', '')}`);
    const hdr = { get: () => '4000, 900, 150' };
    const ok = (json, status = 200) => ({ ok: true, status, headers: hdr, json: async () => json, text: async () => '' });
    if (u.includes('/rest/v1/wahoo_connections?select=')) return ok([conn]);
    if (u.includes('/rest/v1/app_state')) {
      return ok([{ tz, auto: null, known: null, plan: { zones: ZONES, labels: LABELS, days: [
        { date: '2026-10-04', name: 'Viejo', typeKey: 'easy', zone: 2, distKm: 5 },
        { date: '2026-10-06', name: 'Martes', typeKey: 'easy', zone: 2, distKm: 6, durMin: 40 },
        { date: '2026-10-13', name: 'Martes que viene', typeKey: 'easy', zone: 2, distKm: 6 }
      ] } }]);
    }
    if (u.includes('/v1/plans')) return ok({ id: 900 }, 201);
    if (u.includes('/v1/workouts') && m === 'POST') return ok({ id: 901 }, 201);
    if (u.includes('/v1/workouts') && m === 'GET') return ok({ workouts: [] });
    return ok({});
  };
  return { calls, restore: () => { Date.now = realNow; } };
}

test('cron Wahoo: lunes 2:30 am locales con semana nueva -> sube solo esta semana y marca plans_week', async () => {
  const w = cronWorld({ plansWeek: '2026-09-28', tz: 'America/Argentina/Buenos_Aires', nowMs: Date.UTC(2026, 9, 5, 5, 30) });
  const res = mkRes();
  await cron({ headers: { authorization: 'Bearer cron-secret' }, url: '/' }, res);
  w.restore();
  assert.strictEqual(res.body.synced, 1);
  assert.strictEqual(w.calls.filter(c => c === 'POST /v1/plans').length, 1, 'solo el martes de esta semana (no el viejo ni el de la semana que viene)');
  assert.ok(w.calls.some(c => c.startsWith('PATCH /rest/v1/wahoo_connections')));
});

test('cron Wahoo: antes de las 2 am, semana ya hecha o sin columna -> no llama a Wahoo', async () => {
  for (const [label, world, key] of [
    ['antes de las 2', { plansWeek: '2026-09-28', tz: 'America/Argentina/Buenos_Aires', nowMs: Date.UTC(2026, 9, 5, 4, 30) }, 'early'],
    ['ya reconciliada', { plansWeek: '2026-10-05', tz: 'America/Argentina/Buenos_Aires', nowMs: Date.UTC(2026, 9, 5, 8, 0) }, 'done'],
    ['sin columna', { withColumn: false, tz: 'UTC', nowMs: Date.UTC(2026, 9, 5, 8, 0) }, 'nocolumn']
  ]) {
    const w = cronWorld(world);
    const res = mkRes();
    await cron({ headers: { authorization: 'Bearer cron-secret' }, url: '/' }, res);
    w.restore();
    assert.strictEqual(res.body[key], 1, label);
    assert.ok(!w.calls.some(c => /^(GET|POST|PUT|DELETE) \/v1\//.test(c)), label + ': sin llamadas a Wahoo');
  }
});
