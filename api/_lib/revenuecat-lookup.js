// api/_lib/revenuecat-lookup.js
//
// Respaldo del aviso (webhook): si la tabla `entitlements` dice que una cuenta NO tiene plan, se le pregunta directamente a RevenueCat (su API de servidor, con la clave secreta
// REVENUECAT_SECRET_KEY) si esa cuenta tiene una suscripción vigente. Sirve para el peor caso del cobro: la persona pagó pero el aviso no llegó (caída de Vercel, aviso perdido, demora).
// Sin la variable de entorno no hace nada (se comporta como antes). RevenueCat es la fuente de verdad (la consulta va con el id de la cuenta ya autenticada); la app nunca decide.
//
// Falla hacia "sin plan": cualquier error (red, clave mala, respuesta rara) devuelve null y el resto del código sigue con lo que diga la tabla. No escribe nada en la base.
// Cache de 30 s por cuenta (y por instancia) para no golpear la API cuando alguien consulta seguido.
const { fetchWithTimeout } = require('./fetch-with-timeout');

const cache = new Map();   // userId -> { at, value }
const TTL_MS = 30 * 1000;

function ms(v) { const n = v ? Date.parse(v) : NaN; return Number.isFinite(n) ? n : null; }

// Pura. json = respuesta de GET /v1/subscribers/{id}. Devuelve { active, expiresAt, productId } (active:false si no hay nada vigente).
function activeFromSubscriber(json, opts) {
  const o = opts || {}; const nowMs = o.nowMs == null ? Date.now() : o.nowMs;
  const sub = json && typeof json === 'object' ? json.subscriber : null;
  const none = { active: false, expiresAt: null, productId: null };
  if (!sub || typeof sub !== 'object') return none;
  const ents = sub.entitlements && typeof sub.entitlements === 'object' ? Object.values(sub.entitlements) : [];
  const subs = sub.subscriptions && typeof sub.subscriptions === 'object' ? sub.subscriptions : {};
  let best = null;
  for (const e of ents) {
    if (!e || typeof e !== 'object') continue;
    const pid = typeof e.product_identifier === 'string' ? e.product_identifier : null;
    const s = pid && subs[pid] && typeof subs[pid] === 'object' ? subs[pid] : null;
    if (s && s.is_sandbox === true && !o.allowSandbox) continue;   // compras de prueba solo si se habilitan a propósito
    if (s && ms(s.refunded_at)) continue;                          // reembolsada
    const exp = ms(e.expires_date), grace = ms(e.grace_period_expires_date);
    const until = exp === null && e.expires_date == null ? Infinity : Math.max(exp || 0, grace || 0);
    if (until > nowMs && (!best || until > best.until)) best = { until, pid };
  }
  if (!best) return none;
  return { active: true, expiresAt: Number.isFinite(best.until) ? new Date(best.until).toISOString() : null, productId: best.pid };
}

async function lookupActivePlan(userId, env, nowMs) {
  const e = env || process.env;
  const key = e.REVENUECAT_SECRET_KEY;
  if (!key || !userId) return null;
  const now = nowMs == null ? Date.now() : nowMs;
  const hit = cache.get(userId);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  let value = null;
  try {
    const r = await fetchWithTimeout('https://api.revenuecat.com/v1/subscribers/' + encodeURIComponent(userId), { headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' } }, 6000);
    if (r.ok) value = activeFromSubscriber(await r.json(), { nowMs: now, allowSandbox: e.REVENUECAT_ALLOW_SANDBOX === '1' });
  } catch (err) { value = null; }
  cache.set(userId, { at: now, value });
  if (cache.size > 500) { const first = cache.keys().next().value; cache.delete(first); }
  return value;
}
function _clearCache() { cache.clear(); }

module.exports = { activeFromSubscriber, lookupActivePlan, _clearCache };
