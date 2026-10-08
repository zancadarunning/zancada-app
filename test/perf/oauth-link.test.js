// test/perf/oauth-link.test.js
//
// Vinculación de relojes en dos pasos (api/_lib/oauth-link.js): el callback de la marca ya NO vincula nada; lo hace la app con la
// sesión del usuario, y solo si el usuario del "state" es el mismo que el de la sesión. Cubre el hallazgo CWE-352 del escaneo.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.SUPABASE_URL = 'https://mock.supabase.test';
process.env.SUPABASE_SERVICE_KEY = 'k';
for (const p of ['STRAVA', 'POLAR', 'WAHOO', 'SUUNTO', 'COROS']) process.env[`${p}_STATE_SECRET`] = `${p.toLowerCase()}-state-secret`;
process.env.STRAVA_CLIENT_ID = '1'; process.env.STRAVA_CLIENT_SECRET = 's';

const ATTACKER = '11111111-1111-1111-1111-111111111111';
const VICTIM = '22222222-2222-2222-2222-222222222222';

function signState(secret, userId, ts) {
  ts = ts || Date.now();
  const sig = crypto.createHmac('sha256', secret).update(`${userId}.${ts}`).digest('hex');
  return `${userId}.${ts}.${sig}`;
}
function fakeRes() {
  const r = { code: 200, body: null, headers: {}, loc: null, html: null, headersSent: false };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; r.headersSent = true; return r; };
  r.send = b => { r.html = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.getHeader = k => r.headers[k.toLowerCase()];
  r.writeHead = (c, h) => { r.code = c; r.loc = h && h.Location; };
  r.end = b => { if (b) r.html = b; r.headersSent = true; return r; };
  return r;
}

// Base simulada: Supabase Auth (quién es el dueño del token), tabla de conexiones, Strava.
function mockNetwork(sessionUserId) {
  const writes = [];
  const real = global.fetch;
  global.fetch = async (url, opts) => {
    url = String(url);
    if (url.includes('/auth/v1/user')) {
      return sessionUserId ? { ok: true, status: 200, json: async () => ({ id: sessionUserId, email: 'x@test' }) } : { ok: false, status: 401, json: async () => ({}) };
    }
    if (url.includes('strava.com/oauth/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'at', refresh_token: 'rt', expires_at: 9999999999, athlete: { id: 777 } }) };
    if (url.includes('strava.com/api/v3/athlete/activities')) return { ok: true, status: 200, json: async () => [] };
    if (url.includes('/rest/v1/') && opts && opts.method && opts.method !== 'GET') writes.push({ url, body: opts.body });
    return { ok: true, status: 200, json: async () => [], text: async () => '' };
  };
  return { writes, restore: () => { global.fetch = real; } };
}

function loadStrava() { delete require.cache[require.resolve('../../api/strava-auth')]; return require('../../api/strava-auth'); }

test('GET (la marca nos devuelve a la persona): no vincula nada, solo responde la página que vuelve a la app', async () => {
  const net = mockNetwork(null);
  try {
    const handler = loadStrava();
    const state = signState('strava-state-secret', ATTACKER);
    const res = fakeRes();
    await handler({ method: 'GET', query: { code: 'abc', state }, headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 9)' } }, res);
    assert.equal(res.code, 200);
    assert.match(res.html, /intent:\/\/www\.zancada\.org\/conectar\?p=strava/);
    assert.match(res.html, /package=org\.zancada\.app/);
    assert.equal(net.writes.length, 0, 'el callback no escribe en la base ni intercambia nada');
    // fuera de Android, sigue directo a /conectar
    const web = fakeRes();
    await handler({ method: 'GET', query: { code: 'abc', state }, headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } }, web);
    assert.match(web.html, /\/conectar\?p=strava&code=abc&state=/);
    assert.ok(!/intent:\/\//.test(web.html));
  } finally { net.restore(); }
});

test('GET: state inválido, vencido o consentimiento cancelado -> vuelve a la app sin intentar vincular', async () => {
  const net = mockNetwork(null);
  try {
    const handler = loadStrava();
    const cases = [
      { query: { code: 'c', state: signState('otro-secreto', ATTACKER) } },
      { query: { code: 'c', state: signState('strava-state-secret', ATTACKER, Date.now() - 11 * 60 * 1000) } },
      { query: { error: 'access_denied', state: 'x' } },
      { query: {} }
    ];
    for (const c of cases) {
      const res = fakeRes();
      await handler({ method: 'GET', headers: {}, ...c }, res);
      assert.equal(res.code, 302);
      assert.match(res.loc, /^\/(\?link_error=1)?$/);
    }
    assert.equal(net.writes.length, 0);
  } finally { net.restore(); }
});

test('POST de la víctima con el state del atacante: 403 y NO se guarda ninguna conexión', async () => {
  const net = mockNetwork(VICTIM);
  try {
    const handler = loadStrava();
    const res = fakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { code: 'abc', state: signState('strava-state-secret', ATTACKER) } }, res);
    assert.equal(res.code, 403);
    assert.equal(res.body.error, 'state_mismatch');
    assert.equal(net.writes.length, 0, 'no se escribió strava_connections');
  } finally { net.restore(); }
});

test('POST sin sesión o con body incompleto: se rechaza', async () => {
  const net = mockNetwork(null);
  try {
    const handler = loadStrava();
    const sinSesion = fakeRes();
    await handler({ method: 'POST', headers: {}, body: { code: 'a', state: signState('strava-state-secret', ATTACKER) } }, sinSesion);
    assert.equal(sinSesion.code, 401);
  } finally { net.restore(); }
  const net2 = mockNetwork(ATTACKER);
  try {
    const handler = loadStrava();
    const vacio = fakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: {} }, vacio);
    assert.equal(vacio.code, 400);
    const malState = fakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { code: 'a', state: 'basura' } }, malState);
    assert.equal(malState.code, 400);
  } finally { net2.restore(); }
});

test('POST del dueño legítimo (usuario del state = usuario de la sesión): vincula y guarda la conexión', async () => {
  const net = mockNetwork(ATTACKER);
  try {
    const handler = loadStrava();
    const res = fakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { code: 'abc', state: signState('strava-state-secret', ATTACKER) } }, res);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    assert.equal(res.body.ok, true);
    const saved = net.writes.find(w => w.url.includes('/rest/v1/strava_connections'));
    assert.ok(saved, 'se guardó la conexión');
    assert.equal(JSON.parse(saved.body).user_id, ATTACKER);
  } finally { net.restore(); }
});

test('POST: si la marca rechaza el code, el paso 2 informa el error (no dice ok)', async () => {
  const real = global.fetch;
  global.fetch = async (url) => {
    url = String(url);
    if (url.includes('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: ATTACKER }) };
    if (url.includes('strava.com/oauth/token')) return { ok: true, status: 200, json: async () => ({ message: 'Bad Request' }) };
    return { ok: true, status: 200, json: async () => [], text: async () => '' };
  };
  try {
    const handler = loadStrava();
    const res = fakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { code: 'malo', state: signState('strava-state-secret', ATTACKER) } }, res);
    assert.equal(res.code, 502);
    assert.equal(res.body.ok, false);
  } finally { global.fetch = real; }
});

test('las 5 marcas usan el flujo en dos pasos', () => {
  const fs = require('fs'), path = require('path');
  for (const p of ['strava', 'polar', 'wahoo', 'suunto', 'coros']) {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'api', `${p}-auth.js`), 'utf8');
    assert.match(src, new RegExp(`withOAuthLink\\(linkAccount, \\{ provider: '${p}'`), p);
  }
});
