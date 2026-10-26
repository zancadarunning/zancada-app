// Envío del plan a COROS por MCP: arma el entrenamiento, crea o actualiza en el lugar (COROS no deja borrar ni mover), avisa de las sesiones que sobran y solo corre para admin hasta confirmarlo.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildCorosCourse, corosDate, extractIdInPlan } = require('../api/_lib/coros-workout-builder');

process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ADMIN_EMAILS = 'admin@zancada.org';
delete process.env.COROS_PLAN_PUSH;
const handler = require('../api/coros-push-plan.js');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const day = (date, extra) => Object.assign({ date, name: 'Rodaje', typeKey: 'easy', zone: 2, distKm: 8, durMin: 50, desc: 'Suave', interval: null, repSec: 0, restSec: 0, timeBased: false }, extra || {});
const ZONES = { 1: { min: 100, max: 120 }, 2: { min: 121, max: 140 } };

// reglas del esquema real de COROS (tools/list): se comprueban sobre lo que arma el builder
const INTENSITY_FIELDS = ['sectionIntensity', 'intensityPercentStart', 'intensityPercentEnd', 'intensityValueStart', 'intensityValueEnd'];
function assertValidSection(sec, insideSet) {
  if (sec.intervalGroup) {
    assert.ok(!insideSet, 'los grupos no se anidan');
    assert.ok(sec.repeats >= 1 && sec.repeats <= 20, 'repeats 1-20');
    for (const f of ['targetType', 'targetValue', 'intensityType', 'sectionType', ...INTENSITY_FIELDS]) assert.ok(!(f in sec), 'el contenedor no lleva ' + f);
    assert.ok(Array.isArray(sec.sets) && sec.sets.length > 0);
    sec.sets.forEach(m => { assert.ok([2, 3].includes(m.sectionType), 'sets: solo sectionType 2/3'); assertValidSection(m, true); });
    return;
  }
  assert.ok([1, 2, 3, 4].includes(sec.sectionType));
  assert.ok([1, 2].includes(sec.targetType), 'correr: distancia o tiempo');
  assert.ok(Number.isInteger(sec.targetValue) && sec.targetValue > 0);
  if (sec.intensityType != null) {
    assert.equal(sec.intensityType, 1);
    const hasAbs = sec.intensityValueStart != null || sec.intensityValueEnd != null;
    const formats = [sec.sectionIntensity != null, hasAbs, sec.intensityPercentStart != null || sec.intensityPercentEnd != null].filter(Boolean).length;
    assert.equal(formats, 1, 'exactamente un formato de intensidad');
    if (hasAbs) { assert.ok(sec.intensityValueStart >= 30 && sec.intensityValueEnd <= 240 && sec.intensityValueStart <= sec.intensityValueEnd); }
    if (sec.sectionIntensity != null) assert.ok(sec.sectionIntensity >= 1 && sec.sectionIntensity <= 6);
  } else for (const f of INTENSITY_FIELDS) assert.ok(!(f in sec), 'sin intensityType no hay campos de intensidad');
}
function assertValidCourse(c) {
  assert.ok(c.courseName && c.courseName.length <= 100);
  assert.ok(c.courseDescription && c.courseDescription.trim().length > 0);
  assert.equal(c.sportType, 1);
  assert.ok(!('dayNo' in c) && !('intensityType' in c));
  assert.ok(Array.isArray(c.sections) && c.sections.length > 0);
  c.sections.forEach(sec => assertValidSection(sec, false));
}

test('buildCorosCourse: rodaje por distancia (metros) y por tiempo (segundos), con el rango de pulso de su zona', () => {
  const c = buildCorosCourse(day('2026-10-28'), ZONES, {});
  assertValidCourse(c);
  assert.equal(c.courseName, 'Zancada - Rodaje');
  assert.equal(c.courseDescription, 'Suave');
  assert.deepEqual(c.sections, [{ sectionType: 2, targetType: 1, targetValue: 8000, intensityType: 1, intensityValueStart: 121, intensityValueEnd: 140 }]);
  const t = buildCorosCourse(day('2026-10-28', { timeBased: true, durMin: 45 }), ZONES, {});
  assertValidCourse(t);
  assert.deepEqual([t.sections[0].targetType, t.sections[0].targetValue], [2, 2700]);
  const sinDesc = buildCorosCourse(day('2026-10-28', { desc: '' }), ZONES, {});
  assert.equal(sinDesc.courseDescription, 'Zancada - Rodaje', 'la descripcion nunca queda vacia');
});

test('buildCorosCourse: series con grupo de repeticiones nativo (calentamiento, grupo, vuelta a la calma); sin zonas usa la zona de COROS', () => {
  const c = buildCorosCourse(day('2026-10-28', { typeKey: 'intervals', zone: 4, interval: { reps: 5, repMeters: 800, recoveryMin: 2 } }), ZONES, {});
  assertValidCourse(c);
  assert.equal(c.sections.length, 3);
  assert.deepEqual([c.sections[0].sectionType, c.sections[0].targetType, c.sections[0].targetValue], [1, 2, 600]);
  const g = c.sections[1];
  assert.equal(g.intervalGroup, true);
  assert.equal(g.repeats, 5);
  assert.deepEqual([g.sets[0].sectionType, g.sets[0].targetType, g.sets[0].targetValue], [2, 1, 800]);
  assert.equal(g.sets[0].sectionIntensity, 4, 'zona 4 sin rango en ppm: usa la zona de COROS');
  assert.deepEqual([g.sets[1].sectionType, g.sets[1].targetType, g.sets[1].targetValue], [3, 2, 120]);
  assert.deepEqual([g.sets[1].intensityValueStart, g.sets[1].intensityValueEnd], [100, 120]);
  assert.deepEqual([c.sections[2].sectionType, c.sections[2].targetValue], [4, 300]);
  const big = buildCorosCourse(day('2026-10-28', { typeKey: 'intervals', interval: { reps: 100, repMeters: 200, recoveryMin: 1 } }), ZONES, {});
  assertValidCourse(big);
  assert.equal(big.sections[1].repeats, 20, 'COROS admite hasta 20 repeticiones por grupo');
  const fart = buildCorosCourse(day('2026-10-28', { typeKey: 'fartlek', zone: 3, interval: { reps: 6, workMin: 1, restMin: 1 } }), ZONES, {});
  assertValidCourse(fart);
  assert.deepEqual([fart.sections[1].sets[0].targetType, fart.sections[1].sets[0].targetValue], [2, 60]);
});

test('corosDate y extractIdInPlan', () => {
  assert.equal(corosDate('2026-10-28'), '20261028');
  assert.equal(extractIdInPlan({ ok: true, data: { idInPlan: '123456789012345678' } }), '123456789012345678');
  assert.equal(extractIdInPlan('Saved. idInPlan: 777 on 20261028'), '777');
  assert.equal(extractIdInPlan({ other: 1 }), null);
  assert.equal(extractIdInPlan(null), null);
});

// ---- el endpoint, con COROS y Supabase simulados ----
function mkRes() { const r = { code: null, body: null, headers: {} }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.setHeader = () => {}; r.end = () => r; return r; }

function world({ email = 'admin@zancada.org', mapping = [], mcp }) {
  const log = { create: [], update: [], saved: [], deletedMap: 0 };
  global.fetch = async (url, opts) => {
    const u = String(url), method = (opts && opts.method) || 'GET';
    const ok = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => data, text: async () => JSON.stringify(data) });
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1', email, email_confirmed_at: '2026-01-01', app_metadata: { provider: 'email' } });
    if (u.includes('/rpc/check_sync_cooldown') || u.includes('/rpc/increment_chat_usage')) return ok(true);
    if (u.includes('/rest/v1/coros_connections')) return ok([{ access_token: 'at', refresh_token: 'rt', expires_at: 9999999999 }]);
    if (u.includes('/rest/v1/sent_notifications')) {
      if (method === 'GET' && u.includes('period=eq.')) return ok([]);   // plan-dedupe: nunca enviado
      if (method === 'GET') return ok(mapping.map(p => ({ period: p })));
      if (method === 'DELETE') { log.deletedMap++; return ok([]); }
      if (method === 'POST') { log.saved.push(JSON.parse(opts.body)); return ok([]); }
    }
    if (u.includes('mcp.coros.com/mcp')) {
      const b = JSON.parse(opts.body);
      const tool = b.params.name, args = b.params.arguments;
      (tool === 'createScheduledWorkout' ? log.create : log.update).push(args);
      return mcp(tool, args);
    }
    return ok([]);
  };
  return log;
}
const mcpOk = id => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify({ idInPlan: String(id) }) }] } }) });
const mcpToolError = msg => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { isError: true, content: [{ type: 'text', text: msg }] } }) });

async function post(body) {
  const res = mkRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body }, res);
  return res;
}
const BASE = { zones: ZONES, labels: {}, today: '2026-10-27', weekStart: '2026-10-26' };

test('sin habilitar, una cuenta que no es admin no envia nada', async () => {
  const log = world({ email: 'otra@persona.com', mcp: () => mcpOk(1) });
  const r = await post(Object.assign({ days: [day('2026-10-28')], keepDates: ['2026-10-28'] }, BASE));
  assert.equal(r.body.reason, 'not_enabled');
  assert.equal(log.create.length, 0);
});

test('admin: crea el entrenamiento, recuerda su id en el servidor y no manda el id de nadie mas', async () => {
  const log = world({ mcp: () => mcpOk(555) });
  const r = await post(Object.assign({ days: [day('2026-10-28')], keepDates: ['2026-10-28'] }, BASE));
  assert.equal(r.body.created, 1);
  assert.deepEqual(r.body.pushedDates, ['2026-10-28']);
  assert.equal(log.create[0].date, '20261028');
  assert.equal(log.create[0].course.sportType, 1);
  assert.equal(log.create[0].course.courseName, 'Zancada - Rodaje');
  assert.deepEqual(log.saved.filter(s => s.kind === 'coros_id').map(s => s.period), ['2026-10-28|555']);
  assert.equal(log.saved[0].kind, 'coros_id');
  assert.equal(log.saved[0].user_id, 'u1');
});

test('si la fecha ya tiene un entrenamiento enviado, se ACTUALIZA en el lugar (no se crea otro)', async () => {
  const log = world({ mapping: ['2026-10-28|555'], mcp: () => mcpOk(555) });
  const r = await post(Object.assign({ days: [day('2026-10-28', { distKm: 10 })], keepDates: ['2026-10-28'] }, BASE));
  assert.equal(r.body.updated, 1);
  assert.equal(r.body.created, 0);
  assert.equal(log.create.length, 0);
  assert.equal(log.update[0].idInPlan, '555');
});

test('si el entrenamiento ya no existe en COROS (lo borraron), se vuelve a crear; si esta hecho o es pasado, se saltea sin duplicar', async () => {
  let log = world({ mapping: ['2026-10-28|555'], mcp: tool => tool === 'updateScheduledWorkout' ? mcpToolError('Workout not found') : mcpOk(901) });
  let r = await post(Object.assign({ days: [day('2026-10-28')], keepDates: ['2026-10-28'] }, BASE));
  assert.equal(r.body.created, 1);
  assert.equal(log.update.length, 1);
  log = world({ mapping: ['2026-10-28|555'], mcp: tool => tool === 'updateScheduledWorkout' ? mcpToolError('This workout is completed and not editable') : mcpOk(901) });
  r = await post(Object.assign({ days: [day('2026-10-28')], keepDates: ['2026-10-28'] }, BASE));
  assert.equal(r.body.skipped, 1);
  assert.equal(r.body.failed, 0);
  assert.equal(log.create.length, 0, 'no se crea otro encima de uno ya hecho');
});

test('sesiones enviadas que el plan quito se devuelven en staleDates (COROS no deja borrarlas); las pasadas y la de hoy (suele estar hecha) no', async () => {
  world({ mapping: ['2026-10-27|554', '2026-10-28|555', '2026-10-30|556', '2026-10-25|557'], mcp: () => mcpOk(1) });
  const r = await post(Object.assign({ days: [], keepDates: ['2026-10-28'] }, BASE));
  assert.deepEqual(r.body.staleDates, ['2026-10-30']);
});

test('un error de COROS se cuenta como fallo (y solo el admin ve el detalle)', async () => {
  world({ mcp: () => mcpToolError('Invalid course: sections[0].foo is required') });
  const r = await post(Object.assign({ days: [day('2026-10-28')], keepDates: ['2026-10-28'] }, BASE));
  assert.equal(r.body.failed, 1);
  assert.equal(r.body.reason, 'coros_error');
  assert.match(r.body.debug.firstError.message, /Invalid course/);
});

const mcpText = text => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text }] } }) });

test('si COROS responde un texto normal SIN idInPlan (rechazo sin marcar error), no se cuenta como enviado y el admin ve la respuesta cruda', async () => {
  const log = world({ mcp: () => mcpText('Rejected: sections[0].targetValue must be positive') });
  const r = await post(Object.assign({ days: [day('2026-10-28')], keepDates: ['2026-10-28'] }, BASE));
  assert.equal(r.body.failed, 1);
  assert.equal(r.body.created, 0);
  assert.deepEqual(r.body.pushedDates, [], 'no se marca como enviado');
  assert.equal(r.body.reason, 'coros_error');
  assert.match(r.body.debug.raws[0].raw, /Rejected/);
  assert.equal(log.saved.filter(x => x.kind === 'coros_id').length, 0, 'sin idInPlan no se recuerda nada');
});

test('al actualizar, un rechazo en texto normal tampoco cuenta como actualizado', async () => {
  world({ mapping: ['2026-10-28|555'], mcp: () => mcpText('Invalid course: cannot update') });
  const r = await post(Object.assign({ days: [day('2026-10-28')], keepDates: ['2026-10-28'] }, BASE));
  assert.equal(r.body.updated, 0);
  assert.equal(r.body.failed, 1);
});

test('cableado: topes de frecuencia, memoria de ids en el servidor y la app lo programa con los demas relojes', () => {
  const s = read('api/coros-push-plan.js');
  assert.match(s, /const MAX_DAYS = 7;/);
  assert.match(s, /checkSyncCooldown\(base, headers, userId, 'coros-plan', 300000, \{ failClosed: true \}\)/);
  assert.match(s, /withinDailyCap\(base, headers, 'coros-plan', userId, 24/);
  const app = read('app.js');
  assert.match(app, /function scheduleWatchSync\(\)\{ scheduleSuuntoSync\(\); scheduleWahooSync\(\); scheduleCorosSync\(\); \}/);
  assert.match(app, /async function syncPlanToCoros\(force\)\{/);
  assert.match(app, /function updateCorosStaleNote\(\)\{/);
  assert.match(read('index.html'), /id="coros-stale-note"/);
});
