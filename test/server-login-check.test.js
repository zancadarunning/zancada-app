// Auditoría 2026-11-03 (#43): aviso de inicio de sesión desde un dispositivo nuevo visto desde el servidor (los ingresos que no pasan por la app).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkNewLogins } = require('../api/_lib/server-login-check');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split(String.fromCharCode(13)).join('');
const NOW = Date.parse('2026-11-03T12:00:00Z');
const U1 = '11111111-1111-4111-8111-111111111111';
const S1 = '22222222-2222-4222-8222-222222222222';
const CURL = 'curl/8.4.0';
const IPHONE_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Capacitor';

// Simula la base + Resend. cfg: sessions, known (labels), accountCreated, claimRows, rpcStatus, resendOk
function makeFetch(cfg, log) {
  return async (url, opts) => {
    const u = String(url), m = (opts && opts.method) || 'GET';
    log.push(m + ' ' + u.replace(/^https:\/\/x\.test/, ''));
    const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (u.includes('/rpc/recent_auth_sessions')) return cfg.rpcStatus ? json({}, false, cfg.rpcStatus) : json(cfg.sessions);
    if (u.includes('/auth/v1/admin/users/')) return json({ email: 'a@b.test', email_confirmed_at: '2026-01-01T00:00:00Z', created_at: cfg.accountCreated || '2026-01-01T00:00:00Z' });
    if (u.includes('/known_devices')) return json((cfg.known || []).map(label => ({ label })));
    if (u.includes('/rpc/check_sync_cooldown') || u.includes('/rpc/')) return json(true);
    if (u.includes('/app_state')) return json([{ lang: 'en', tz: 'America/Argentina/Buenos_Aires' }]);
    if (u.includes('/sent_notifications') && m === 'POST') return json(cfg.claimRows || [{ user_id: U1 }]);
    if (u.includes('/sent_notifications') && m === 'DELETE') return json([]);
    if (u.startsWith('https://api.resend.com/emails')) { log.mail = JSON.parse(opts.body); return json({}, cfg.resendOk !== false, cfg.resendOk === false ? 500 : 200); }
    return json({});
  };
}
async function run(cfg, extra) {
  const log = [];
  const real = global.fetch;
  global.fetch = makeFetch(cfg, log);
  try {
    const sent = await checkNewLogins(Object.assign({ base: 'https://x.test', key: 'k', resendKey: 'rk', now: NOW }, extra || {}));
    return { sent, log };
  } finally { global.fetch = real; }
}
const session = (ua, minsAgo = 20) => ({ session_id: S1, user_id: U1, created_at: new Date(NOW - minsAgo * 60000).toISOString(), user_agent: ua });

test('un ingreso desde un tipo de dispositivo que la cuenta nunca usó manda UN mail, en el idioma de la persona y a su correo', async () => {
  const { sent, log } = await run({ sessions: [session(CURL)], known: ['iPhone · app'] });
  assert.equal(sent, 1);
  assert.deepEqual(log.mail.to, ['a@b.test']);
  assert.match(log.mail.subject, /New sign-in/, 'idioma de la cuenta (en)');
  assert.ok(log.mail.text.includes('unknown device'), 'dice qué dispositivo');
  assert.ok(!/\b\d{1,3}(\.\d{1,3}){3}\b/.test(log.mail.text), 'sin direcciones IP');
  assert.ok(log.some(l => l.startsWith('POST') && l.includes('/sent_notifications')), 'reclama la sesión antes de mandar');
});

test('el mismo tipo de dispositivo que la cuenta ya usa NO avisa (eso lo cubre la app)', async () => {
  const { sent, log } = await run({ sessions: [session(IPHONE_APP)], known: ['iPhone · app'] });
  assert.equal(sent, 0);
  assert.equal(log.mail, undefined);
});

test('sin dispositivos conocidos (sin historia), o una cuenta de hace minutos, no avisa', async () => {
  assert.equal((await run({ sessions: [session(CURL)], known: [] })).sent, 0);
  const created = new Date(NOW - 25 * 60000).toISOString();   // alta 5 min antes de la sesión de hace 20
  assert.equal((await run({ sessions: [session(CURL)], known: ['iPhone · app'], accountCreated: created })).sent, 0);
});

test('una sesión ya avisada por otra corrida no repite el mail, y si falla Resend se devuelve el reclamo para reintentar', async () => {
  assert.equal((await run({ sessions: [session(CURL)], known: ['iPhone · app'], claimRows: [] })).sent, 0, 'reclamo ya existente');
  const r = await run({ sessions: [session(CURL)], known: ['iPhone · app'], resendOk: false });
  assert.equal(r.sent, 0);
  assert.ok(r.log.some(l => l.startsWith('DELETE') && l.includes('/sent_notifications') && l.includes('kind=eq.login_srv')), 'libera el reclamo');
});

test('sin la función SQL, sin clave de mail o con la red caída: no hace nada y no lanza', async () => {
  assert.equal((await run({ rpcStatus: 404 })).sent, 0);
  assert.equal((await run({ sessions: [session(CURL)], known: ['iPhone · app'] }, { resendKey: '' })).sent, 0);
  const real = global.fetch;
  global.fetch = async () => { throw new Error('red'); };
  try { assert.equal(await checkNewLogins({ base: 'https://x.test', key: 'k', resendKey: 'rk', now: NOW }), 0); } finally { global.fetch = real; }
});

test('cableado: el cron de recordatorios lo llama sin frenar el envío; la función SQL es solo lectura, sin IP y solo para el backend', () => {
  const src = read('api/send-reminders.js');
  assert.ok(src.includes("const { checkNewLogins } = require('./_lib/server-login-check');"));
  assert.ok(src.includes('await checkNewLogins().catch(() => {});'));
  const sql = read('sql/recent_auth_sessions.sql');
  assert.ok(sql.includes('SECURITY DEFINER') && sql.includes('SET search_path = public, auth, pg_temp'));
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.recent_auth_sessions(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;'));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.recent_auth_sessions(timestamptz, timestamptz) TO service_role;'));
  assert.ok(!/s\.ip\b/.test(sql.replace(/--.*$/gm, '')), 'la función no devuelve la dirección IP');
  assert.ok(!/CREATE (OR REPLACE )?TRIGGER/i.test(sql), 'ningún trigger sobre auth');
});
