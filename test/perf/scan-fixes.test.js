// test/perf/scan-fixes.test.js
//
// Pruebas de las correcciones del escaneo de seguridad del 2026-10-08.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { isTrustedPushEndpoint } = require('../../api/_lib/push-endpoint');
const { checkSyncCooldown } = require('../../api/_lib/sync-cooldown');

const ROOT = path.join(__dirname, '..', '..');

test('push: solo se acepta https hacia servicios de push reales (sin SSRF a direcciones internas ni propias)', () => {
  const ok = [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/xyz',
    'https://web.push.apple.com/QAbc',
    'https://wns2-par02p.notify.windows.com/?token=1'
  ];
  const bad = [
    'http://fcm.googleapis.com/fcm/send/abc',             // sin https
    'https://169.254.169.254/latest/meta-data/',           // metadatos de la nube
    'https://localhost/x', 'https://127.0.0.1/x', 'https://zancada.org/api/chat',
    'https://fcm.googleapis.com.evil.example/x',           // dominio parecido
    'https://evilfcm.googleapis.com.attacker.io/x',
    'https://user:pass@fcm.googleapis.com/x',              // credenciales en la URL
    'https://fcm.googleapis.com:8443/x',                   // otro puerto
    'javascript:alert(1)', '', null, undefined, 42
  ];
  ok.forEach(u => assert.equal(isTrustedPushEndpoint(u), true, u));
  bad.forEach(u => assert.equal(isTrustedPushEndpoint(u), false, String(u)));
});

test('limitador: con failClosed, si el RPC falla NO deja pasar; sin failClosed sí (el botón Sincronizar no se rompe)', async () => {
  const realFetch = global.fetch;
  try {
    global.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
    assert.equal(await checkSyncCooldown('https://x.test', {}, 'u', 'feedback', 1000, { failClosed: true }), false);
    assert.equal(await checkSyncCooldown('https://x.test', {}, 'u', 'strava', 1000), true);
    global.fetch = async () => { throw new Error('red caída'); };
    assert.equal(await checkSyncCooldown('https://x.test', {}, 'u', 'remux', 1000, { failClosed: true }), false);
    assert.equal(await checkSyncCooldown('https://x.test', {}, 'u', 'strava', 1000), true);
    global.fetch = async () => ({ ok: true, status: 200, json: async () => false });
    assert.equal(await checkSyncCooldown('https://x.test', {}, 'u', 'feedback', 1000, { failClosed: true }), false, 'cooldown activo');
    global.fetch = async () => ({ ok: true, status: 200, json: async () => true });
    assert.equal(await checkSyncCooldown('https://x.test', {}, 'u', 'feedback', 1000, { failClosed: true }), true);
  } finally { global.fetch = realFetch; }
});

test('los endpoints que mandan emails o gastan CPU usan el limitador en modo failClosed', () => {
  for (const f of ['api/send-feedback.js', 'api/remux-video.js']) {
    assert.match(fs.readFileSync(path.join(ROOT, f), 'utf8'), /failClosed:\s*true/, f);
  }
});

test('el SQL nuevo del limitador no lee estado editable por el usuario y las tablas de conexiones quedan de solo lectura', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'sql', 'security_fixes_2026_10_08.sql'), 'utf8').replace(/--.*$/gm, '');
  assert.ok(!/app_state/i.test(sql), 'la función del limitador no debe leer app_state');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL ON public\.sync_cooldowns FROM PUBLIC, anon, authenticated/i);
  for (const t of ['strava', 'polar', 'wahoo', 'coros', 'suunto']) {
    assert.match(sql, new RegExp(`REVOKE INSERT, UPDATE ON public\\.${t}_connections\\s+FROM anon, authenticated`, 'i'), t);
  }
});

test('el chat cuenta también un "system" que no es texto en el tope de tamaño', () => {
  const src = fs.readFileSync(path.join(ROOT, 'api', 'chat.js'), 'utf8');
  assert.match(src, /JSON\.stringify\(system \|\| ''\)\.length/);
});
