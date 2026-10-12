// Panel admin (api/admin-stats.js): solo entra quien esté en ADMIN_EMAILS, con el mail confirmado. Falla cerrado.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
const handler = require('../api/admin-stats.js');

function mkRes() {
  const r = { code: null, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}
function fakeFetch(user, rpcBody, rpcOk = true) {
  return async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: !!user, json: async () => user };
    if (u.includes('/rpc/admin_stats')) return { ok: rpcOk, status: rpcOk ? 200 : 404, json: async () => rpcBody, text: async () => 'nope' };
    throw new Error('url inesperada ' + u);
  };
}
const call = async (query, token = 'Bearer t') => {
  const res = mkRes();
  await handler({ method: 'GET', headers: { authorization: token, origin: 'https://zancada.org' }, query }, res);
  return res;
};

test('sin sesión: 401', async () => {
  process.env.ADMIN_EMAILS = 'yo@x.com';
  global.fetch = fakeFetch(null);
  assert.equal((await call({}, '')).code, 401);
});

test('falla cerrado: sin ADMIN_EMAILS nadie entra', async () => {
  delete process.env.ADMIN_EMAILS;
  global.fetch = fakeFetch({ id: 'u1', email: 'yo@x.com', email_confirmed_at: '2026-01-01' }, {});
  assert.equal((await call({})).code, 403);
});

test('un mail que no es admin recibe 403 (con y sin probe)', async () => {
  process.env.ADMIN_EMAILS = 'yo@x.com';
  global.fetch = fakeFetch({ id: 'u2', email: 'otro@x.com', email_confirmed_at: '2026-01-01' }, {});
  assert.equal((await call({})).code, 403);
  assert.equal((await call({ probe: '1' })).code, 403);
});

test('el mail del admin sin confirmar recibe 403', async () => {
  process.env.ADMIN_EMAILS = 'yo@x.com';
  global.fetch = fakeFetch({ id: 'u1', email: 'yo@x.com', email_confirmed_at: null }, {});
  assert.equal((await call({})).code, 403);
});

test('admin: probe responde admin:true y sin probe devuelve los números', async () => {
  process.env.ADMIN_EMAILS = 'Otro@x.com, YO@x.com';
  global.fetch = fakeFetch({ id: 'u1', email: 'yo@x.com', email_confirmed_at: '2026-01-01' }, { users: { total: 12 } });
  const p = await call({ probe: '1' });
  assert.equal(p.code, 200); assert.deepEqual(p.body, { admin: true });
  const s = await call({});
  assert.equal(s.code, 200); assert.equal(s.body.users.total, 12);
  assert.equal(s.headers['Cache-Control'], 'no-store');
});

test('si falta correr el SQL, avisa con un 502 claro', async () => {
  process.env.ADMIN_EMAILS = 'yo@x.com';
  global.fetch = fakeFetch({ id: 'u1', email: 'yo@x.com', email_confirmed_at: '2026-01-01' }, null, false);
  const r = await call({});
  assert.equal(r.code, 502); assert.match(r.body.error, /admin_stats/);
});

test('devuelve los límites con el porcentaje usado (Strava, base, usuarios activos y Zonda)', async () => {
  process.env.ADMIN_EMAILS = 'yo@x.com';
  process.env.CHAT_DAILY_LIMIT = '60';
  delete process.env.STRAVA_ATHLETE_LIMIT;
  global.fetch = fakeFetch({ id: 'u1', email: 'yo@x.com', email_confirmed_at: '2026-01-01' },
    { users: { signed_in_30d: 500 }, watches: { strava: 9 }, db: { size_bytes: 400 * 1024 * 1024 }, chat: { max_user_today: 30 } });
  const r = await call({});
  const by = Object.fromEntries(r.body.limits.map(l => [l.key, l]));
  assert.equal(by.strava.limit, 10); assert.equal(by.strava.pct, 90);
  assert.equal(by.db.used, 400); assert.equal(by.db.pct, 80);
  assert.equal(by.mau.pct, 1);
  assert.equal(by.chat.limit, 60); assert.equal(by.chat.pct, 50);
});

test('los límites se pueden ajustar con variables de entorno', async () => {
  process.env.ADMIN_EMAILS = 'yo@x.com';
  process.env.STRAVA_ATHLETE_LIMIT = '100';
  global.fetch = fakeFetch({ id: 'u1', email: 'yo@x.com', email_confirmed_at: '2026-01-01' }, { watches: { strava: 9 } });
  const r = await call({});
  assert.equal(r.body.limits.find(l => l.key === 'strava').limit, 100);
  delete process.env.STRAVA_ATHLETE_LIMIT;
});
