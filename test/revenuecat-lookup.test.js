// Respaldo del aviso de la tienda: si el webhook se pierde, RevenueCat (fuente de verdad) confirma que la persona pagó. Sin clave secreta no hace nada; cualquier error cae a "sin plan".
const test = require('node:test');
const assert = require('node:assert/strict');
const { activeFromSubscriber, lookupActivePlan, _clearCache } = require('../api/_lib/revenuecat-lookup');
const requirePlan = require('../api/_lib/require-plan');
const entitlementHandler = require('../api/entitlement');

const NOW = Date.parse('2026-12-10T12:00:00Z');
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const U = '3f0c2a52-8d6e-4f5a-9a3e-1c2d3e4f5a6b';
const snap = (ent, sub) => ({ subscriber: { entitlements: { pro: Object.assign({ product_identifier: 'zancada_pro', purchase_date: iso(NOW - DAY) }, ent) }, subscriptions: { zancada_pro: Object.assign({ store: 'play_store', is_sandbox: false }, sub) } } });

test('respuesta de RevenueCat -> hay plan vigente o no (vencido, gracia, reembolso, sandbox, lifetime, basura)', () => {
  assert.deepEqual(activeFromSubscriber(snap({ expires_date: iso(NOW + 10 * DAY) }), { nowMs: NOW }), { active: true, expiresAt: iso(NOW + 10 * DAY), productId: 'zancada_pro' });
  assert.equal(activeFromSubscriber(snap({ expires_date: iso(NOW - DAY) }), { nowMs: NOW }).active, false, 'vencido');
  const grace = activeFromSubscriber(snap({ expires_date: iso(NOW - DAY), grace_period_expires_date: iso(NOW + 2 * DAY) }), { nowMs: NOW });
  assert.equal(grace.active, true, 'en gracia'); assert.equal(grace.expiresAt, iso(NOW + 2 * DAY));
  assert.equal(activeFromSubscriber(snap({ expires_date: iso(NOW + 10 * DAY) }, { refunded_at: iso(NOW - 1000) }), { nowMs: NOW }).active, false, 'reembolsada');
  assert.equal(activeFromSubscriber(snap({ expires_date: iso(NOW + 10 * DAY) }, { is_sandbox: true }), { nowMs: NOW }).active, false, 'sandbox sin habilitar');
  assert.equal(activeFromSubscriber(snap({ expires_date: iso(NOW + 10 * DAY) }, { is_sandbox: true }), { nowMs: NOW, allowSandbox: true }).active, true, 'sandbox habilitado');
  const life = activeFromSubscriber(snap({ expires_date: null }), { nowMs: NOW }); assert.equal(life.active, true); assert.equal(life.expiresAt, null);
  for (const bad of [null, undefined, 'x', 5, {}, { subscriber: null }, { subscriber: { entitlements: 'x' } }, { subscriber: { entitlements: { pro: null } } }, { subscriber: { entitlements: { pro: { expires_date: 'no-es-fecha' } } } }])
    assert.equal(activeFromSubscriber(bad, { nowMs: NOW }).active, false, 'basura: ' + JSON.stringify(bad));
  // varias: gana la que vence más tarde
  const two = { subscriber: { entitlements: { a: { product_identifier: 'p1', expires_date: iso(NOW + DAY) }, b: { product_identifier: 'p2', expires_date: iso(NOW + 5 * DAY) } }, subscriptions: {} } };
  assert.equal(activeFromSubscriber(two, { nowMs: NOW }).expiresAt, iso(NOW + 5 * DAY));
});

test('sin REVENUECAT_SECRET_KEY no consulta nada; con la clave pregunta con el id de la cuenta; errores caen a null; cache de 30 s', async () => {
  _clearCache();
  const real = global.fetch; let calls = []; let mode = 'ok';
  global.fetch = async (url, init) => { calls.push({ url: String(url), auth: init && init.headers && init.headers.Authorization }); if (mode === 'throw') throw new Error('red'); if (mode === '500') return { ok: false, status: 500, json: async () => ({}) }; return { ok: true, status: 200, json: async () => snap({ expires_date: iso(NOW + 10 * DAY) }) }; };
  try {
    assert.equal(await lookupActivePlan(U, {}, NOW), null); assert.equal(calls.length, 0, 'sin clave: ni consulta');
    const env = { REVENUECAT_SECRET_KEY: 'sk_test_clave' };
    const r = await lookupActivePlan(U, env, NOW);
    assert.equal(r.active, true); assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.revenuecat.com/v1/subscribers/' + U); assert.equal(calls[0].auth, 'Bearer sk_test_clave');
    await lookupActivePlan(U, env, NOW + 10000); assert.equal(calls.length, 1, 'cache');
    await lookupActivePlan(U, env, NOW + 31000); assert.equal(calls.length, 2, 'vence el cache');
    _clearCache(); mode = 'throw'; assert.equal(await lookupActivePlan(U, env, NOW), null, 'red caída');
    _clearCache(); mode = '500'; const r500 = await lookupActivePlan(U, env, NOW); assert.equal(r500, null, 'error HTTP');
  } finally { global.fetch = real; }
});

function call(handler, req) {
  return new Promise((resolve) => {
    const res = { _h: {}, setHeader(k, v) { this._h[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); }, end() { resolve({ code: this.code }); } };
    Promise.resolve(handler(req, res)).catch((e) => resolve({ code: 'throw', e }));
  });
}

test('el servidor confirma con RevenueCat cuando la tabla no tiene el plan (aviso perdido): el corte y la consulta de la app dejan pasar a quien pagó, y solo a quien pagó', async () => {
  _clearCache();
  const real = global.fetch; const saved = {}; const env = { PAYWALL_ENFORCE: '1', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k', REVENUECAT_SECRET_KEY: 'sk_test_clave' };
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  let rcActive = true;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('api.revenuecat.com')) return { ok: true, status: 200, json: async () => (rcActive ? snap({ expires_date: iso(Date.now() + 5 * DAY) }) : { subscriber: { entitlements: {}, subscriptions: {} } }) };
    return { ok: true, status: 200, json: async () => [] };   // la tabla entitlements no tiene fila
  };
  try {
    assert.equal(await requirePlan.planStatus(U), 'ok', 'pagó y el aviso no llegó: pasa');
    _clearCache(); rcActive = false;
    assert.equal(await requirePlan.planStatus(U), 'no_plan', 'no pagó: se corta');
    // si RevenueCat falla, no se regala nada
    _clearCache(); global.fetch = async (url) => { if (String(url).includes('api.revenuecat.com')) throw new Error('caída'); return { ok: true, status: 200, json: async () => [] }; };
    assert.equal(await requirePlan.planStatus(U), 'no_plan');
  } finally { global.fetch = real; for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
});

test('api/entitlement.js: la tabla manda; si no hay plan en la tabla, RevenueCat puede confirmarlo; sin clave se comporta como antes', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'api', 'entitlement.js'), 'utf8');
  assert.match(src, /lookupActivePlan\(auth\.userId\)/);
  assert.ok(src.indexOf('if (fromTable.active)') < src.indexOf('lookupActivePlan('), 'primero la tabla, después RevenueCat');
  assert.equal(typeof entitlementHandler, 'function');
});
