// suunto-push-plan / wahoo-sync-plan / wahoo-push-workout: un usuario no puede gastar en bucle la cuota compartida de la marca.
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';

function mkRes() { const r = { code: null, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.end = () => r; return r; }

for (const [file, provider] of [['suunto-push-plan', 'suunto-plan'], ['wahoo-sync-plan', 'wahoo-plan'], ['wahoo-push-workout', 'wahoo-workout']]) {
  test(`${file}: con el límite de frecuencia superado no llega a la API de la marca ni a la base de conexiones`, async () => {
    const handler = require(`../api/${file}.js`);
    const seen = [];
    global.fetch = async (url, opts) => {
      const u = String(url); seen.push(u);
      if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01' }) };
      if (u.includes('/rpc/check_sync_cooldown')) { assert.equal(JSON.parse(opts.body).p_provider, provider); return { ok: true, json: async () => false }; }
      throw new Error('no debería haber más llamadas: ' + u);
    };
    const res = mkRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body: { days: [{ date: '2026-10-20', distKm: 8, typeKey: 'easy' }], today: '2026-10-13', name: 'Rodaje', startsISO: '2026-10-20T08:00:00Z', minutes: 40 } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.pushed, 0);
    assert.ok(seen.some(u => u.includes('check_sync_cooldown')));
  });
}
