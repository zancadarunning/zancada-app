// api/_lib/revenuecat-event.js
//
// Traduce un aviso (webhook) de RevenueCat al plan de una cuenta (tabla `entitlements`, ver sql/entitlements.sql). Funciones PURAS, sin red: para poder probarlas todas.
//
// Formato de RevenueCat (event.*): type, id, event_timestamp_ms, app_user_id, product_id, period_type (TRIAL | INTRO | NORMAL), expiration_at_ms, grace_period_expiration_at_ms,
// environment (PRODUCTION | SANDBOX), store (PLAY_STORE | APP_STORE | ...), cancel_reason (UNSUBSCRIBE | BILLING_ERROR | CUSTOMER_SUPPORT | ...).
// En la app, el app_user_id de RevenueCat es el id de la cuenta de Supabase (ver app.js: Purchases.logIn): así el aviso se asocia a la cuenta sin guardar nada más.
//
// Reglas (la app NUNCA decide sola si alguien pagó; solo estos avisos, firmados con nuestro secreto, escriben el plan):
//   - Alta, renovación, cambio de plan, reactivación, extensión, reversión de reembolso -> activo hasta expiration_at_ms.
//   - CANCELLATION: salvo reembolso (CUSTOMER_SUPPORT), apagar la renovación NO corta el acceso: sigue hasta que vence lo ya pagado.
//   - BILLING_ISSUE -> "grace": sigue con acceso hasta el fin del período de gracia.
//   - EXPIRATION y pausa -> vencido.
//   - Sandbox (pruebas de Google Play) solo cuenta si se habilita a propósito.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GRANT = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'REFUND_REVERSED', 'TEMPORARY_ENTITLEMENT_GRANT']);
const SOURCES = { PLAY_STORE: 'google_play', APP_STORE: 'app_store', AMAZON: 'amazon', STRIPE: 'stripe', MAC_APP_STORE: 'app_store' };

function isoOrNull(ms) {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
}

// Devuelve { action: 'ignore', reason } o { action: 'upsert', row } (row = columnas de `entitlements`; last_event_ms para no pisar un aviso nuevo con uno viejo).
function entitlementFromEvent(event, opts) {
  const o = opts || {};
  const nowMs = o.nowMs == null ? Date.now() : o.nowMs;
  if (!event || typeof event !== 'object') return { action: 'ignore', reason: 'sin evento' };
  const type = String(event.type || '');
  if (type === 'TEST') return { action: 'ignore', reason: 'prueba de RevenueCat' };
  if (String(event.environment || 'PRODUCTION').toUpperCase() === 'SANDBOX' && !o.allowSandbox) return { action: 'ignore', reason: 'sandbox deshabilitado' };
  const userId = String(event.app_user_id || '');
  if (!UUID.test(userId)) return { action: 'ignore', reason: 'usuario anonimo o con id inesperado' };

  const base = {
    user_id: userId.toLowerCase(),
    plan: 'pro',
    source: SOURCES[String(event.store || '').toUpperCase()] || 'other',
    product_id: typeof event.product_id === 'string' ? event.product_id.slice(0, 120) : null,
    last_event_ms: Number.isFinite(Number(event.event_timestamp_ms)) ? Number(event.event_timestamp_ms) : nowMs,
    updated_at: new Date(nowMs).toISOString()
  };
  const exp = isoOrNull(event.expiration_at_ms);

  if (GRANT.has(type)) {
    if (!exp) return { action: 'ignore', reason: 'alta sin fecha de vencimiento' };
    return { action: 'upsert', row: Object.assign(base, { status: 'active', expires_at: exp }) };
  }
  if (type === 'CANCELLATION') {
    // reembolso: se corta ya. Cualquier otra causa (el usuario apagó la renovación, falló el cobro): conserva lo ya pagado hasta que venza.
    if (String(event.cancel_reason || '').toUpperCase() === 'CUSTOMER_SUPPORT') return { action: 'upsert', row: Object.assign(base, { status: 'refunded', expires_at: new Date(nowMs).toISOString() }) };
    if (!exp) return { action: 'ignore', reason: 'cancelacion sin fecha de vencimiento' };
    return { action: 'upsert', row: Object.assign(base, { status: 'active', expires_at: exp }) };
  }
  if (type === 'BILLING_ISSUE') {
    const until = isoOrNull(event.grace_period_expiration_at_ms) || exp;
    if (!until) return { action: 'ignore', reason: 'problema de cobro sin fecha' };
    return { action: 'upsert', row: Object.assign(base, { status: 'grace', expires_at: until }) };
  }
  if (type === 'EXPIRATION' || type === 'SUBSCRIPTION_PAUSED') {
    return { action: 'upsert', row: Object.assign(base, { status: 'expired', expires_at: exp || new Date(nowMs).toISOString() }) };
  }
  return { action: 'ignore', reason: 'tipo no usado: ' + type.slice(0, 40) };
}

module.exports = { entitlementFromEvent, UUID };
