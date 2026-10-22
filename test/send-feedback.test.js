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
