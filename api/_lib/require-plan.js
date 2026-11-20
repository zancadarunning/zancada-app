// api/_lib/require-plan.js
//
// Exige un plan de pago vigente en los endpoints que cuestan plata (el chat de IA y el procesamiento de video). Está APAGADO hasta el lanzamiento: solo se activa con
// PAYWALL_ENFORCE=1 en Vercel (junto con PAYWALL_ENABLED en app.js y el regalo a las cuentas existentes, ver sql/entitlements_gift_existing.sql).
//
// Tres resultados: 'ok' (pasa), 'no_plan' (402: la app muestra la pantalla de suscripción) y 'unavailable' (503: no se pudo consultar la base).
// Si la base no responde NO se regala el servicio (no pasa), pero tampoco se manda a pagar a alguien que ya pagó: por eso es un 503 y no un 402.
// Devuelve true si puede seguir, o false (y ya respondió) si hay que cortar.
const { entitlementFromRow } = require('../entitlement');
const { fetchWithTimeout } = require('./fetch-with-timeout');

async function planStatus(userId) {
  if (process.env.PAYWALL_ENFORCE !== '1') return 'ok';
  try {
    const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    const r = await fetchWithTimeout(`${base}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(userId)}&select=plan,status,expires_at&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }, 6000);
    if (!r.ok) return 'unavailable';
    const rows = await r.json();
    return entitlementFromRow(Array.isArray(rows) ? rows[0] : null, Date.now()).active ? 'ok' : 'no_plan';
  } catch (e) {
    return 'unavailable';
  }
}
async function planAllows(userId) { return (await planStatus(userId)) === 'ok'; }

// body: respuesta del 402 (la del chat lleva mensaje traducido); unavailableBody: la del 503 (mismo formato que body)
module.exports = async function requirePlan(userId, res, body, unavailableBody) {
  const s = await planStatus(userId);
  if (s === 'ok') return true;
  if (s === 'unavailable') res.status(503).json(unavailableBody || { error: 'plan_check_unavailable' });
  else res.status(402).json(body || { error: 'subscription_required' });
  return false;
};
module.exports.planAllows = planAllows;
module.exports.planStatus = planStatus;
