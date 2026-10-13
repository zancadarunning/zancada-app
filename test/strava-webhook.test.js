// Webhook de Strava: Strava no firma los eventos, así que los destructivos se confirman contra Strava antes de actuar.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.STRAVA_SUBSCRIPTION_ID = '777';
process.env.STRAVA_CLIENT_ID = 'cid';
process.env.STRAVA_CLIENT_SECRET = 'csecret';
const handler = require('../api/strava-webhook.js');

function mkRes() { const r = { code: null }; r.status = c => { r.code = c; return r; }; r.send = () => r; r.json = () => r; r.setHeader = () => {}; r.end = () => r; return r; }

// db: lo que "responde" Supabase y Strava
function setup({ refreshStatus = 200, activityStatus = 200, expired = false }) {
  const log = { deletedConn: 0, deletedRun: 0, activityChecks: 0, refreshes: 0 };
  global.fetch = async (url, opts) => {
    const u = String(url), method = (opts && opts.method) || 'GET';
    const ok = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (u.includes('/rest/v1/strava_connections') && method === 'GET') return ok([{ user_id: 'u1', access_token: 'at', refresh_token: 'rt', expires_at: expired ? 1 : 9999999999 }]);
    if (u.includes('/rest/v1/strava_connections') && method === 'DELETE') { log.deletedConn++; return ok([]); }
    if (u.includes('strava.com/oauth/token')) { log.refreshes++; return refreshStatus === 200 ? ok({ access_token: 'at2', refresh_token: 'rt2', expires_at: 9999999999 }) : ok({ message: 'Bad Request' }, refreshStatus); }
    if (u.includes('strava.com/api/v3/activities/')) { log.activityChecks++; return ok({ id: 1 }, activityStatus); }
    if (u.includes('/rpc/') || u.includes('/rest/v1/app_state')) { if (method !== 'GET') log.deletedRun++; return ok([]); }
    return ok([]);
  };
  return log;
}
const post = async (event, query) => { const res = mkRes(); await handler({ method: 'POST', query: query || {}, body: event, headers: {} }, res); return res; };
const deauth = { subscription_id: 777, object_type: 'athlete', object_id: 55, owner_id: 55, aspect_type: 'update', updates: { authorized: 'false' } };
const del = { subscription_id: 777, object_type: 'activity', object_id: 99, owner_id: 55, aspect_type: 'delete' };

test('revocación falsa: si Strava todavía deja refrescar el token, NO se borra nada', async () => {
  const log = setup({ refreshStatus: 200 });
  await post(deauth);
  assert.equal(log.deletedConn, 0);
});

test('revocación real: si Strava rechaza el refresh (400/401), se borra la conexión', async () => {
  const log = setup({ refreshStatus: 400 });
  await post(deauth);
  assert.equal(log.deletedConn, 1);
});

test('ante un error de red o un 5xx al confirmar, no se borra nada', async () => {
  const log = setup({ refreshStatus: 503 });
  await post(deauth);
  assert.equal(log.deletedConn, 0);
});

test('borrado falso: si la actividad sigue existiendo en Strava, no se borra la carrera', async () => {
  const log = setup({ activityStatus: 200 });
  await post(del);
  assert.equal(log.activityChecks, 1);
  assert.equal(log.deletedRun, 0);
});

test('borrado real: con 404 de Strava se elimina la carrera', async () => {
  const log = setup({ activityStatus: 404 });
  await post(del);
  assert.equal(log.activityChecks, 1);
  assert.ok(log.deletedRun >= 1);
});

test('con STRAVA_WEBHOOK_SECRET configurado, un POST sin el secreto correcto se ignora por completo', async () => {
  process.env.STRAVA_WEBHOOK_SECRET = 's3cret-largo';
  let log = setup({ refreshStatus: 400 });
  await post(deauth, {});
  await post(deauth, { k: 'otro' });
  assert.equal(log.deletedConn, 0, 'sin el secreto no se actúa');
  log = setup({ refreshStatus: 400 });
  await post(deauth, { k: 's3cret-largo' });
  assert.equal(log.deletedConn, 1, 'con el secreto correcto sí');
  delete process.env.STRAVA_WEBHOOK_SECRET;
});

test('subscription_id incorrecto: se ignora', async () => {
  const log = setup({ refreshStatus: 400 });
  await post(Object.assign({}, deauth, { subscription_id: 1 }));
  assert.equal(log.deletedConn, 0);
});
