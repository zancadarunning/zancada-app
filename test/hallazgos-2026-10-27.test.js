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

// ---- borrar cuenta con Google/Apple: código por mail ----
function mkDeleteHarness(provider) {
  process.env.RESEND_API_KEY = 're_test';
  const store = []; const sentMails = []; const wiped = { n: 0 };
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url), method = (opts && opts.method) || 'GET';
    const ok = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01', app_metadata: { provider } });
    if (u.includes('/rpc/')) return ok(true);
    if (u.includes('api.resend.com')) { sentMails.push(JSON.parse(opts.body)); return ok({ id: 'm1' }); }
    if (u.includes('/rest/v1/sent_notifications') && u.includes('kind=eq.delete_code')) {
      if (method === 'GET') return ok(store.slice());
      if (method === 'DELETE') { store.length = 0; return ok([]); }
    }
    if (u.includes('/rest/v1/sent_notifications') && method === 'POST') { store.push({ period: JSON.parse(opts.body).period }); return ok([]); }
    if (u.includes('/rest/v1/') && method === 'DELETE') { wiped.n++; return ok([]); }
    if (u.includes('/rest/v1/') && method === 'GET') return ok([]);
    return ok({});
  };
  const handler = require('../api/delete-account.js');
  const call = async body => { const res = { code: null, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } }; await handler({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body }, res); return res; };
  return { call, sentMails, wiped, restore: () => { global.fetch = realFetch; } };
}

test('Google/Apple sin ingreso reciente: borrar exige el código que llega por mail (una sesión robada no alcanza), vale una sola vez', async () => {
  const h = mkDeleteHarness('google');
  try {
    let r = await h.call({ mode: 'data' });
    assert.equal(r.code, 403); assert.equal(r.body.error, 'code_required'); assert.equal(h.wiped.n, 0, 'no se borró nada');
    r = await h.call({ mode: 'data', code: '123456' });
    assert.equal(r.code, 403, 'un código inventado no sirve (todavía no se pidió ninguno)');
    r = await h.call({ action: 'send-code', lang: 'en' });
    assert.equal(r.code, 200); assert.equal(r.body.needed, true);
    assert.equal(h.sentMails.length, 1); assert.deepEqual(h.sentMails[0].to, ['a@b.com']);
    const code = (h.sentMails[0].text.match(/[0-9]{6}/) || [])[0];
    assert.ok(code, 'el mail trae el código');
    r = await h.call({ mode: 'data', code: code === '000000' ? '000001' : '000000' });
    assert.equal(r.code, 403, 'código equivocado');
    r = await h.call({ mode: 'data', code });
    assert.equal(r.code, 200, JSON.stringify(r.body)); assert.ok(h.wiped.n > 0);
    r = await h.call({ mode: 'data', code });
    assert.equal(r.code, 403, 'el código ya se gastó');
  } finally { h.restore(); }
});

test('cuentas con contraseña no usan el código (siguen con la contraseña reciente) y el código solo se pide a Google/Apple', async () => {
  const h = mkDeleteHarness('email');
  try {
    const r = await h.call({ action: 'send-code' });
    assert.equal(r.code, 403); assert.equal(r.body.error, 'recent_login_required', 'con contraseña sigue mandando la regla de siempre'); assert.equal(h.sentMails.length, 0, 'nunca se manda un código a una cuenta con contraseña');
  } finally { h.restore(); }
});

test('login-alert: cada cuenta tiene su propio tope diario antes del global (una sola cuenta no silencia los avisos de todas)', () => {
  const src = read('api/login-alert.js');
  const iUser = src.indexOf("'login-alert-user'"), iGlobal = src.indexOf("'login-alert-global'");
  assert.ok(iUser > 0 && iGlobal > iUser, 'el tope por cuenta va antes del global');
});

// ---- sesión por la URL (login CSRF): PKCE + enlaces de mail con token_hash ----
test('el cliente de Supabase usa PKCE y los enlaces de los mails se canjean con verifyOtp (no hay sesión por #access_token)', () => {
  const app = read('app.js');
  assert.ok(/createClient\(SUPABASE_URL, SUPABASE_ANON_KEY, \{ auth: \{ storage: dualAuthStorage, flowType: 'pkce' \} \}\)/.test(app), "falta flowType: 'pkce'");
  assert.ok(app.includes('verifyOtp({ token_hash: th, type })'));
  assert.ok(app.includes('await consumeEmailLinkParams();'), 'se canjea el enlace antes de leer la sesión');
  // nada procesa a mano un access_token de la URL
  assert.ok(!/setSession\(/.test(app) && !/location\.hash/.test(app), 'nada lee tokens sueltos de la URL');
  for (const [f, type] of [['email-templates/reset-password.html', 'recovery'], ['email-templates/confirm-signup.html', 'email']]) {
    const tpl = read(f);
    assert.ok(tpl.includes('{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=' + type), f);
    assert.ok(!tpl.includes('{{ .ConfirmationURL }}'), f + ': el enlace viejo (con tokens en la URL) ya no se usa');
  }
});

test('cada idioma tiene los textos nuevos (código por mail y enlace vencido)', () => {
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = read('locales/' + l + '.js');
    for (const k of ['reauth_code_label', 'reauth_code_text', 'reauth_code_confirm', 'reauth_code_send_error', 'login_link_invalid']) assert.ok(s.includes(k + ':'), l + ' ' + k);
    assert.ok(read('locales/' + l + '.js').includes('{email}'), l + ' reauth_code_text lleva {email}');
  }
});
