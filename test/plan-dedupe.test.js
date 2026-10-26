const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { payloadHash, isDuplicate, remember } = require('../api/_lib/plan-dedupe');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('payloadHash: no depende del orden de las claves y cambia si cambia el contenido', () => {
  assert.equal(payloadHash({ a: 1, b: [1, 2], c: { x: 1, y: 2 } }), payloadHash({ c: { y: 2, x: 1 }, b: [1, 2], a: 1 }));
  assert.notEqual(payloadHash({ a: 1 }), payloadHash({ a: 2 }));
  assert.notEqual(payloadHash({ a: [1, 2] }), payloadHash({ a: [2, 1] }));
  assert.equal(payloadHash({ a: undefined }), payloadHash({ a: null }));
});

function withFetch(handler, fn) {
  const real = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => { calls.push({ url: String(url), method: (opts && opts.method) || 'GET' }); return handler(String(url), opts || {}); };
  return Promise.resolve(fn(calls)).finally(() => { global.fetch = real; });
}
const json = (body, ok = true) => ({ ok, json: async () => body });

test('isDuplicate: solo dentro de la ventana y con la misma huella; ante cualquier falla devuelve false', async () => {
  const fresh = new Date(Date.now() - 60 * 1000).toISOString();
  const old = new Date(Date.now() - 7 * 3600 * 1000).toISOString();
  await withFetch(() => json([{ sent_at: fresh }]), async () => assert.equal(await isDuplicate('http://x', {}, 'u1', 'wahoo_plan', 'h'), true));
  await withFetch(() => json([{ sent_at: old }]), async () => assert.equal(await isDuplicate('http://x', {}, 'u1', 'wahoo_plan', 'h'), false));
  await withFetch(() => json([]), async () => assert.equal(await isDuplicate('http://x', {}, 'u1', 'wahoo_plan', 'h'), false));
  await withFetch(() => json({ message: 'no existe la tabla' }, false), async () => assert.equal(await isDuplicate('http://x', {}, 'u1', 'wahoo_plan', 'h'), false));
  await withFetch(() => { throw new Error('red'); }, async () => assert.equal(await isDuplicate('http://x', {}, 'u1', 'wahoo_plan', 'h'), false));
});

test('isDuplicate: la consulta va filtrada por usuario, tipo y huella (nunca por la de otra persona)', async () => {
  await withFetch(() => json([]), async calls => {
    await isDuplicate('http://x', {}, 'user-1', 'suunto_plan', 'abc123');
    assert.match(calls[0].url, /user_id=eq\.user-1/);
    assert.match(calls[0].url, /kind=eq\.suunto_plan/);
    assert.match(calls[0].url, /period=eq\.abc123/);
  });
});

test('remember: borra el registro anterior del usuario y tipo y guarda el nuevo', async () => {
  await withFetch(() => json([{ user_id: 'u1' }]), async calls => {
    await remember('http://x', {}, 'u1', 'wahoo_plan', 'h2');
    assert.equal(calls[0].method, 'DELETE');
    assert.match(calls[0].url, /user_id=eq\.u1/);
    assert.match(calls[0].url, /kind=eq\.wahoo_plan/);
    assert.doesNotMatch(calls[0].url, /period=/, 'se borra el anterior sin importar su huella');
    assert.equal(calls[1].method, 'POST');
  });
});

test('wahoo-sync-plan y suunto-push-plan: el control de duplicados va ANTES del límite de frecuencia y se recuerda solo si el envío salió bien', () => {
  for (const [f, kind] of [['api/wahoo-sync-plan.js', 'wahoo_plan'], ['api/suunto-push-plan.js', 'suunto_plan']]) {
    const s = read(f);
    assert.match(s, /require\('\.\/_lib\/plan-dedupe'\)/, f);
    assert.ok(s.indexOf("isDuplicate(base, headers, userId, '" + kind + "'") > -1, f + ' consulta duplicados');
    assert.ok(s.indexOf('isDuplicate(') < s.indexOf('checkSyncCooldown('), f + ': el duplicado no debe gastar el cooldown');
    assert.ok(s.indexOf("remember(base, headers, userId, '" + kind + "'") > s.indexOf('checkSyncCooldown('), f + ' recuerda después de enviar');
    assert.match(s, /body\.force !== true/, f + ' el botón manual se salta el control');
  }
});
