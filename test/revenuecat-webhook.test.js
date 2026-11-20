// Cobro por suscripción: el aviso de RevenueCat es lo único que escribe el plan de una cuenta. Estas pruebas cuidan: quién puede llamar, qué avisos dan acceso, qué avisos lo quitan y que un aviso viejo no pise a uno nuevo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { entitlementFromEvent } = require('../api/_lib/revenuecat-event');
const { entitlementFromRow } = require('../api/entitlement');

const U = '3f0c2a52-8d6e-4f5a-9a3e-1c2d3e4f5a6b';
const NOW = Date.parse('2026-12-01T12:00:00Z');
const DAY = 86400000;
const ev = (o) => Object.assign({ type: 'INITIAL_PURCHASE', app_user_id: U, product_id: 'zancada_pro_monthly', store: 'PLAY_STORE', environment: 'PRODUCTION', event_timestamp_ms: NOW, expiration_at_ms: NOW + 14 * DAY, period_type: 'TRIAL' }, o || {});
const decide = (e, o) => entitlementFromEvent(e, Object.assign({ nowMs: NOW }, o || {}));

test('alta con prueba gratis, renovación y cambio de plan: activo hasta la fecha que informa la tienda', () => {
  for (const type of ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'SUBSCRIPTION_EXTENDED', 'REFUND_REVERSED']) {
    const d = decide(ev({ type }));
    assert.equal(d.action, 'upsert', type);
    assert.equal(d.row.plan, 'pro'); assert.equal(d.row.status, 'active'); assert.equal(d.row.user_id, U);
    assert.equal(d.row.expires_at, new Date(NOW + 14 * DAY).toISOString());
    assert.equal(d.row.source, 'google_play'); assert.equal(d.row.product_id, 'zancada_pro_monthly');
    assert.equal(d.row.last_event_ms, NOW);
  }
});

test('la fila que sale del aviso se lee bien en api/entitlement.js: activa mientras no vence, y libre cuando vence', () => {
  const row = decide(ev()).row;
  assert.equal(entitlementFromRow(row, NOW + DAY).active, true);
  assert.equal(entitlementFromRow(row, NOW + 15 * DAY).active, false);
});

test('apagar la renovación NO corta el acceso (sigue hasta que vence); un reembolso sí lo corta ya', () => {
  const baja = decide(ev({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' }));
  assert.equal(baja.row.status, 'active'); assert.equal(baja.row.expires_at, new Date(NOW + 14 * DAY).toISOString());
  const reembolso = decide(ev({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' }));
  assert.equal(reembolso.row.status, 'refunded');
  assert.equal(entitlementFromRow(reembolso.row, NOW + 1000).active, false);
});

test('problema de cobro: período de gracia con acceso; vencido y pausado: sin acceso', () => {
  const grace = decide(ev({ type: 'BILLING_ISSUE', grace_period_expiration_at_ms: NOW + 3 * DAY }));
  assert.equal(grace.row.status, 'grace');
  assert.equal(entitlementFromRow(grace.row, NOW + DAY).active, true, 'en gracia conserva el acceso');
  assert.equal(entitlementFromRow(grace.row, NOW + 4 * DAY).active, false, 'terminada la gracia, no');
  for (const type of ['EXPIRATION', 'SUBSCRIPTION_PAUSED']) {
    const d = decide(ev({ type, expiration_at_ms: NOW - DAY }));
    assert.equal(d.row.status, 'expired', type);
    assert.equal(entitlementFromRow(d.row, NOW).active, false, type);
  }
});

test('se ignoran: avisos de prueba, usuarios anónimos o con id raro, tipos que no usamos, altas sin fecha y el sandbox si no se habilita', () => {
  assert.equal(decide(ev({ type: 'TEST' })).action, 'ignore');
  assert.equal(decide(ev({ app_user_id: '$RCAnonymousID:abc123' })).action, 'ignore');
  assert.equal(decide(ev({ app_user_id: "x'; drop table entitlements;--" })).action, 'ignore');
  assert.equal(decide(ev({ type: 'INVOICE_ISSUANCE' })).action, 'ignore');
  assert.equal(decide(ev({ expiration_at_ms: null })).action, 'ignore', 'una alta sin vencimiento no regala acceso sin fin');
  assert.equal(decide(ev({ environment: 'SANDBOX' })).action, 'ignore');
  assert.equal(decide(ev({ environment: 'SANDBOX' }), { allowSandbox: true }).action, 'upsert');
  assert.equal(decide(null).action, 'ignore');
  assert.equal(decide('basura').action, 'ignore');
});

test('el id de cuenta que llega se normaliza a minúsculas y la tienda se traduce', () => {
  const d = decide(ev({ app_user_id: U.toUpperCase(), store: 'APP_STORE' }));
  assert.equal(d.row.user_id, U); assert.equal(d.row.source, 'app_store');
  assert.equal(decide(ev({ store: 'ALGO_NUEVO' })).row.source, 'other');
});

// ---- el endpoint ----
function call(handler, req) {
  return new Promise((resolve) => {
    const res = { _h: {}, setHeader(k, v) { this._h[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); }, end() { resolve({ code: this.code }); } };
    Promise.resolve(handler(req, res)).catch(() => resolve({ code: 'throw' }));
  });
}
function withEnv(env, fn) {
  const old = {}; for (const k of Object.keys(env)) { old[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  return Promise.resolve(fn()).finally(() => { for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } });
}

test('endpoint: sin secreto configurado, con secreto incorrecto o con otro método, se rechaza; nada llega a la base', async () => {
  const handler = require('../api/revenuecat-webhook');
  const realFetch = global.fetch; let calls = 0; global.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => [] }; };
  try {
    await withEnv({ REVENUECAT_WEBHOOK_SECRET: undefined }, async () => {
      assert.equal((await call(handler, { method: 'POST', headers: { authorization: 'Bearer x' }, body: { event: ev() } })).code, 401, 'sin secreto configurado');
    });
    await withEnv({ REVENUECAT_WEBHOOK_SECRET: 's3cret-largo-de-prueba' }, async () => {
      assert.equal((await call(handler, { method: 'POST', headers: { authorization: 'Bearer otro' }, body: { event: ev() } })).code, 401);
      assert.equal((await call(handler, { method: 'POST', headers: {}, body: { event: ev() } })).code, 401);
      assert.equal((await call(handler, { method: 'GET', headers: { authorization: 'Bearer s3cret-largo-de-prueba' } })).code, 405);
    });
    assert.equal(calls, 0);
  } finally { global.fetch = realFetch; }
});

test('endpoint: guarda el plan de forma atómica (PATCH condicional, si no hay fila INSERT); un aviso viejo no pisa a uno nuevo; si la cuenta ya no existe no reintenta; si la base falla, 500', async () => {
  const handler = require('../api/revenuecat-webhook');
  const realFetch = global.fetch; const seen = [];
  let stored = null, patchStatus = 200, postStatus = 201, postInserts = true;
  global.fetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    seen.push({ url: String(url), method, body: opts && opts.body, prefer: opts && opts.headers && opts.headers.Prefer });
    if (method === 'PATCH') {
      // la base aplica la condición del filtro: solo actualiza si no hay aviso guardado o el guardado no es más nuevo
      const m = /last_event_ms\.lte\.(\d+)/.exec(String(url));
      const hit = stored !== null && Number(m[1]) >= stored;
      return { ok: patchStatus < 300, status: patchStatus, json: async () => (hit ? [{ user_id: U }] : []) };
    }
    return { ok: postStatus < 300, status: postStatus, json: async () => (postInserts ? [{ user_id: U }] : []) };
  };
  const req = (e) => ({ method: 'POST', headers: { authorization: 'Bearer s3cret-largo-de-prueba' }, body: { event: e } });
  try {
    await withEnv({ REVENUECAT_WEBHOOK_SECRET: 's3cret-largo-de-prueba', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k' }, async () => {
      // cuenta sin fila todavía: el PATCH no toca nada y se inserta
      let r = await call(handler, req(ev()));
      assert.equal(r.code, 200); assert.equal(r.body.stale, undefined);
      const patch = seen.find(x => x.method === 'PATCH'), post = seen.find(x => x.method === 'POST');
      assert.ok(patch && /or=\(last_event_ms\.is\.null,last_event_ms\.lte\.\d+\)/.test(patch.url), 'la condición de orden la evalúa la base');
      assert.ok(post && /on_conflict=user_id/.test(post.url) && /ignore-duplicates/.test(post.prefer), 'insert que nunca pisa una fila que apareció en el medio');
      const row = JSON.parse(post.body);
      assert.equal(row.user_id, U); assert.equal(row.plan, 'pro'); assert.equal(row.status, 'active');
      // ya hay fila y el aviso es más nuevo o igual: el PATCH la actualiza y no inserta
      seen.length = 0; stored = NOW - 1000;
      r = await call(handler, req(ev()));
      assert.equal(r.code, 200); assert.ok(!seen.some(x => x.method === 'POST'));
      // aviso viejo: ya hay uno más nuevo guardado -> el PATCH no actualiza, el insert no inserta -> se descarta
      seen.length = 0; stored = NOW + 1000; postInserts = false;
      const old = await call(handler, req(ev({ event_timestamp_ms: NOW })));
      assert.equal(old.code, 200); assert.equal(old.body.stale, true);
      // cuenta borrada (409 al insertar)
      stored = null; postStatus = 409; postInserts = true;
      assert.equal((await call(handler, req(ev()))).code, 200);
      // falla de la base: 500 para que RevenueCat reintente, sin detalle
      postStatus = 500;
      const fail = await call(handler, req(ev()));
      assert.equal(fail.code, 500); assert.deepEqual(Object.keys(fail.body), ['error']);
      postStatus = 201; patchStatus = 500;
      assert.equal((await call(handler, req(ev()))).code, 500);
      // avisos ignorados no tocan la base
      seen.length = 0;
      assert.equal((await call(handler, req(ev({ type: 'TEST' })))).code, 200);
      assert.equal(seen.length, 0);
    });
  } finally { global.fetch = realFetch; }
});

test('el endpoint compara el secreto en tiempo constante y no loguea ids de cuenta ni correos', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'api', 'revenuecat-webhook.js'), 'utf8');
  assert.match(s, /timingSafeEqual/);
  assert.doesNotMatch(s, /console\.(log|error)\([^)]*(app_user_id|user_id|email|row)/, 'sin datos personales en los logs');
});

test('la tabla de planes tiene la columna del último aviso aplicado (migración idempotente)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'entitlements_billing.sql'), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS last_event_ms bigint/i);
});

// ---- el corte por falta de plan (api/_lib/require-plan.js): apagado hasta el lanzamiento ----
test('require-plan: apagado (sin PAYWALL_ENFORCE) deja pasar a todos sin consultar la base; prendido corta sin plan vigente con 402 y deja pasar con plan', async () => {
  const requirePlan = require('../api/_lib/require-plan');
  const realFetch = global.fetch; let calls = 0, rows = [];
  global.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => rows }; };
  const run = async () => { let out = null; const res = { status(c) { this.code = c; return this; }, json(b) { out = { code: this.code, body: b }; } }; const ok = await requirePlan(U, res); return { ok, out }; };
  try {
    await withEnv({ PAYWALL_ENFORCE: undefined, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k' }, async () => {
      const r = await run(); assert.equal(r.ok, true); assert.equal(calls, 0, 'apagado: ni consulta');
    });
    await withEnv({ PAYWALL_ENFORCE: '1', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k' }, async () => {
      rows = [];
      let r = await run(); assert.equal(r.ok, false); assert.equal(r.out.code, 402); assert.equal(r.out.body.error, 'subscription_required');
      rows = [{ plan: 'pro', status: 'active', expires_at: new Date(Date.now() + DAY).toISOString() }];
      r = await run(); assert.equal(r.ok, true);
      rows = [{ plan: 'pro', status: 'active', expires_at: new Date(Date.now() - DAY).toISOString() }];
      r = await run(); assert.equal(r.ok, false, 'vencido');
      rows = [{ plan: 'pro', status: 'active', expires_at: null }];
      r = await run(); assert.equal(r.ok, true, 'regalo sin vencimiento');
      global.fetch = async () => { throw new Error('red'); };
      r = await run(); assert.equal(r.ok, false, 'si la base no responde, no se regala');
      assert.equal(r.out.code, 503, 'pero no se manda a pagar a quien ya pagó: es un 503, no un 402');
      global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
      r = await run(); assert.equal(r.ok, false); assert.equal(r.out.code, 503);
      // margen de unas horas después del vencimiento (la renovación llega con retraso), pero no más
      global.fetch = async () => ({ ok: true, status: 200, json: async () => [{ plan: 'pro', status: 'active', expires_at: new Date(Date.now() - 3600000).toISOString() }] });
      r = await run(); assert.equal(r.ok, true, 'vencido hace 1 hora: todavía pasa');
      global.fetch = async () => ({ ok: true, status: 200, json: async () => [{ plan: 'pro', status: 'refunded', expires_at: new Date(Date.now() - 1000).toISOString() }] });
      r = await run(); assert.equal(r.ok, false, 'reembolsado: corta en el acto');
      global.fetch = async () => ({ ok: true, status: 200, json: async () => [{ plan: 'pro', status: 'expired', expires_at: new Date(Date.now() - 1000).toISOString() }] });
      r = await run(); assert.equal(r.ok, false, 'vencimiento confirmado: corta');
    });
  } finally { global.fetch = realFetch; }
});

test('el chat de IA y el procesamiento de video piden plan (apagado por defecto), después de autenticar', () => {
  for (const f of ['chat.js', 'remux-video.js']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'api', f), 'utf8');
    assert.match(s, /requirePlan\(/, f);
    assert.ok(s.indexOf('verifyUser(req)') < s.indexOf('requirePlan('), f + ': primero la sesión, después el plan');
  }
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'api', 'chat.js'), 'utf8'), /subscription_required/);
});
