// COROS: el code_verifier de PKCE viaja CIFRADO dentro del state (que va en la URL de autorización): si fuera legible, PKCE no protegería nada.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
process.env.COROS_STATE_SECRET = 'secreto-de-prueba-del-state';
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
const handler = require('../api/coros-init.js');
const { decToken } = require('../api/_lib/token-crypto.js');

function mkRes() { const r = { code: null, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.end = () => r; return r; }

test('coros-init: el verifier no aparece en claro en el state y se puede recuperar descifrándolo', async () => {
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01' }), text: async () => '' });
  const res = mkRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body: {} }, res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  const { state, codeChallenge } = res.body;
  const parts = state.split('.');
  assert.equal(parts.length, 4);
  const verifier = decToken(Buffer.from(parts[2], 'base64url').toString());
  assert.equal(crypto.createHash('sha256').update(verifier).digest('base64url'), codeChallenge, 'el verifier descifrado corresponde al challenge');
  assert.ok(!state.includes(verifier), 'el verifier NO está en claro en el state');
});
