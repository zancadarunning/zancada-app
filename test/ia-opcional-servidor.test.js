// IA opcional (2026-11-26): el servidor NO manda nada a la IA si la cuenta no la tiene activada. No alcanza con que la app oculte el botón: una pantalla vieja,
// un error o un pedido armado a mano tampoco pueden saltearlo. Si no se puede comprobar (base caída), tampoco se envía nada.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ANTHROPIC_API_KEY = 'sk-test';
const handler = require('../api/chat.js');
const { aiAllowed } = require('../api/_lib/ai-consent.js');

const body = { lang: 'es', system: 'Sos "Zonda", el entrenador virtual dentro de la app Zancada. Perfil: x', messages: [{ role: 'user', content: 'hola' }] };
function mkRes() { const r = { code: null, body: null }; r.setHeader = () => {}; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.end = () => r; return r; }

// consent: lo que devuelve la base para data->consent->ai ('fail' = la base responde error, 'throw' = se corta la red)
function setup(consent) {
  const calls = { anthropic: 0, usage: 0, consentUrl: '' };
  global.fetch = async (url) => {
    const u = String(url);
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
    if (u.includes('/auth/v1/user')) return ok({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01' });
    if (u.includes('/rest/v1/app_state')) {
      calls.consentUrl = u;
      if (consent === 'throw') throw new Error('sin red');
      if (consent === 'fail') return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
      return ok(consent === 'sin-fila' ? [] : [{ ai: consent }]);
    }
    if (u.includes('increment_chat_usage')) { calls.usage++; return ok(true); }
    if (u.includes('api.anthropic.com')) { calls.anthropic++; return ok({ content: [{ type: 'text', text: 'hola' }] }); }
    throw new Error('url inesperada ' + u);
  };
  return calls;
}
const call = async () => { const res = mkRes(); await handler({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body }, res); return res; };

test('con la IA activada el pedido llega a la IA, y se consulta el consentimiento de ESA cuenta', async () => {
  const c = setup(true);
  const r = await call();
  assert.equal(r.code, 200); assert.equal(c.anthropic, 1);
  assert.match(c.consentUrl, /user_id=eq\.u1(&|$)/);
  assert.match(c.consentUrl, /data->consent->ai/);
});

for (const [nombre, valor] of [['apagada', false], ['sin responder', null], ['texto "true" (no es true de verdad)', 'true'], ['cuenta sin datos guardados', 'sin-fila']]) {
  test('IA ' + nombre + ': 403 ai_disabled, nada llega a la IA y no gasta cupo', async () => {
    const c = setup(valor);
    const r = await call();
    assert.equal(r.code, 403);
    assert.equal(r.body.error.code, 'ai_disabled');
    assert.ok(r.body.error.message.length > 10);
    assert.equal(c.anthropic, 0);
    assert.equal(c.usage, 0);
  });
}

for (const caida of ['fail', 'throw']) {
  test('si no se puede comprobar el consentimiento (' + caida + ') no se envía nada a la IA', async () => {
    const c = setup(caida);
    const r = await call();
    assert.equal(r.code, 503);
    assert.equal(c.anthropic, 0);
  });
}

test('aiAllowed: true solo con true; null cuando no se pudo comprobar', async () => {
  setup(true); assert.equal(await aiAllowed('https://x.supabase.co', 'k', 'u1'), true);
  setup(false); assert.equal(await aiAllowed('https://x.supabase.co', 'k', 'u1'), false);
  setup('fail'); assert.equal(await aiAllowed('https://x.supabase.co', 'k', 'u1'), null);
});
