// Regresiones de la revisión de seguridad del 2026-10-27 (hallazgos confirmados por dos verificadores independientes y releídos en el código).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('delete-account: de verdad llama a deauthorize de Strava (antes faltaba el require y el error se tragaba)', async () => {
  const { encToken } = require('../api/_lib/token-crypto.js');
  const handler = require('../api/delete-account.js');
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url), method = (opts && opts.method) || 'GET';
    calls.push(method + ' ' + u.split('?')[0]);
    const ok = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01' });
    if (u.includes('/rest/v1/strava_connections') && method === 'GET') return ok([{ access_token: encToken('tok'), refresh_token: encToken('ref'), expires_at: Math.floor(Date.now() / 1000) + 3600 }]);
    if (u.includes('/rest/v1/') && method === 'GET') return ok([]);
    return ok({});
  };
  try {
    const res = { code: null, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body: { mode: 'data' } }, res);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    assert.ok(calls.includes('POST https://www.strava.com/oauth/deauthorize'), 'no se revocó el permiso en Strava: ' + calls.join(' | '));
  } finally { global.fetch = realFetch; }
});

test('Strava webhook: el idioma que guarda la persona no puede romper la revocación (clave propia, no heredada)', () => {
  const src = read('api/strava-webhook.js');
  assert.ok(src.includes("pick(REVOKED_MSGS, lang, 'es')"), 'REVOKED_MSGS[lang] con un lang controlado por el usuario (__proto__) abortaba el borrado de la conexión');
  assert.ok(!/REVOKED_MSGS\[lang\]/.test(src));
});

test('purgeStravaRunsForUser: si armar/mandar el aviso del chat falla, NO lanza (la conexión de Strava igual se borra después)', async () => {
  const { purgeStravaRunsForUser } = require('../api/_lib/strava-activity-helpers.js');
  const realFetch = global.fetch;
  global.fetch = async url => (String(url).includes('purge_provider_runs')
    ? { ok: true, status: 200, json: async () => [{ removed_count: 3, lang: '__proto__' }], text: async () => '' }
    : { ok: true, status: 200, json: async () => ({}), text: async () => '' });
  try {
    await purgeStravaRunsForUser('https://x.supabase.co', {}, 'u1', () => { throw new TypeError('mensaje roto'); });
  } finally { global.fetch = realFetch; }
});

test('push: un endpoint que WHATWG y url.parse() leen distinto (SSRF con "{" en el host) NO se acepta', () => {
  const { isTrustedPushEndpoint } = require('../api/_lib/push-endpoint.js');
  const url = require('url');
  const evil = [
    'https://evil.example{.push.services.mozilla.com/x',
    'https://169.254.169.254{.notify.windows.com/x',
    'https://evil.example`.push.apple.com/x',
    'https://evil.example".push.apple.com/x',
    'https://evil.example\\.push.services.mozilla.com/x',
    'https://user@evil.example/.push.apple.com',
    'https://evil.example:8443/x',
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://evil.example/fcm.googleapis.com',
    'https://fcm.googleapis.com.evil.example/x',
    'https://a..push.apple.com/x'
  ];
  for (const e of evil) assert.equal(isTrustedPushEndpoint(e), false, e);
  // los reales siguen pasando
  for (const g of ['https://fcm.googleapis.com/fcm/send/abc:def', 'https://updates.push.services.mozilla.com/wpush/v2/gAAA', 'https://web.push.apple.com/QGxyz', 'https://wns2-par02p.notify.windows.com/w/?token=abc']) assert.equal(isTrustedPushEndpoint(g), true, g);
  // la propiedad que importa: el host que ve web-push (url.parse) es el mismo que se validó
  assert.equal(url.parse('https://evil.example{.push.services.mozilla.com/x').hostname, 'evil.example');
});

test('push: web-push se llama con un tiempo de espera (un servidor que no responde no traba el cron)', () => {
  assert.ok(/sendNotification\([^;]*\{ timeout: 10000 \}\)/.test(read('api/send-reminders.js')));
  assert.ok(/sendNotification\([^;]*\{ timeout: 10000 \}\)/.test(read('api/_lib/notify-new-run.js')));
});

test('recuperar la contraseña también borra los dispositivos de aviso de las otras sesiones (un atacante no sigue recibiendo los avisos)', () => {
  const src = read('app.js');
  const i = src.indexOf('async function submitNewPassword');
  const body = src.slice(i, src.indexOf('document.getElementById(\'ob-terrain\')', i));
  assert.ok(body.includes("signOut({ scope: 'others' })"));
  assert.ok(body.includes("from('push_subscriptions').delete().eq('user_id', user.id).neq('device_id', pushDeviceId())"));
});
