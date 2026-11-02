// Integración con Garmin Connect (Developer Program, nivel Starter): constructor de entrenamientos, mapeo de actividades, webhook, conexión OAuth2 con PKCE, envío del plan y desconexión.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.GARMIN_CLIENT_ID = 'cid-123';
process.env.GARMIN_CLIENT_SECRET = 'csecret-456';
process.env.GARMIN_STATE_SECRET = 'state-secret-long-long-long';
process.env.GARMIN_WEBHOOK_SECRET = 'webhook-secret-long-long';

const { buildGarminWorkout, countSteps } = require('../api/_lib/garmin-workout-builder.js');
const H = require('../api/_lib/garmin-activity-helpers.js');
const { encToken, decToken } = require('../api/_lib/token-crypto.js');

const ZONES = { 1: { min: 100, max: 120 }, 2: { min: 120, max: 140 }, 3: { min: 140, max: 155 }, 4: { min: 155, max: 170 }, 5: { min: 170, max: 185 } };

// ---------- constructor de entrenamientos ----------
test('sesión continua: calentamiento + tramo principal por distancia + vuelta a la calma, con el rango de pulso de la zona', () => {
  const w = buildGarminWorkout({ date: '2026-11-03', name: 'Rodaje', typeKey: 'easy', zone: 2, distKm: 6, warmupMin: 8, cooldownMin: 5, desc: 'Suave' }, ZONES);
  assert.equal(w.sport, 'RUNNING');
  assert.ok(w.workoutProvider.length <= 20 && w.workoutSourceId.length <= 20);
  const steps = w.segments[0].steps;
  // calentamiento de 8 min = 3 de movilidad (sin objetivo de pulso) + 5 de trote suave (zona 2)
  assert.deepEqual(steps.map(s => s.intensity), ['WARMUP', 'WARMUP', 'ACTIVE', 'COOLDOWN']);
  assert.deepEqual(steps.map(s => s.stepOrder), [1, 2, 3, 4]);
  assert.equal(steps[0].durationType, 'TIME'); assert.equal(steps[0].durationValue, 180); assert.equal(steps[0].targetType, 'OPEN'); assert.equal(steps[0].description, 'Movilidad articular');
  assert.equal(steps[1].durationType, 'TIME'); assert.equal(steps[1].durationValue, 300); assert.equal(steps[1].targetType, 'HEART_RATE'); assert.equal(steps[1].targetValueLow, 120); assert.equal(steps[1].targetValueHigh, 140); assert.equal(steps[1].description, 'Trote suave');
  assert.equal(steps[2].durationType, 'DISTANCE'); assert.equal(steps[2].durationValue, 6000); assert.equal(steps[2].durationValueType, 'METER');
  assert.equal(steps[2].targetType, 'HEART_RATE'); assert.equal(steps[2].targetValueLow, 120); assert.equal(steps[2].targetValueHigh, 140);
});

test('los nombres de los pasos del calentamiento salen en el idioma de la persona; un calentamiento corto no se parte', () => {
  const w = buildGarminWorkout({ date: '2026-11-03', name: 'Run', typeKey: 'easy', zone: 2, distKm: 5, warmupMin: 8, cooldownMin: 5 }, ZONES, { mobility: 'Joint mobility', jog: 'Easy jog' });
  assert.deepEqual(w.segments[0].steps.slice(0, 2).map(s => s.description), ['Joint mobility', 'Easy jog']);
  const short = buildGarminWorkout({ date: '2026-11-03', name: 'Run', typeKey: 'easy', zone: 2, distKm: 5, warmupMin: 4, cooldownMin: 5 }, ZONES);
  assert.equal(short.segments[0].steps.filter(s => s.intensity === 'WARMUP').length, 1);
});

test('sesión por tiempo sin calentamiento propio: un solo paso de tiempo', () => {
  const w = buildGarminWorkout({ date: '2026-11-03', name: 'Por tiempo', typeKey: 'easy', zone: 2, timeBased: true, durMin: 40 }, ZONES);
  const steps = w.segments[0].steps;
  assert.equal(steps.length, 1);
  assert.equal(steps[0].durationType, 'TIME'); assert.equal(steps[0].durationValue, 2400);
});

test('intervalos: calentamiento, grupo de repeticiones (trabajo + recuperación) y vuelta a la calma, con orden de pasos único', () => {
  const w = buildGarminWorkout({ date: '2026-11-04', name: 'Series', typeKey: 'intervals', zone: 4, interval: { reps: 6, repMeters: 400, recoveryMin: 1.5 } }, ZONES);
  const steps = w.segments[0].steps;
  assert.deepEqual(steps.slice(0, 2).map(s => s.intensity), ['WARMUP', 'WARMUP']);
  const rep = steps[2];
  assert.equal(rep.type, 'WorkoutRepeatStep'); assert.equal(rep.repeatType, 'REPEAT_UNTIL_STEPS_CMPLT'); assert.equal(rep.repeatValue, 6);
  assert.deepEqual(rep.steps.map(s => s.intensity), ['INTERVAL', 'RECOVERY']);
  assert.equal(rep.steps[0].durationType, 'DISTANCE'); assert.equal(rep.steps[0].durationValue, 400);
  assert.equal(rep.steps[0].targetValueLow, 155); assert.equal(rep.steps[0].targetValueHigh, 170);
  assert.equal(rep.steps[1].durationType, 'TIME'); assert.equal(rep.steps[1].durationValue, 90);
  assert.equal(steps[3].intensity, 'COOLDOWN');
  const orders = [];
  (function walk(list) { for (const s of list) { orders.push(s.stepOrder); if (s.steps) walk(s.steps); } })(steps);
  assert.equal(new Set(orders).size, orders.length, 'cada paso tiene su propio stepOrder');
  assert.ok(countSteps(w) <= 100);
});

test('sin zonas no hay objetivo de pulso (OPEN) y los textos se acotan a lo que acepta Garmin', () => {
  const w = buildGarminWorkout({ date: '2026-11-03', name: 'x'.repeat(200), typeKey: 'easy', zone: 2, distKm: 5, desc: 'd'.repeat(2000) }, null);
  assert.equal(w.segments[0].steps.every(s => s.targetType === 'OPEN'), true);
  assert.ok(w.workoutName.length <= 80); assert.ok(w.description.length <= 1024);
});

// ---------- actividades ----------
test('solo las actividades de correr se importan', () => {
  for (const t of ['RUNNING', 'TRAIL_RUNNING', 'TREADMILL_RUNNING', 'INDOOR_RUNNING', 'ULTRA_RUN']) assert.equal(H.isRunningActivity(t), true, t);
  for (const t of ['CYCLING', 'LAP_SWIMMING', 'WALKING', 'MULTI_SPORT', undefined]) assert.equal(H.isRunningActivity(t), false, String(t));
});

test('un resumen de Garmin se convierte en una carrera de Zancada marcada como Garmin (y por lo tanto fuera de la IA)', () => {
  const run = H.activityToRun({ summaryId: '5001968355', activityId: 5001968355, activityType: 'RUNNING', activityName: 'Palermo', startTimeInSeconds: 1793545200, startTimeOffsetInSeconds: -10800,
    durationInSeconds: 1789, distanceInMeters: 4976.83, averageHeartRateInBeatsPerMinute: 144, maxHeartRateInBeatsPerMinute: 159, averageRunCadenceInStepsPerMinute: 168, activeKilocalories: 367, totalElevationGainInMeters: 16, totalElevationLossInMeters: 22 });
  assert.equal(run.source, 'garmin'); assert.equal(run.garminId, '5001968355'); assert.equal(run.id, 'garmin_5001968355');
  assert.equal(Math.round(run.distanceKm * 100) / 100, 4.98); assert.equal(run.durationSec, 1789);
  assert.equal(run.avgHr, 144); assert.equal(run.maxHr, 159); assert.equal(run.avgCadence, 168); assert.equal(run.calories, 367);
  assert.equal(run.elevationGain, 16); assert.equal(run.elevationLoss, 22);
  assert.match(run.planMonday, /^\d{4}-\d{2}-\d{2}$/); assert.ok(run.planDayIndex >= 0 && run.planDayIndex <= 6);
  // el app marca source:'garmin' y aiVisibleRuns() lo excluye (test/strava-ai.test.js)
});

test('el detalle y el resumen de la misma actividad comparten garminId (el detalle completa la carrera, no la duplica)', () => {
  assert.equal(H.garminActivityId({ summaryId: '777-detail' }), '777');
  assert.equal(H.garminActivityId({ summaryId: '777-detail', activityId: 777 }), '777');
});

test('las muestras del detalle dan la ruta y los parciales por kilómetro', () => {
  const samples = [];
  for (let i = 0; i <= 700; i++) samples.push({ startTimeInSeconds: 1793545200 + i, latitudeInDegree: -34.58 + i * 0.00003, longitudeInDegree: -58.42 + i * 0.00002, heartRate: 140 + (i % 10), totalDistanceInMeters: i * 3.0, speedMetersPerSecond: 3, elevationInMeters: 20 });
  const run = H.activityToRun({ summaryId: '9', activityId: 9, activityType: 'RUNNING', startTimeInSeconds: 1793545200, startTimeOffsetInSeconds: 0, durationInSeconds: 700, distanceInMeters: 2100 }, { samples });
  assert.ok(run.points.length > 50, 'tiene ruta');
  assert.ok(Math.abs(run.points[0].lat - (-34.58)) < 0.01);
  assert.ok(run.splits.length >= 2, 'tiene parciales');
});

// ---------- red simulada ----------
function mkRes() { const r = { code: null, body: null, headers: {} }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.end = () => r; r.writeHead = (c, h) => { r.code = c; r.loc = h && h.Location; }; return r; }
function net(routes) {
  const log = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url), method = (opts && opts.method) || 'GET';
    log.push({ method, url: u, body: opts && opts.body });
    for (const [re, fn] of routes) { if (re.test(method + ' ' + u)) { const out = await fn(u, opts, method); if (out) return out; } }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  };
  return { log, restore: () => { global.fetch = realFetch; } };
}
const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
const AUTH = [/\/auth\/v1\/user/, () => json({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01', app_metadata: { provider: 'email' } })];
const RPC_TRUE = [/\/rpc\//, () => json(true)];

// ---------- webhook ----------
const webhook = require('../api/garmin-webhook.js');
const callWebhook = async (body, k) => { const res = mkRes(); await webhook({ method: 'POST', query: k === undefined ? { k: 'webhook-secret-long-long' } : { k }, headers: {}, body }, res); return res; };

test('webhook: sin el secreto en la dirección (o con otro) se rechaza y no toca nada', async () => {
  const n = net([]);
  try {
    assert.equal((await callWebhook({ activities: [] }, undefined === 1 ? 1 : 'otro')).code, 401);
    const r = mkRes(); await webhook({ method: 'POST', query: {}, headers: {}, body: {} }, r); assert.equal(r.code, 401);
    assert.equal(n.log.length, 0);
  } finally { n.restore(); }
});

test('webhook: una carrera de Garmin se suma al estado de la cuenta conectada; ciclismo y cuentas desconocidas se ignoran', async () => {
  const n = net([
    [/GET .*garmin_connections\?garmin_user_id=eq\.g-1/, () => json([{ user_id: 'u1' }])],
    [/GET .*garmin_connections\?garmin_user_id=eq\.g-x/, () => json([])]
  ]);
  try {
    const run = { userId: 'g-1', summaryId: 'A1', activityId: 1, activityType: 'RUNNING', startTimeInSeconds: Math.floor(Date.now() / 1000) - 600, startTimeOffsetInSeconds: 0, durationInSeconds: 1800, distanceInMeters: 5000 };
    const bike = { userId: 'g-1', summaryId: 'A2', activityId: 2, activityType: 'CYCLING', startTimeInSeconds: 1793545200, durationInSeconds: 1800, distanceInMeters: 20000 };
    const stranger = Object.assign({}, run, { userId: 'g-x', activityId: 3, summaryId: 'A3' });
    const r = await callWebhook({ activities: [run, bike, stranger] });
    assert.equal(r.code, 200);
    const merges = n.log.filter(l => /rpc\/merge_garmin_runs/.test(l.url));
    assert.equal(merges.length, 1, 'solo la carrera de la cuenta conectada');
    const sent = JSON.parse(merges[0].body);
    assert.equal(sent.p_user_id, 'u1'); assert.equal(sent.p_new_runs[0].garminId, '1'); assert.equal(sent.p_new_runs[0].source, 'garmin'); assert.equal(sent.p_mode, 'skip');
  } finally { n.restore(); }
});

test('webhook: el detalle completa la carrera con upsert (sin duplicarla)', async () => {
  const n = net([[/GET .*garmin_connections\?garmin_user_id=eq\.g-1/, () => json([{ user_id: 'u1' }])]]);
  try {
    const samples = Array.from({ length: 50 }, (_, i) => ({ startTimeInSeconds: 1793545200 + i, latitudeInDegree: -34.5 + i * 1e-4, longitudeInDegree: -58.4, totalDistanceInMeters: i * 30, heartRate: 150 }));
    const r = await callWebhook({ activityDetails: [{ userId: 'g-1', summaryId: '1-detail', activityId: 1, summary: { activityType: 'RUNNING', startTimeInSeconds: 1793545200, durationInSeconds: 50, distanceInMeters: 1500 }, samples }] });
    assert.equal(r.code, 200);
    const m = n.log.filter(l => /rpc\/merge_garmin_runs/.test(l.url));
    assert.equal(m.length, 1); const sent = JSON.parse(m[0].body);
    assert.equal(sent.p_mode, 'upsert'); assert.equal(sent.p_new_runs[0].garminId, '1'); assert.ok(sent.p_new_runs[0].points.length > 0);
  } finally { n.restore(); }
});

test('webhook: la desconexión desde Garmin borra la conexión, lo importado y los entrenamientos recordados; el cambio de permisos se guarda', async () => {
  const n = net([[/GET .*garmin_connections\?garmin_user_id=eq\.g-1/, () => json([{ user_id: 'u1' }])]]);
  try {
    let r = await callWebhook({ deregistrations: [{ userId: 'g-1' }] });
    assert.equal(r.code, 200);
    assert.ok(n.log.some(l => /rpc\/purge_provider_runs/.test(l.url) && JSON.parse(l.body).p_source === 'garmin'));
    assert.ok(n.log.some(l => l.method === 'DELETE' && /garmin_connections\?user_id=eq\.u1/.test(l.url)));
    assert.ok(n.log.some(l => l.method === 'DELETE' && /sent_notifications\?user_id=eq\.u1&kind=eq\.garmin_wk/.test(l.url)));
    n.log.length = 0;
    r = await callWebhook({ userPermissionsChange: [{ userId: 'g-1', permissions: ['ACTIVITY_EXPORT'] }] });
    const patch = n.log.find(l => l.method === 'PATCH' && /garmin_connections/.test(l.url));
    assert.ok(patch); assert.deepEqual(JSON.parse(patch.body).permissions, ['ACTIVITY_EXPORT']);
  } finally { n.restore(); }
});

test('webhook: si guardar falla responde 500 (Garmin reintenta) y no 200', async () => {
  const n = net([
    [/GET .*garmin_connections\?garmin_user_id=eq\.g-1/, () => json([{ user_id: 'u1' }])],
    [/rpc\/merge_garmin_runs/, () => ({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) })]
  ]);
  try {
    const r = await callWebhook({ activities: [{ userId: 'g-1', summaryId: 'B1', activityId: 5, activityType: 'RUNNING', startTimeInSeconds: Math.floor(Date.now() / 1000) - 600, durationInSeconds: 1800, distanceInMeters: 5000 }] });
    assert.equal(r.code, 500);
  } finally { n.restore(); }
});

// ---------- conexión (OAuth2 PKCE) ----------
const init = require('../api/garmin-init.js');
const callback = require('../api/garmin-callback.js');

test('conectar: el state sella el code_verifier, el código se canjea desde el servidor con el secreto y la conexión queda guardada con los tokens cifrados', async () => {
  const n = net([
    AUTH, RPC_TRUE,
    [/POST https:\/\/diauth\.garmin\.com/, () => json({ access_token: 'AT', refresh_token: 'RT', expires_in: 86400, refresh_token_expires_in: 7775998 })],
    [/GET https:\/\/apis\.garmin\.com\/partner-gateway\/rest\/user\/id/, () => json({ userId: 'g-777' })],
    [/GET https:\/\/apis\.garmin\.com\/partner-gateway\/rest\/user\/permissions/, () => json({ permissions: ['ACTIVITY_EXPORT', 'WORKOUT_IMPORT'] })]
  ]);
  try {
    let res = mkRes();
    await init({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body: {} }, res);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    const url = new URL(res.body.authUrl);
    assert.equal(url.origin + url.pathname, 'https://connect.garmin.com/oauth2Confirm');
    assert.equal(url.searchParams.get('client_id'), 'cid-123'); assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://www.zancada.org/api/garmin-callback');
    const state = url.searchParams.get('state'); const challenge = url.searchParams.get('code_challenge');
    assert.ok(!state.includes(challenge), 'el state no lleva el desafío');

    // vuelta de Garmin (paso 1): solo manda a la app, no vincula
    res = mkRes();
    await callback({ method: 'GET', headers: {}, query: { code: 'CODE1', state } }, res);
    assert.equal(res.statusCode, 200); assert.equal(n.log.filter(l => /diauth/.test(l.url)).length, 0, 'sin intercambio todavía');

    // confirmación desde la app con sesión (paso 2)
    res = mkRes();
    await callback({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body: { code: 'CODE1', state } }, res);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    const tokenCall = n.log.find(l => /diauth/.test(l.url));
    const p = new URLSearchParams(tokenCall.body);
    assert.equal(p.get('grant_type'), 'authorization_code'); assert.equal(p.get('client_secret'), 'csecret-456'); assert.equal(p.get('redirect_uri'), 'https://www.zancada.org/api/garmin-callback');
    const verifier = p.get('code_verifier');
    assert.equal(crypto.createHash('sha256').update(verifier).digest('base64url'), challenge, 'el verifier corresponde al desafío enviado a Garmin');
    const save = n.log.find(l => l.method === 'POST' && /rest\/v1\/garmin_connections/.test(l.url));
    const row = JSON.parse(save.body);
    assert.equal(row.user_id, 'u1'); assert.equal(row.garmin_user_id, 'g-777'); assert.deepEqual(row.permissions, ['ACTIVITY_EXPORT', 'WORKOUT_IMPORT']);
    assert.notEqual(row.access_token, 'AT'); assert.equal(decToken(row.access_token), 'AT'); assert.equal(decToken(row.refresh_token), 'RT');
  } finally { n.restore(); }
});

test('conectar: el state de OTRA cuenta no vincula (login CSRF) y un state adulterado se rechaza', async () => {
  const n = net([AUTH, RPC_TRUE]);
  try {
    let res = mkRes();
    await init({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body: {} }, res);
    const state = new URL(res.body.authUrl).searchParams.get('state');
    const forged = state.replace(/^[^.]+/, 'u2');   // otro usuario en el state
    res = mkRes();
    await callback({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body: { code: 'C', state: forged } }, res);
    assert.ok([400, 403].includes(res.code), 'state adulterado: ' + res.code);
    res = mkRes();
    await callback({ method: 'GET', headers: {}, query: { code: 'C', state: 'basura' } }, res);
    assert.equal(res.code, 302);
    assert.equal(n.log.filter(l => /diauth/.test(l.url)).length, 0);
  } finally { n.restore(); }
});

// ---------- envío del plan ----------
const pushPlan = require('../api/garmin-push-plan.js');
const callPush = async body => { const res = mkRes(); await pushPlan({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body }, res); return res; };
const DAY = (date, extra) => Object.assign({ date, name: 'Rodaje', typeKey: 'easy', zone: 2, distKm: 6, warmupMin: 8, cooldownMin: 5, desc: 'Suave' }, extra);
const conn = () => ({ user_id: 'u1', access_token: encToken('AT'), refresh_token: encToken('RT'), expires_at: Math.floor(Date.now() / 1000) + 86400, permissions: ['ACTIVITY_EXPORT', 'WORKOUT_IMPORT'] });

function garminRoutes(state) {
  state.known = state.known || [];   // filas de sent_notifications
  state.nextWorkout = state.nextWorkout || 1000;
  return [
    AUTH, RPC_TRUE,
    [/GET .*garmin_connections\?user_id=eq\.u1/, () => json([conn()])],
    [/GET .*sent_notifications\?user_id=eq\.u1&kind=eq\.garmin_wk/, () => json(state.known.map(period => ({ period })))],
    [/GET .*sent_notifications\?user_id=eq\.u1&kind=eq\.garmin_plan/, () => json([])],
    [/DELETE .*sent_notifications\?user_id=eq\.u1&kind=eq\.garmin_wk&period=like\.([^*]+)\*/, (u) => { const d = decodeURIComponent(u.match(/period=like\.([^*]+)\*/)[1]); state.known = state.known.filter(p => !p.startsWith(d)); return json([]); }],
    [/POST .*sent_notifications$/, (u, o) => { const b = JSON.parse(o.body); if (b.kind === 'garmin_wk') state.known.push(b.period); return json([]); }],
    [/POST https:\/\/apis\.garmin\.com\/workoutportal\/workout\/v2/, () => json({ workoutId: ++state.nextWorkout })],
    [/POST https:\/\/apis\.garmin\.com\/training-api\/schedule\//, () => json({ scheduleId: 9000 + state.nextWorkout })],
    [/DELETE https:\/\/apis\.garmin\.com\/training-api\//, () => json({}, 204)]
  ];
}

test('enviar el plan: se crea cada entrenamiento y se programa en su día; lo recuerda y no vuelve a llamar por lo que no cambió', async () => {
  const state = {};
  const n = net(garminRoutes(state));
  try {
    let r = await callPush({ days: [DAY('2026-11-03'), DAY('2026-11-05', { name: 'Largo', distKm: 12 })], keepDates: ['2026-11-03', '2026-11-05'], zones: ZONES, today: '2026-11-02', force: true });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.created, 2); assert.equal(r.body.failed, 0);
    const wk = n.log.filter(l => l.method === 'POST' && /workoutportal/.test(l.url));
    const sc = n.log.filter(l => l.method === 'POST' && /training-api\/schedule/.test(l.url));
    assert.equal(wk.length, 2); assert.equal(sc.length, 2);
    assert.deepEqual(JSON.parse(sc[0].body), { workoutId: 1001, date: '2026-11-03' });
    assert.equal(JSON.parse(wk[0].body).sport, 'RUNNING');
    assert.equal(state.known.length, 2); assert.match(state.known[0], /^2026-11-03\|1001\|10\d+\|[a-f0-9]{16}$/);
    // segundo envío, sin cambios: cero llamadas a Garmin
    n.log.length = 0;
    r = await callPush({ days: [DAY('2026-11-03'), DAY('2026-11-05', { name: 'Largo', distKm: 12 })], keepDates: ['2026-11-03', '2026-11-05'], zones: ZONES, today: '2026-11-02', force: true });
    assert.equal(r.body.created, 0); assert.equal(r.body.skipped, 2);
    assert.equal(n.log.filter(l => /apis\.garmin\.com/.test(l.url)).length, 0, 'sin cuota gastada');
  } finally { n.restore(); }
});

test('enviar el plan: una sesión cambiada se borra y se vuelve a crear; una que el plan quitó se borra de Garmin', async () => {
  const state = {};
  const n = net(garminRoutes(state));
  try {
    await callPush({ days: [DAY('2026-11-03'), DAY('2026-11-05')], keepDates: ['2026-11-03', '2026-11-05'], zones: ZONES, today: '2026-11-02', force: true });
    n.log.length = 0;
    const r = await callPush({ days: [DAY('2026-11-03', { distKm: 8 })], keepDates: ['2026-11-03'], zones: ZONES, today: '2026-11-02', force: true });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.created, 1); assert.equal(r.body.deleted, 1);
    const dels = n.log.filter(l => l.method === 'DELETE' && /apis\.garmin\.com/.test(l.url)).map(l => l.url.replace('https://apis.garmin.com/training-api/', ''));
    assert.ok(dels.some(d => /^workout\/v2\/1001$/.test(d)), 'borró el entrenamiento viejo del 3');
    assert.ok(dels.some(d => /^workout\/v2\/1002$/.test(d)), 'borró el del 5 que el plan quitó');
    assert.ok(dels.some(d => /^schedule\//.test(d)));
    assert.equal(state.known.length, 1); assert.match(state.known[0], /^2026-11-03\|/);
  } finally { n.restore(); }
});

test('enviar el plan: sin conexión, sin permiso de importar entrenamientos o con cuota agotada (429) no rompe y lo dice', async () => {
  let n = net([AUTH, RPC_TRUE, [/GET .*garmin_connections\?user_id=eq\.u1/, () => json([])], [/GET .*sent_notifications/, () => json([])]]);
  try { assert.equal((await callPush({ days: [DAY('2026-11-03')], zones: ZONES, today: '2026-11-02', force: true })).body.reason, 'not_connected'); } finally { n.restore(); }
  n = net([AUTH, RPC_TRUE, [/GET .*garmin_connections\?user_id=eq\.u1/, () => json([Object.assign(conn(), { permissions: ['ACTIVITY_EXPORT'] })])], [/GET .*sent_notifications/, () => json([])]]);
  try { assert.equal((await callPush({ days: [DAY('2026-11-03')], zones: ZONES, today: '2026-11-02', force: true })).body.reason, 'no_permission'); } finally { n.restore(); }
  n = net([...garminRoutes({}).slice(0, 5), [/POST https:\/\/apis\.garmin\.com\/workoutportal/, () => json({}, 429)]]);
  try {
    const r = await callPush({ days: [DAY('2026-11-03'), DAY('2026-11-04')], keepDates: [], zones: ZONES, today: '2026-11-02', force: true });
    assert.equal(r.body.reason, 'rate_limited'); assert.equal(r.body.created, 0);
    assert.equal(n.log.filter(l => /workoutportal/.test(l.url)).length, 1, 'corta al primer 429');
  } finally { n.restore(); }
});

test('enviar el plan: con los permisos vacíos se vuelven a pedir a Garmin y se guardan; si dicen que no hay permiso de importar, no se envía', async () => {
  const state = {};
  const empty = [/GET .*garmin_connections\?user_id=eq\.u1/, () => json([Object.assign(conn(), { permissions: [] })])];
  let patched = null;
  let n = net([empty, [/PATCH .*garmin_connections/, (u, o) => { patched = JSON.parse(o.body); return json([]); }],
    [/GET https:\/\/apis\.garmin\.com\/partner-gateway\/rest\/user\/permissions/, () => json({ permissions: ['ACTIVITY_EXPORT', 'WORKOUT_IMPORT'] })], ...garminRoutes(state)]);
  try {
    const r = await callPush({ days: [DAY('2026-11-03')], keepDates: [], zones: ZONES, today: '2026-11-02', force: true });
    assert.equal(r.body.created, 1);
    assert.deepEqual(patched.permissions, ['ACTIVITY_EXPORT', 'WORKOUT_IMPORT'], 'los permisos recuperados quedan guardados');
  } finally { n.restore(); }
  n = net([empty, ...garminRoutes({}), [/GET https:\/\/apis\.garmin\.com\/partner-gateway\/rest\/user\/permissions/, () => json({ permissions: ['ACTIVITY_EXPORT'] })]]);
  try {
    const r = await callPush({ days: [DAY('2026-11-03')], keepDates: [], zones: ZONES, today: '2026-11-02', force: true });
    assert.equal(r.body.reason, 'no_permission');
    assert.equal(n.log.filter(l => /workoutportal/.test(l.url)).length, 0, 'no se crea nada sin permiso');
  } finally { n.restore(); }
  // si Garmin no responde la consulta de permisos, se sigue como antes (vacío = se intenta igual)
  n = net([empty, ...garminRoutes({}), [/GET https:\/\/apis\.garmin\.com\/partner-gateway\/rest\/user\/permissions/, () => json({}, 500)]]);
  try { assert.equal((await callPush({ days: [DAY('2026-11-03')], keepDates: [], zones: ZONES, today: '2026-11-02', force: true })).body.created, 1); } finally { n.restore(); }
});

test('enviar el plan: si Garmin crea el entrenamiento pero no lo programa, se borra el suelto (no deja basura en la cuenta)', async () => {
  const state = {};
  const routes = garminRoutes(state);
  routes.splice(routes.findIndex(r => /schedule\\\//.test(r[0].source)), 1, [/POST https:\/\/apis\.garmin\.com\/training-api\/schedule\//, () => json({ message: 'bad' }, 400)]);
  const n = net(routes);
  try {
    const r = await callPush({ days: [DAY('2026-11-03')], keepDates: [], zones: ZONES, today: '2026-11-02', force: true });
    assert.equal(r.body.failed, 1); assert.equal(state.known.length, 0);
    assert.ok(n.log.some(l => l.method === 'DELETE' && /workout\/v2\/1001/.test(l.url)));
  } finally { n.restore(); }
});

// ---------- desconexión ----------
const disconnect = require('../api/garmin-disconnect.js');

test('desconectar desde Zancada: borra los entrenamientos enviados, le avisa a Garmin (DELETE user/registration), borra la conexión y purga las carreras importadas', async () => {
  const state = { known: ['2026-11-03|1001|9001|abc'] };
  const n = net([...garminRoutes(state), [/DELETE https:\/\/apis\.garmin\.com\/partner-gateway\/rest\/user\/registration/, () => json({}, 204)]]);
  try {
    const res = mkRes();
    await disconnect({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body: {} }, res);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    assert.ok(n.log.some(l => l.method === 'DELETE' && /training-api\/workout\/v2\/1001/.test(l.url)));
    assert.ok(n.log.some(l => l.method === 'DELETE' && /user\/registration/.test(l.url)), 'avisó a Garmin');
    assert.ok(n.log.some(l => l.method === 'DELETE' && /garmin_connections\?user_id=eq\.u1/.test(l.url)));
    assert.ok(n.log.some(l => /rpc\/purge_provider_runs/.test(l.url) && JSON.parse(l.body).p_source === 'garmin'));
  } finally { n.restore(); }
});

test('borrar la cuenta o los datos también le avisa a Garmin (obligatorio por el acuerdo)', async () => {
  const fs = require('node:fs'), path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'delete-account.js'), 'utf8');
  assert.ok(src.includes('deleteGarminRegistration(accessToken)') && src.includes('removeAllGarminWorkouts'));
  assert.ok(src.includes("'garmin_connections'"), 'la tabla se limpia en Borrar mis datos');
});

// ---------- el secreto del webhook va en la ruta (Garmin recorta la query de la dirección registrada) ----------
test('webhook: la dirección /api/garmin-webhook/<secreto> se reescribe a ?k=<secreto> y el secreto no llega a Sentry', () => {
  const fs = require('node:fs'), path = require('node:path');
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.ok(vercel.rewrites.some(r => r.source === '/api/garmin-webhook/:k' && r.destination === '/api/garmin-webhook?k=:k'));
  const { scrubEvent } = require('../api/_lib/sentry.js');
  const ev = scrubEvent({ request: { url: 'https://www.zancada.org/api/garmin-webhook/SECRETO-LARGO-123?x=1' } });
  assert.equal(ev.request.url, 'https://www.zancada.org/api/garmin-webhook/[oculto]');
});

test('enviar el plan: si Garmin programa sin devolver el id, se busca por fecha para poder borrarlo/moverlo después', async () => {
  const state = {};
  const routes = [
    [/POST https:\/\/apis\.garmin\.com\/training-api\/schedule\//, () => ({ ok: true, status: 204, json: async () => { throw new Error('sin cuerpo'); }, text: async () => '' })],
    [/GET https:\/\/apis\.garmin\.com\/training-api\/schedule\?startDate=2026-11-03&endDate=2026-11-03/, () => json([{ scheduleId: 7777, workoutId: 1001, date: '2026-11-03' }])],
    ...garminRoutes(state)
  ];
  const n = net(routes);
  try {
    const r = await callPush({ days: [DAY('2026-11-03')], keepDates: ['2026-11-03'], zones: ZONES, today: '2026-11-02', force: true });
    assert.equal(r.body.created, 1, JSON.stringify(r.body));
    assert.match(state.known[0], /^2026-11-03\|1001\|7777\|[a-f0-9]{16}$/);
  } finally { n.restore(); }
});
