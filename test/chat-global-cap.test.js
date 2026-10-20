// test/chat-global-cap.test.js
//
// Cuando se agota el tope global diario del chat se avisa a Sentry (puede ser un abuso o simplemente que la app creció y hay que subir
// CHAT_GLOBAL_DAILY_LIMIT), pero como mucho una vez cada 30 minutos, y al usuario se le contesta el mensaje de "ocupado" sin gastar nada en Claude.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ANTHROPIC_API_KEY = 'sk-ant-de-prueba';

const alerts = [];
const sentryPath = require.resolve('../api/_lib/sentry');
require.cache[sentryPath] = {
  id: sentryPath, filename: sentryPath, loaded: true,
  exports: { withSentry: fn => fn, reportError: async () => {}, reportSecurityEvent: async (m, c) => { alerts.push({ m, c }); } }
};
const handler = require('../api/chat.js');

function mkRes() { const r = { code: null, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.end = () => r; return r; }

test('tope global agotado: contesta "ocupado", no llama a Claude y avisa a Sentry una sola vez por media hora', async () => {
  let anthropicCalls = 0, rpcCalls = 0;
  global.fetch = async (url, opts) => {
    const u = String(url);
    const ok = data => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01' });
    if (u.includes('increment_chat_usage')) { rpcCalls++; return ok(rpcCalls % 2 === 1); }   // 1.º: la persona dentro de su tope; 2.º: el global agotado
    if (u.includes('api.anthropic.com')) { anthropicCalls++; return ok({ content: [{ type: 'text', text: 'hola' }] }); }
    return ok({});
  };
  const call = async () => { const res = mkRes(); await handler({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body: { lang: 'es', system: 'x', messages: [{ role: 'user', content: 'hola' }] } }, res); return res; };

  const r1 = await call();
  assert.equal(r1.code, 200);
  assert.ok(r1.body.error && r1.body.error.message, 'mensaje de ocupado');
  assert.equal(anthropicCalls, 0);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].m, /tope global/i);

  const r2 = await call();
  assert.ok(r2.body.error);
  assert.equal(alerts.length, 1, 'no se repite el aviso dentro de los 30 minutos');
  assert.equal(anthropicCalls, 0);
});
