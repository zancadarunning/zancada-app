// test/security-pass2.test.js
//
// Segunda ronda de seguridad:
//  - acciones sin vuelta atrás (borrar la cuenta o los datos) exigen un inicio de sesión reciente a las cuentas con contraseña;
//  - el secreto de los crons se compara en tiempo constante;
//  - los ids que vienen de los relojes solo llevan caracteres seguros (terminan dentro de atributos HTML del cliente).

const test = require('node:test');
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.CRON_SECRET = 'un-secreto-largo-de-prueba';

const verifyUser = require('../api/_lib/verify-user');
const requireCronSecret = require('../api/_lib/require-cron-secret');
const { safeId } = require('../api/_lib/safe-id');
const deleteHandler = require('../api/delete-account.js');

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = amr => `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', amr })}.firma`;
const nowSec = () => Math.floor(Date.now() / 1000);

test('lastAuthAtFromToken: lee el momento del último ingreso (amr) del token y devuelve 0 si no se puede', () => {
  const t0 = nowSec() - 120;
  assert.equal(verifyUser.lastAuthAtFromToken(jwt([{ method: 'password', timestamp: t0 - 500 }, { method: 'password', timestamp: t0 }])), t0);
  assert.equal(verifyUser.lastAuthAtFromToken('basura'), 0);
  assert.equal(verifyUser.lastAuthAtFromToken(jwt(undefined)), 0);
});

test('isRecentLogin: cuentas con contraseña necesitan un ingreso de los últimos 10 minutos; Google/Apple no se exige', () => {
  const t = nowSec();
  assert.equal(verifyUser.isRecentLogin({ provider: 'email', lastAuthAt: t - 60 }, 600), true);
  assert.equal(verifyUser.isRecentLogin({ provider: 'email', lastAuthAt: t - 3600 }, 600), false, 'sesión vieja');
  assert.equal(verifyUser.isRecentLogin({ provider: 'email', lastAuthAt: 0 }, 600), false, 'sin dato: se pide de nuevo');
  assert.equal(verifyUser.isRecentLogin({ provider: 'email', lastAuthAt: t + 100000 }, 600), false, 'fecha imposible');
  assert.equal(verifyUser.isRecentLogin({ provider: 'google', lastAuthAt: 0 }, 600), true);
  assert.equal(verifyUser.isRecentLogin({ provider: 'apple', lastAuthAt: 0 }, 600), true);
});

function mkRes() { const r = { code: null, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.end = () => r; return r; }
function setupDelete(provider) {
  const log = { deleted: 0, authDeleted: false };
  global.fetch = async (url, opts) => {
    const u = String(url), method = (opts && opts.method) || 'GET';
    const ok = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01', app_metadata: { provider } });
    if (u.includes('/auth/v1/admin/users/') && method === 'DELETE') { log.authDeleted = true; return ok({}); }
    if (u.includes('/rest/v1/') && method === 'DELETE') { log.deleted++; return ok([]); }
    if (u.includes('/rest/v1/') && method === 'GET') return ok([]);
    return ok({});
  };
  return log;
}
const callDelete = async (token, body) => { const res = mkRes(); await deleteHandler({ method: 'POST', headers: { authorization: 'Bearer ' + token, origin: 'https://zancada.org' }, body }, res); return res; };

test('delete-account: una cuenta con contraseña y sesión vieja recibe 403 y NO se borra nada (una sesión robada no alcanza)', async () => {
  const log = setupDelete('email');
  for (const body of [{}, { mode: 'data' }]) {
    const r = await callDelete(jwt([{ method: 'password', timestamp: nowSec() - 7200 }]), body);
    assert.equal(r.code, 403);
    assert.equal(r.body.error, 'recent_login_required');
  }
  assert.equal(log.deleted, 0);
  assert.equal(log.authDeleted, false);
});

test('delete-account: con un ingreso reciente (la app vuelve a pedir la contraseña) se borra normalmente', async () => {
  const log = setupDelete('email');
  const r = await callDelete(jwt([{ method: 'password', timestamp: nowSec() - 30 }]), {});
  assert.equal(r.code, 200);
  assert.equal(log.authDeleted, true);
});

test('delete-account: las cuentas de Google/Apple sin ingreso reciente necesitan el código por mail (ver test/hallazgos-2026-10-27.test.js)', async () => {
  const log = setupDelete('google');
  const r = await callDelete('token-que-no-es-jwt', {});
  assert.equal(r.code, 403);
  assert.equal(r.body.error, 'code_required');
  assert.equal(log.authDeleted, false);
});

test('requireCronSecret: acepta el secreto correcto y rechaza uno distinto, más corto, más largo o vacío', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
  const check = auth => requireCronSecret({ headers: { authorization: auth }, url: '/api/x', method: 'GET' });
  assert.equal(await check('Bearer un-secreto-largo-de-prueba'), true);
  assert.equal(await check('Bearer un-secreto-largo-de-pruebA'), false);
  assert.equal(await check('Bearer un-secreto'), false);
  assert.equal(await check('Bearer un-secreto-largo-de-prueba-y-mas'), false);
  assert.equal(await check(''), false);
  assert.equal(await check('un-secreto-largo-de-prueba'), false, 'sin el prefijo Bearer');
});

test('safeId: un id normal queda igual; comillas, signos y espacios se descartan', () => {
  assert.equal(safeId(123456789), '123456789');
  assert.equal(safeId('abc_DEF-9.1'), 'abc_DEF-9.1');
  assert.equal(safeId("x');alert(1);('"), 'xalert1');
  assert.equal(safeId('a b"c<d>'), 'abcd');
  assert.equal(safeId(null), '');
  assert.equal(safeId('x'.repeat(500)).length, 80);
});
