// test/perf/sync-egress.test.js
//
// Datos salientes de Supabase: los crons de sincronización (cada 15 minutos, por cada cuenta conectada a un reloj) no deben
// bajar el app_state.data completo de la cuenta cuando no hay nada nuevo ni carreras por completar. Antes eran dos lecturas
// enteras por cuenta por corrida; con la sonda (sql/sync_probe.sql) tiene que ser cero. Si la función no existe en la base, el
// cron hace lo de siempre (el comportamiento viejo es la red de seguridad). Base simulada: nada sale a internet.

const test = require('node:test');
const assert = require('node:assert/strict');
const { syncProbe, probeHasNew, probeMayBackfill } = require('../../api/_lib/sync-probe');

function fakeRes() {
  const r = { code: 200, body: null, headers: {}, headersSent: false };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; r.headersSent = true; return r; };
  r.send = b => { r.body = b; r.headersSent = true; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}

test('syncProbe: devuelve la respuesta de la base, y null si la función no existe o falla (nunca lanza)', async () => {
  const realFetch = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, json: async () => ({ exists: true, unknown: [5, '6'], pending: 1 }) });
    assert.deepEqual(await syncProbe('https://x.test', {}, 'u1', 'strava', 'stravaId', [5, 6, null]), { exists: true, unknown: ['5', '6'], pending: true });
    global.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    assert.equal(await syncProbe('https://x.test', {}, 'u1', 'strava', 'stravaId', [1]), null);
    global.fetch = async () => ({ ok: true, json: async () => ({ algo: 'raro' }) });
    assert.equal(await syncProbe('https://x.test', {}, 'u1', 'strava', 'stravaId', [1]), null);
    global.fetch = async () => { throw new Error('red caída'); };
    assert.equal(await syncProbe('https://x.test', {}, 'u1', 'strava', 'stravaId', [1]), null);
  } finally { global.fetch = realFetch; }
});

test('syncProbe: manda los ids como texto y sin nulos', async () => {
  const realFetch = global.fetch;
  let sent;
  try {
    global.fetch = async (url, opts) => { sent = { url: String(url), body: JSON.parse(opts.body) }; return { ok: true, json: async () => ({ exists: true, unknown: [], pending: false }) }; };
    await syncProbe('https://x.test', {}, 'u1', 'wahoo', 'wahooId', [10, null, undefined, 'a']);
    assert.match(sent.url, /\/rest\/v1\/rpc\/sync_probe$/);
    assert.deepEqual(sent.body, { p_user_id: 'u1', p_source: 'wahoo', p_id_field: 'wahooId', p_ids: ['10', 'a'] });
  } finally { global.fetch = realFetch; }
});

test('probeHasNew / probeMayBackfill: sin sonda se hace todo como antes; con sonda solo lo que hace falta', () => {
  assert.equal(probeHasNew(null), true);
  assert.equal(probeMayBackfill(null), true);
  const nada = { exists: true, unknown: [], pending: false };
  assert.equal(probeHasNew(nada), false);
  assert.equal(probeMayBackfill(nada), false);
  const pendiente = { exists: true, unknown: [], pending: true };
  assert.equal(probeHasNew(pendiente), false);
  assert.equal(probeMayBackfill(pendiente), true);
  const nuevas = { exists: true, unknown: ['9'], pending: false };
  assert.equal(probeHasNew(nuevas), true);
  assert.equal(probeMayBackfill(nuevas), true, 'si se agregan carreras nuevas, también se revisan las incompletas (como antes)');
  const sinFila = { exists: false, unknown: ['9'], pending: false };
  assert.equal(probeHasNew(sinFila), false);
  assert.equal(probeMayBackfill(sinFila), false);
});

// Corre el cron de Strava o de Polar con una cuenta conectada y cuenta cuántas veces se bajó el app_state completo.
async function runCron(which, probeAnswer) {
  process.env.CRON_SECRET = 'test-secret'; process.env.SUPABASE_URL = 'https://x.test'; process.env.SUPABASE_SERVICE_KEY = 'k';
  const calls = { fullReads: 0, probes: 0 };
  const realFetch = global.fetch;
  const state = { data: { runs: [{ source: which, stravaId: 111, polarId: 'ex1', splitsV: 3, points: [1, 2], id: 'r1' }] } };
  global.fetch = async (url, opts) => {
    url = String(url);
    const json = body => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.includes('/rest/v1/strava_connections')) return json([{ user_id: 'u1', access_token: 't', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600 }]);
    if (url.includes('/rest/v1/polar_connections')) return json([{ user_id: 'u1', access_token: 't' }]);
    if (url.includes('strava.com/api/v3/athlete/activities')) return json([{ id: 111, sport_type: 'Run' }]);
    if (url.includes('polaraccesslink.com/v3/exercises')) return json({ exercises: [{ id: 'ex1', sport: 'RUNNING' }] });
    if (url.includes('/rest/v1/rpc/sync_probe')) {
      calls.probes++;
      return probeAnswer === 'missing' ? { ok: false, status: 404, json: async () => ({}), text: async () => '' } : json(probeAnswer);
    }
    if (url.includes('/rest/v1/app_state') && /select=data(&|$)/.test(url)) { calls.fullReads++; return json([state]); }
    return json({});
  };
  try {
    const handler = require(which === 'strava' ? '../../api/sync-strava' : '../../api/polar-sync');
    const res = fakeRes();
    await handler({ headers: { authorization: 'Bearer test-secret' }, url: '/', method: 'GET' }, res);
    return { calls, body: res.body };
  } finally { global.fetch = realFetch; }
}

for (const which of ['strava', 'polar']) {
  test(`${which}: sin nada nuevo ni pendientes no baja el estado completo (0 lecturas, antes 2)`, async () => {
    const { calls, body } = await runCron(which, { exists: true, unknown: [], pending: false });
    assert.equal(body.synced, 1);
    assert.equal(calls.probes, 1);
    assert.equal(calls.fullReads, 0);
  });

  test(`${which}: con una carrera por completar solo lee para completarla (1 lectura)`, async () => {
    const { calls, body } = await runCron(which, { exists: true, unknown: [], pending: true });
    assert.equal(body.synced, 1);
    assert.equal(calls.fullReads, 1);
  });

  test(`${which}: si la función no existe en la base hace lo de siempre (2 lecturas)`, async () => {
    const { calls, body } = await runCron(which, 'missing');
    assert.equal(body.synced, 1);
    assert.equal(calls.fullReads, 2);
  });
}
