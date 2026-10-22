// Aviso por mail de inicio de sesión desde un dispositivo nuevo (api/login-alert.js + api/_lib/login-alert.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.RESEND_API_KEY = 're_test_key';
const handler = require('../api/login-alert.js');
const lib = require('../api/_lib/login-alert.js');

const mkRes = () => { const r = { code: null, body: null, headers: {} }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.end = () => r; return r; };
const ID = n => String(n).padStart(32, 'a');
const hashOf = (uid, id) => crypto.createHash('sha256').update(uid + ':' + id).digest('hex');
const ANDROID_APP_UA = 'Mozilla/5.0 (Linux; Android 14; Moto E; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

// Base y Resend simulados con las reglas reales (insert que ignora duplicados, borrado por filtro, etc.)
function world({ user = {}, devices = [], cooldownOk = true, tableMissing = false, resendOk = true } = {}) {
  const w = { devices: devices.map((d, i) => ({ user_id: 'u1', device_hash: d.device_hash || hashOf('u1', ID(i + 1)), last_seen: d.last_seen || '2026-01-0' + (i % 9 + 1) })), emails: [], patched: 0, deleted: [], inserted: [], cooldownCalls: 0 };
  const account = { id: 'u1', email: 'ana@example.com', email_confirmed_at: '2026-01-01', created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, ...user };
  global.fetch = async (url, opts) => {
    const u = String(url), method = (opts && opts.method) || 'GET';
    const ok = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (u.includes('/auth/v1/user')) return ok(account);
    if (u.includes('/rpc/check_sync_cooldown')) { w.cooldownCalls++; return ok(cooldownOk); }
    if (u.includes('api.resend.com')) { const b = JSON.parse(opts.body); w.emails.push(b); return resendOk ? ok({ id: 'e1' }) : ok({ message: 'boom' }, 500); }
    if (u.includes('/rest/v1/known_devices')) {
      if (tableMissing) return ok({ message: 'relation does not exist' }, 404);
      if (method === 'GET') return ok(w.devices.filter(d => d.user_id === 'u1').sort((a, b) => a.last_seen.localeCompare(b.last_seen)).map(d => ({ device_hash: d.device_hash })));
      if (method === 'POST') {
        const row = JSON.parse(opts.body);
        if (w.devices.some(d => d.user_id === row.user_id && d.device_hash === row.device_hash)) return ok([]);   // ignore-duplicates: sin fila devuelta
        w.devices.push({ ...row, last_seen: '2026-10-21' }); w.inserted.push(row); return ok([row], 201);
      }
      if (method === 'PATCH') { w.patched++; return ok([]); }
      if (method === 'DELETE') { const h = decodeURIComponent(u.split('device_hash=eq.')[1].split('&')[0]); w.deleted.push(h); w.devices = w.devices.filter(d => d.device_hash !== h); return ok([]); }
    }
    return ok({});
  };
  return w;
}
const call = async (body, headers = {}) => {
  const res = mkRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://www.zancada.org', 'user-agent': ANDROID_APP_UA, 'x-vercel-ip-country': 'AR', ...headers }, body }, res);
  return res;
};

test('sin sesión: 401; identificador inválido: 400 (y no toca la base)', async () => {
  const w = world();
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => '' });
  assert.equal((await call({ deviceId: ID(9) })).code, 401);
  world();
  for (const bad of [undefined, '', 'x', 'g'.repeat(32), ID(1).toUpperCase(), 123, { a: 1 }, ID(1) + 'a']) assert.equal((await call({ deviceId: bad })).code, 400, 'debería rechazar ' + JSON.stringify(bad));
  assert.equal(w.emails.length, 0);
});

test('primer dispositivo de la cuenta: se registra en silencio (no hay mail)', async () => {
  const w = world();
  const r = await call({ deviceId: ID(1) });
  assert.equal(r.code, 200); assert.deepEqual([r.body.new, r.body.notified], [true, false]);
  assert.equal(w.devices.length, 1); assert.equal(w.emails.length, 0);
  assert.equal(w.inserted[0].device_hash, hashOf('u1', ID(1)), 'se guarda el hash, no el identificador');
  assert.ok(!JSON.stringify(w.inserted).includes(ID(1)));
});

test('dispositivo nuevo en una cuenta con historia: un mail al correo de la cuenta, con país y dispositivo, sin enlaces ni IP', async () => {
  const w = world({ devices: [{}] });
  const r = await call({ deviceId: ID(2), lang: 'es', tz: 'America/Argentina/Buenos_Aires' }, { 'x-forwarded-for': '203.0.113.9' });
  assert.deepEqual([r.body.new, r.body.notified], [true, true]);
  assert.equal(w.emails.length, 1);
  const m = w.emails[0];
  assert.deepEqual(m.to, ['ana@example.com']);
  assert.match(m.from, /@zancada\.org>?$/);
  assert.match(m.subject, /inicio de sesión/i);
  assert.match(m.text, /Android · app/); assert.match(m.text, /Argentina/); assert.match(m.text, /America\/Argentina\/Buenos_Aires/);
  assert.doesNotMatch(m.text, /https?:|www\./i, 'el mail no lleva enlaces');
  assert.ok(!JSON.stringify([m, w.inserted]).includes('203.0.113.9'), 'no se guarda ni se manda la IP');
  assert.equal(w.inserted[0].country, 'AR');
});

test('dispositivo ya conocido: no hay mail, solo se actualiza la última vez', async () => {
  const w = world({ devices: [{}, {}] });
  const r = await call({ deviceId: ID(2) });   // el 2º de la lista
  assert.deepEqual([r.body.new, w.emails.length, w.patched], [false, 0, 1]);
});

test('cuenta recién creada (menos de 10 minutos) o con mail sin confirmar: no avisa', async () => {
  let w = world({ devices: [{}], user: { created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString() } });
  assert.equal((await call({ deviceId: ID(5) })).body.notified, false); assert.equal(w.emails.length, 0);
  w = world({ devices: [{}], user: { email_confirmed_at: null } });
  assert.equal((await call({ deviceId: ID(6) })).body.notified, false); assert.equal(w.emails.length, 0);
});

test('dos pedidos a la vez del mismo dispositivo nuevo: UN solo mail', async () => {
  const w = world({ devices: [{}] });
  const [a, b] = await Promise.all([call({ deviceId: ID(7) }), call({ deviceId: ID(7) })]);
  assert.equal(w.emails.length, 1);
  assert.equal([a.body, b.body].filter(x => x.notified).length, 1);
});

test('si el mail no sale, el dispositivo se des-registra y el próximo ingreso lo reintenta', async () => {
  let w = world({ devices: [{}], resendOk: false });
  const r = await call({ deviceId: ID(8) });
  assert.deepEqual([r.code, r.body.notified], [200, false]);
  assert.ok(!w.devices.some(d => d.device_hash === hashOf('u1', ID(8))), 'no queda registrado');
  const w2 = world({ devices: [{}] });   // ahora el servicio anda
  assert.equal((await call({ deviceId: ID(8) })).body.notified, true); assert.equal(w2.emails.length, 1);
});

test('tope entre avisos: si se pasa, el dispositivo NO se registra (el aviso llega después, no se pierde)', async () => {
  const w = world({ devices: [{}], cooldownOk: false });
  const r = await call({ deviceId: ID(3) });
  assert.deepEqual([r.body.notified, r.body.reason], [false, 'cooldown']);
  assert.equal(w.devices.length, 1); assert.equal(w.emails.length, 0);
});

test('sin la tabla en la base (SQL sin correr): responde bien y no manda nada', async () => {
  const w = world({ tableMissing: true });
  const r = await call({ deviceId: ID(1) });
  assert.deepEqual([r.code, r.body.ok, w.emails.length], [200, true, 0]);
});

test('como mucho 20 dispositivos por cuenta: se descarta el que hace más que no se usa', async () => {
  const w = world({ devices: Array.from({ length: 20 }, (_, i) => ({ device_hash: 'h' + String(i).padStart(2, '0'), last_seen: '2026-01-' + String(i + 1).padStart(2, '0') })) });
  await call({ deviceId: ID(30) });
  assert.deepEqual(w.deleted, ['h00']);
});

test('idioma del mail: el pedido manda el suyo; uno desconocido cae en español', async () => {
  let w = world({ devices: [{}] });
  await call({ deviceId: ID(11), lang: 'en' }); assert.match(w.emails[0].subject, /New sign-in/);
  w = world({ devices: [{}] });
  await call({ deviceId: ID(12), lang: 'klingon' }); assert.match(w.emails[0].subject, /Nuevo inicio/);
});

test('texto del mail: los 6 idiomas, sin enlaces, con info@zancada.org y sin dejar llaves sin completar', () => {
  for (const l of lib.LANGS) {
    const { subject, text } = lib.buildAlertEmail({ lang: l, ua: ANDROID_APP_UA, countryHeader: 'ES', tz: 'Europe/Madrid', now: Date.UTC(2026, 9, 21, 20, 5) });
    assert.ok(subject.length > 10, l);
    assert.match(text, /info@zancada\.org/); assert.doesNotMatch(text, /https?:|www\.|undefined|\{|\}/i, l);
    assert.match(text, /Android/); assert.match(text, /Europe\/Madrid/);
  }
});

test('nombre del dispositivo, país y hora', () => {
  assert.equal(lib.deviceLabel(ANDROID_APP_UA, 'es'), 'Android · app');
  assert.equal(lib.deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1.15', 'es'), 'iPhone · navegador');
  assert.equal(lib.deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', 'en'), 'Windows · browser');
  assert.equal(lib.deviceLabel('curl/8', 'es'), 'dispositivo desconocido');
  assert.equal(lib.countryCode('ar'), 'AR'); assert.equal(lib.countryCode('XX'), null); assert.equal(lib.countryCode('<script>'), null); assert.equal(lib.countryCode(undefined), null);
  assert.match(lib.placeName('AR', 'es'), /Argentina/); assert.equal(lib.placeName(null, 'es'), 'desconocido');
  assert.match(lib.whenText(Date.UTC(2026, 9, 21, 20, 5), 'No/Existe', 'es'), /\(UTC\)$/, 'zona inválida: cae en UTC');
});

test('el aviso no filtra ni el correo ni el identificador en los logs del servidor', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'login-alert.js'), 'utf8');
  assert.doesNotMatch(src, /console\.(log|error|warn)\([^)]*(auth\.email|deviceId|\bua\b)/);
});
