// Defensas de /api/chat: forma de lo que se acepta del cliente, mail confirmado y tope global diario.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeChatRequest } = require('../api/_lib/chat-guard.js');
const TOOLS = require('./support/coach-tools.json');

const ok = (over) => Object.assign({ system: 'Sos Zonda', tools: TOOLS, messages: [{ role: 'user', content: 'hola' }] }, over);

test('acepta exactamente la forma que usa la app (system, las 7 herramientas, texto, tool_use y tool_result)', () => {
  const r = sanitizeChatRequest(ok({ messages: [
    { role: 'user', content: 'cambiame el jueves' },
    { role: 'assistant', content: [{ type: 'text', text: 'dale' }, { type: 'tool_use', id: 'toolu_1', name: 'mover_sesion', input: { dia: 'thu' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"ok":true}' }] }
  ] }));
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.value.tools.length, 7);
});

test('rechaza herramientas de servidor de Anthropic, nombres desconocidos y tools con otros campos', () => {
  assert.equal(sanitizeChatRequest(ok({ tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 }] })).ok, false);
  assert.equal(sanitizeChatRequest(ok({ tools: [{ name: 'otra_cosa', description: 'x', input_schema: { type: 'object' } }] })).ok, false);
  assert.equal(sanitizeChatRequest(ok({ tools: [Object.assign({}, TOOLS[0], { type: 'computer_20250124' })] })).ok, false);
  // campos extra de una herramienta válida no se reenvían
  const r = sanitizeChatRequest(ok({ tools: [Object.assign({}, TOOLS[0], { cache_control: { type: 'ephemeral' }, extra: 1 })] }));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.value.tools[0]).sort(), ['description', 'input_schema', 'name']);
});

test('rechaza imágenes, documentos, roles raros y entradas gigantes', () => {
  assert.equal(sanitizeChatRequest(ok({ messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', data: 'AAAA' } }] }] })).ok, false);
  assert.equal(sanitizeChatRequest(ok({ messages: [{ role: 'system', content: 'hola' }] })).ok, false);
  assert.equal(sanitizeChatRequest(ok({ system: 'x'.repeat(70000) })).ok, false);
  assert.equal(sanitizeChatRequest(ok({ system: { type: 'text', text: 'x' } })).ok, false);
  assert.equal(sanitizeChatRequest(ok({ messages: Array.from({ length: 80 }, () => ({ role: 'user', content: 'a' })) })).ok, false);
  assert.equal(sanitizeChatRequest(ok({ messages: [{ role: 'user', content: 'y'.repeat(25000) }] })).ok, false);
  assert.equal(sanitizeChatRequest({}).ok, false);
});

// ---- el endpoint completo ----
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ANTHROPIC_API_KEY = 'sk-test';
const handler = require('../api/chat.js');

function mkRes() { const r = { code: null, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.end = () => r; return r; }
function setup({ confirmed = true, userWithin = true, globalWithin = true }) {
  const calls = { anthropic: 0, rpc: [] };
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'a@b.com', email_confirmed_at: confirmed ? '2026-01-01' : null }) };
    if (u.includes('/rpc/increment_chat_usage')) {
      const id = JSON.parse(opts.body).p_user_id; calls.rpc.push(id);
      return { ok: true, json: async () => (id === '00000000-0000-0000-0000-000000000000' ? globalWithin : userWithin) };
    }
    if (u.includes('api.anthropic.com')) { calls.anthropic++; return { status: 200, ok: true, json: async () => ({ content: [{ type: 'text', text: 'hola' }] }) }; }
    throw new Error('url inesperada ' + u);
  };
  return calls;
}
const call = async (body) => { const res = mkRes(); await handler({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body }, res); return res; };

test('endpoint: un pedido válido llega a Anthropic; con mail sin confirmar, no', async () => {
  let c = setup({});
  let r = await call(Object.assign(ok(), { lang: 'es' }));
  assert.equal(r.code, 200); assert.equal(c.anthropic, 1);
  c = setup({ confirmed: false });
  r = await call(Object.assign(ok(), { lang: 'es' }));
  assert.equal(r.code, 403); assert.equal(c.anthropic, 0);
});

test('endpoint: el tope global diario corta antes de gastar en Anthropic', async () => {
  const c = setup({ globalWithin: false });
  const r = await call(Object.assign(ok(), { lang: 'es' }));
  assert.equal(c.anthropic, 0); assert.ok(r.body.error);
  assert.ok(c.rpc.includes('00000000-0000-0000-0000-000000000000'));
});

test('endpoint: un pedido con herramientas no permitidas se rechaza sin llamar a Anthropic, y un idioma raro no rompe la respuesta', async () => {
  const c = setup({});
  const r = await call({ system: 'x', tools: [{ type: 'web_search_20250305', name: 'web_search' }], messages: [{ role: 'user', content: 'hola' }], lang: 'constructor' });
  assert.equal(c.anthropic, 0);
  assert.equal(typeof r.body.error.message, 'string');
});
