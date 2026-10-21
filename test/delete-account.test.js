// delete-account: modo "datos" (Borrar mis datos) y cuenta completa. Verifica qué se borra y que un fallo no se disimule.
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
const handler = require('../api/delete-account.js');

function mkRes() { const r = { code: null, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.end = () => r; return r; }
function setup({ failTable } = {}) {
  const log = { deleted: [], authDeleted: false };
  global.fetch = async (url, opts) => {
    const u = String(url), method = (opts && opts.method) || 'GET';
    const ok = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01' });
    if (u.includes('/auth/v1/admin/users/') && method === 'DELETE') { log.authDeleted = true; return ok({}); }
    if (u.includes('/rest/v1/') && method === 'DELETE') {
      const table = u.split('/rest/v1/')[1].split('?')[0];
      log.deleted.push(table + '?' + u.split('?')[1]);
      return failTable === table ? ok({ message: 'boom' }, 500) : ok([]);
    }
    if (u.includes('/rest/v1/') && method === 'GET') return ok([]);   // sin conexiones de relojes
    return ok({});
  };
  return log;
}
const call = async (body) => { const res = mkRes(); await handler({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body }, res); return res; };

test('mode "data": borra todo lo de la persona (conexiones, push, chat, social, estado) y NO borra el usuario de acceso', async () => {
  const log = setup();
  const r = await call({ mode: 'data' });
  assert.equal(r.code, 200);
  assert.equal(log.authDeleted, false);
  const tables = log.deleted.map(d => d.split('?')[0]);
  for (const t of ['app_state', 'strava_connections', 'suunto_connections', 'wahoo_connections', 'polar_connections', 'coros_connections', 'push_subscriptions', 'chat_usage', 'sent_notifications', 'run_feed', 'usernames', 'follows']) {
    assert.ok(tables.includes(t), 'debería borrar ' + t);
  }
  assert.ok(log.deleted.every(d => d.includes('u1')), 'cada borrado está acotado al usuario');
});

test('mode "data": si falla un borrado responde 500 (no simula que se borró todo)', async () => {
  setup({ failTable: 'push_subscriptions' });
  const r = await call({ mode: 'data' });
  assert.equal(r.code, 500);
  assert.ok(r.body.failed.includes('push_subscriptions'));
});

test('sin mode: se borra la cuenta entera (usuario de acceso incluido)', async () => {
  const log = setup();
  const r = await call({});
  assert.equal(r.code, 200);
  assert.equal(log.authDeleted, true);
});

// En producción push_subscriptions y strava_connections apuntan a auth.users SIN "ON DELETE CASCADE": mientras tengan filas la base no deja borrar el
// usuario. El endpoint tiene que vaciarlas ANTES de pedir el borrado del usuario.
test('sin mode: vacía push_subscriptions y strava_connections ANTES de borrar el usuario (la base no tiene cascada ahí)', async () => {
  const order = [];
  const base = global.fetch;
  setup();
  const inner = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url), method = (opts && opts.method) || 'GET';
    if (method === 'DELETE' && u.includes('/rest/v1/')) order.push('rest:' + u.split('/rest/v1/')[1].split('?')[0]);
    if (method === 'DELETE' && u.includes('/auth/v1/admin/users/')) order.push('auth-user');
    return inner(url, opts);
  };
  const r = await call({});
  assert.equal(r.code, 200);
  const authAt = order.indexOf('auth-user');
  for (const t of ['push_subscriptions', 'strava_connections']) {
    const at = order.indexOf('rest:' + t);
    assert.ok(at >= 0 && at < authAt, `${t} tiene que borrarse antes que el usuario (orden: ${order.join(' > ')})`);
  }
  global.fetch = base;
});

test('sin mode: si no se pueden vaciar esas tablas responde 500 y NO toca el usuario', async () => {
  const log = setup({ failTable: 'push_subscriptions' });
  const r = await call({});
  assert.equal(r.code, 500);
  assert.equal(log.authDeleted, false);
});
