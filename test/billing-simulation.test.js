// Simulación del cobro de punta a punta (sin red): avisos de RevenueCat -> api/revenuecat-webhook.js -> tabla entitlements (una base falsa que se comporta como PostgREST, con las operaciones
// atómicas) -> lo que ve la app (api/entitlement.js) y lo que corta el servidor (api/_lib/require-plan.js).
// Cuida lo que no se puede probar a mano: avisos desordenados, repetidos y simultáneos nunca dejan a una cuenta con un plan equivocado; el ciclo de vida completo (prueba, renovación, cancelación,
// vencimiento, reembolso, problema de cobro) da acceso exactamente cuando corresponde.
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/revenuecat-webhook');
const { entitlementFromEvent } = require('../api/_lib/revenuecat-event');
const { entitlementFromRow } = require('../api/entitlement');
const requirePlan = require('../api/_lib/require-plan');

const SECRET = 's3cret-largo-de-prueba';
const U1 = '3f0c2a52-8d6e-4f5a-9a3e-1c2d3e4f5a6b', U2 = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const DAY = 86400000;
const T0 = Date.parse('2026-12-01T12:00:00Z');

function rngFrom(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Base falsa: cada operación (PATCH condicional / INSERT ignorando duplicados / GET) es atómica, como en la base real; entre una y otra puede intercalarse cualquier otro pedido.
function makeDb(rng, opts) {
  const o = opts || {};
  const rows = new Map(); const log = [];
  const jitter = () => sleep(Math.floor(rng() * 4));
  async function fake(url, init) {
    const u = String(url); const method = (init && init.method) || 'GET';
    await jitter();
    const uid = decodeURIComponent((/user_id=eq\.([^&]+)/.exec(u) || [])[1] || '');
    let result;
    if (method === 'PATCH') {
      const m = /last_event_ms\.lte\.(\d+)/.exec(u); const cur = rows.get(uid);
      if (o.failPatch) result = { ok: false, status: 500, json: async () => ({}) };
      else if (cur && (cur.last_event_ms == null || cur.last_event_ms <= Number(m[1]))) { Object.assign(cur, JSON.parse(init.body)); result = { ok: true, status: 200, json: async () => [Object.assign({}, cur)] }; }
      else result = { ok: true, status: 200, json: async () => [] };
    } else if (method === 'POST') {
      const body = JSON.parse(init.body);
      if (!o.accounts || o.accounts.has(body.user_id)) {
        if (rows.has(body.user_id)) result = { ok: true, status: 201, json: async () => [] };
        else { rows.set(body.user_id, Object.assign({}, body)); result = { ok: true, status: 201, json: async () => [Object.assign({}, body)] }; }
      } else result = { ok: false, status: 409, json: async () => ({}) };
    } else {
      const cur = rows.get(uid);
      result = { ok: true, status: 200, json: async () => (cur ? [Object.assign({}, cur)] : []) };
    }
    log.push(method);
    await jitter();
    return result;
  }
  return { fake, rows, log };
}

function call(req) {
  return new Promise((resolve) => {
    const res = { _h: {}, setHeader(k, v) { this._h[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); }, end() { resolve({ code: this.code }); } };
    Promise.resolve(handler(req, res)).catch((e) => resolve({ code: 'throw', e }));
  });
}
const send = (event) => call({ method: 'POST', headers: { authorization: 'Bearer ' + SECRET }, body: { event } });

async function withBilling(db, fn) {
  const saved = { fetch: global.fetch }; const env = { REVENUECAT_WEBHOOK_SECRET: SECRET, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k', PAYWALL_ENFORCE: '1' };
  const old = {}; for (const k of Object.keys(env)) { old[k] = process.env[k]; process.env[k] = env[k]; }
  global.fetch = db.fake;
  try { return await fn(); } finally { global.fetch = saved.fetch; for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
}
const ev = (o) => Object.assign({ type: 'INITIAL_PURCHASE', app_user_id: U1, product_id: 'zancada_pro_monthly', store: 'PLAY_STORE', environment: 'PRODUCTION', period_type: 'NORMAL' }, o);

test('ciclo de vida completo: prueba -> renovación -> cancelar renovación -> vencimiento -> nueva compra -> reembolso -> reversión: hay acceso exactamente cuando corresponde', async () => {
  const db = makeDb(rngFrom(1));
  await withBilling(db, async () => {
    const access = (at) => entitlementFromRow(db.rows.get(U1), at).active;
    const planStatusAt = async () => requirePlan.planStatus(U1);
    // sin fila: sin plan (y el corte responde "no hay plan", no "no disponible")
    assert.equal(await planStatusAt(), 'no_plan');
    // alta con prueba de 14 días
    await send(ev({ event_timestamp_ms: T0, period_type: 'TRIAL', expiration_at_ms: T0 + 14 * DAY }));
    assert.equal(access(T0 + 1 * DAY), true, 'durante la prueba');
    assert.equal(db.rows.get(U1).status, 'active');
    // renovación al terminar la prueba (pasa a pagar un mes)
    await send(ev({ type: 'RENEWAL', event_timestamp_ms: T0 + 14 * DAY, expiration_at_ms: T0 + 44 * DAY }));
    assert.equal(access(T0 + 30 * DAY), true);
    // apaga la renovación: sigue hasta que vence lo pagado
    await send(ev({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', event_timestamp_ms: T0 + 20 * DAY, expiration_at_ms: T0 + 44 * DAY }));
    assert.equal(access(T0 + 40 * DAY), true, 'cancelar la renovación no corta lo ya pagado');
    assert.equal(access(T0 + 44 * DAY + 7 * 3600000), false, 'vencido pasado el margen');
    // vencimiento confirmado
    await send(ev({ type: 'EXPIRATION', event_timestamp_ms: T0 + 44 * DAY, expiration_at_ms: T0 + 44 * DAY }));
    assert.equal(db.rows.get(U1).status, 'expired');
    assert.equal(access(T0 + 45 * DAY), false);
    assert.equal(await planStatusAt(), 'no_plan');
    // vuelve a suscribirse
    await send(ev({ event_timestamp_ms: T0 + 60 * DAY, expiration_at_ms: T0 + 90 * DAY }));
    assert.equal(db.rows.get(U1).status, 'active');
    // reembolso: corta ya
    await send(ev({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', event_timestamp_ms: T0 + 61 * DAY, expiration_at_ms: T0 + 90 * DAY }));
    assert.equal(db.rows.get(U1).status, 'refunded');
    assert.equal(entitlementFromRow(db.rows.get(U1), T0 + 61 * DAY + 1000).active, false, 'reembolsado: sin margen');
    // reversión del reembolso
    await send(ev({ type: 'REFUND_REVERSED', event_timestamp_ms: T0 + 62 * DAY, expiration_at_ms: T0 + 90 * DAY }));
    assert.equal(access(T0 + 70 * DAY), true);
    // problema de cobro: sigue con acceso durante el período de gracia, después se corta
    await send(ev({ type: 'BILLING_ISSUE', event_timestamp_ms: T0 + 90 * DAY, expiration_at_ms: T0 + 90 * DAY, grace_period_expiration_at_ms: T0 + 93 * DAY }));
    assert.equal(db.rows.get(U1).status, 'grace');
    assert.equal(access(T0 + 92 * DAY), true, 'en gracia');
    await send(ev({ type: 'EXPIRATION', event_timestamp_ms: T0 + 93 * DAY, expiration_at_ms: T0 + 90 * DAY }));
    assert.equal(access(T0 + 94 * DAY), false);
  });
});

test('un aviso viejo que llega tarde nunca pisa a uno nuevo (vencimiento viejo después de una renovación)', async () => {
  const db = makeDb(rngFrom(2));
  await withBilling(db, async () => {
    await send(ev({ type: 'RENEWAL', event_timestamp_ms: T0 + 30 * DAY, expiration_at_ms: T0 + 60 * DAY }));
    const late = await send(ev({ type: 'EXPIRATION', event_timestamp_ms: T0 + 29 * DAY, expiration_at_ms: T0 + 29 * DAY }));
    assert.equal(late.code, 200); assert.equal(late.body.stale, true);
    assert.equal(db.rows.get(U1).status, 'active');
    assert.equal(db.rows.get(U1).expires_at, new Date(T0 + 60 * DAY).toISOString());
  });
});

test('PROPIEDAD: avisos desordenados, repetidos y simultáneos (2 cuentas a la vez, 120 corridas) siempre terminan en el estado del aviso más nuevo', async () => {
  const TYPES = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE', 'SUBSCRIPTION_EXTENDED', 'REFUND_REVERSED'];
  let compared = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const rng = rngFrom(seed * 7919);
    const db = makeDb(rng);
    await withBilling(db, async () => {
      const events = [];
      for (const uid of [U1, U2]) {
        const n = 2 + Math.floor(rng() * 5);
        for (let i = 0; i < n; i++) {
          const type = TYPES[Math.floor(rng() * TYPES.length)];
          const ts = T0 + (i + 1) * 1000 + Math.floor(rng() * 500) * 1000 * 60;   // todos distintos entre sí por cuenta
          events.push(ev({ type, app_user_id: uid, event_timestamp_ms: ts * 1 + i, expiration_at_ms: ts + Math.floor(rng() * 40) * DAY + DAY, grace_period_expiration_at_ms: ts + 3 * DAY, cancel_reason: rng() < 0.3 ? 'CUSTOMER_SUPPORT' : 'UNSUBSCRIBE' }));
        }
      }
      // repetidos (RevenueCat reintenta) y desordenados
      const all = events.concat(events.filter(() => rng() < 0.4));
      for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
      const results = await Promise.all(all.map(e => send(e)));
      for (const r of results) assert.equal(r.code, 200, 'seed ' + seed);
      for (const uid of [U1, U2]) {
        const mine = events.filter(e => e.app_user_id === uid).map(e => ({ e, d: entitlementFromEvent(e, { nowMs: T0 }) })).filter(x => x.d.action === 'upsert');
        if (!mine.length) { assert.equal(db.rows.has(uid), false, 'seed ' + seed + ': ignorados no escriben'); continue; }
        const newest = mine.reduce((a, b) => (b.d.row.last_event_ms > a.d.row.last_event_ms ? b : a));
        const got = db.rows.get(uid);
        assert.ok(got, 'seed ' + seed + ': falta la fila');
        assert.equal(got.last_event_ms, newest.d.row.last_event_ms, 'seed ' + seed + ': quedó un aviso que no es el más nuevo');
        assert.equal(got.status, newest.d.row.status, 'seed ' + seed);
        if (got.status === 'active' || got.status === 'grace') assert.equal(got.expires_at, newest.d.row.expires_at, 'seed ' + seed);   // en reembolso/vencido la fecha es "ahora" y depende del reloj
        compared++;
      }
    });
  }
  assert.ok(compared > 150, 'se compararon cuentas suficientes: ' + compared);
});

test('regalo a cuentas existentes (fila manual sin vencimiento ni último aviso): una compra real la actualiza; un aviso de otra cuenta no la toca', async () => {
  const db = makeDb(rngFrom(3));
  db.rows.set(U1, { user_id: U1, plan: 'pro', status: 'active', source: 'manual', product_id: 'regalo_cuentas_existentes', expires_at: null, last_event_ms: null });
  db.rows.set(U2, { user_id: U2, plan: 'pro', status: 'active', source: 'manual', product_id: 'regalo_cuentas_existentes', expires_at: null, last_event_ms: null });
  await withBilling(db, async () => {
    assert.equal(await requirePlan.planStatus(U1), 'ok');
    await send(ev({ event_timestamp_ms: T0, expiration_at_ms: T0 + 30 * DAY }));
    assert.equal(db.rows.get(U1).source, 'google_play');
    assert.equal(db.rows.get(U2).source, 'manual', 'la otra cuenta no se toca');
  });
});

test('cuenta borrada: el aviso no reintenta (200) y no deja filas; si la base falla, 500 para que RevenueCat reintente', async () => {
  const db = makeDb(rngFrom(4), { accounts: new Set([U1]) });
  await withBilling(db, async () => {
    const r = await send(ev({ app_user_id: U2, event_timestamp_ms: T0, expiration_at_ms: T0 + DAY }));
    assert.equal(r.code, 200); assert.equal(db.rows.has(U2), false);
  });
  const bad = makeDb(rngFrom(5), { failPatch: true });
  await withBilling(bad, async () => {
    const r = await send(ev({ event_timestamp_ms: T0, expiration_at_ms: T0 + DAY }));
    assert.equal(r.code, 500); assert.deepEqual(Object.keys(r.body), ['error']);
  });
});

test('nadie puede darse un plan: sin secreto, anónimo, sandbox sin habilitar, otra cuenta distinta y tipos que no dan acceso no escriben nada', async () => {
  const db = makeDb(rngFrom(6));
  await withBilling(db, async () => {
    assert.equal((await call({ method: 'POST', headers: { authorization: 'Bearer otro' }, body: { event: ev({ event_timestamp_ms: T0, expiration_at_ms: T0 + DAY }) } })).code, 401);
    assert.equal((await call({ method: 'POST', headers: {}, body: { event: ev({ event_timestamp_ms: T0, expiration_at_ms: T0 + DAY }) } })).code, 401);
    for (const e of [
      ev({ app_user_id: '$RCAnonymousID:abc123', event_timestamp_ms: T0, expiration_at_ms: T0 + DAY }),
      ev({ environment: 'SANDBOX', event_timestamp_ms: T0, expiration_at_ms: T0 + DAY }),
      ev({ type: 'TRANSFER', event_timestamp_ms: T0, expiration_at_ms: T0 + DAY }),
      ev({ type: 'INVOICE_ISSUANCE', event_timestamp_ms: T0, expiration_at_ms: T0 + DAY }),
      ev({ event_timestamp_ms: T0 })   // alta sin fecha de vencimiento: no se regala
    ]) assert.equal((await send(e)).code, 200);
    assert.equal(db.rows.size, 0, 'ninguno escribió');
    assert.equal(await requirePlan.planStatus(U1), 'no_plan');
  });
});

test('el corte por falta de plan usa la misma tabla: con plan pasa, sin plan 402, base caída 503 (no se manda a pagar a quien ya pagó)', async () => {
  const db = makeDb(rngFrom(7));
  await withBilling(db, async () => {
    await send(ev({ event_timestamp_ms: Date.now(), expiration_at_ms: Date.now() + 30 * DAY }));
    assert.equal(await requirePlan.planStatus(U1), 'ok');
    assert.equal(await requirePlan.planStatus(U2), 'no_plan');
    const real = global.fetch; global.fetch = async () => { throw new Error('caída'); };
    assert.equal(await requirePlan.planStatus(U1), 'unavailable');
    global.fetch = real;
  });
});
