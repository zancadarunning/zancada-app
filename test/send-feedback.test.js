// send-feedback: el mensaje de "Ayudanos a mejorar" solo lo puede mandar una cuenta con el mail confirmado.
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.RESEND_API_KEY = 're_test';
process.env.FEEDBACK_TO_EMAIL = 'info@example.com';
const handler = require('../api/send-feedback.js');

function mkRes() { const r = { code: null, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.end = () => r; return r; }
function setup(user) {
  const log = { resendCalls: 0 };
  global.fetch = async (url) => {
    const u = String(url);
    const ok = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (u.includes('/auth/v1/user')) return ok(user);
    if (u.includes('api.resend.com')) { log.resendCalls++; return ok({ id: 'x' }); }
    if (u.includes('/rest/v1/')) return ok([]);
    if (u.includes('/rpc/')) return ok(true);
    return ok({});
  };
  return log;
}
const call = async () => { const res = mkRes(); await handler({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body: { message: 'hola' } }, res); return res; };

test('una cuenta con el mail sin confirmar no puede mandar feedback', async () => {
  const log = setup({ id: 'u1', email: 'a@b.com' });
  const r = await call();
  assert.equal(r.code, 403);
  assert.equal(log.resendCalls, 0);
});

test('una cuenta con el mail confirmado manda el feedback', async () => {
  const log = setup({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01' });
  const r = await call();
  assert.equal(r.code, 200);
  assert.equal(log.resendCalls, 1);
});

// Reportar una respuesta de Zonda (requisito de Google Play para apps con chat de IA): mismo canal, asunto propio y límite propio.
test('un reporte de una respuesta de Zonda sale con su propio asunto y su propio límite (no el del feedback)', async () => {
  const sent = { subject: null, cooldownKeys: [], capKeys: [] };
  global.fetch = async (url, opts) => {
    const u = String(url);
    const ok = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01' });
    if (u.includes('api.resend.com')) { sent.subject = JSON.parse(opts.body).subject; return ok({ id: 'x' }); }
    if (u.includes('/rpc/check_sync_cooldown')) { sent.cooldownKeys.push(JSON.parse(opts.body)); return ok(true); }
    if (u.includes('/rpc/')) { sent.capKeys.push(String(opts && opts.body)); return ok(true); }
    if (u.includes('/rest/v1/')) return ok([]);
    return ok({});
  };
  const res = mkRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body: { kind: 'report', message: 'REPORTE DE UNA RESPUESTA DE ZONDA' } }, res);
  assert.equal(res.code, 200);
  assert.match(sent.subject, /Reporte de una respuesta de Zonda/);
  assert.equal(sent.cooldownKeys[0].p_provider, 'report');
  assert.equal(sent.cooldownKeys[0].p_cooldown_ms, 60 * 1000);
  const { capId } = require('../api/_lib/daily-cap');
  const capJoined = sent.capKeys.join(' ');
  assert.ok(capJoined.includes(capId('report-global', null)), 'tope global propio del reporte');
  assert.ok(!capJoined.includes(capId('feedback-global', null)), 'no gasta el tope del feedback');
});

test('el feedback común sigue con su asunto y su límite de siempre', async () => {
  const sent = { subject: null, key: null };
  global.fetch = async (url, opts) => {
    const u = String(url);
    const ok = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01' });
    if (u.includes('api.resend.com')) { sent.subject = JSON.parse(opts.body).subject; return ok({ id: 'x' }); }
    if (u.includes('/rpc/check_sync_cooldown')) { sent.key = JSON.parse(opts.body).p_provider; return ok(true); }
    if (u.includes('/rpc/')) return ok(true);
    return ok([]);
  };
  const res = mkRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body: { message: 'hola' } }, res);
  assert.equal(res.code, 200);
  assert.match(sent.subject, /Ayudanos a mejorar/);
  assert.equal(sent.key, 'feedback');
});
