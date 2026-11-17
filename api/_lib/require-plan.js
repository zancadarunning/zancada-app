// api/_lib/require-plan.js
//
// Exige un plan de pago vigente en los endpoints que cuestan plata (el chat de IA y el procesamiento de video). Está APAGADO hasta el lanzamiento: solo se activa con
// PAYWALL_ENFORCE=1 en Vercel (junto con PAYWALL_ENABLED en app.js y el regalo a las cuentas existentes, ver sql/entitlements_gift_existing.sql).
//
// Falla hacia "sin plan": si la base no responde NO se regala el servicio... pero tampoco se rompe lo que ya funcionaba antes de prender el cobro (apagado = pasa todo).
// Devuelve true si puede seguir, o false (y ya respondió 402) si hay que cortar.
const { entitlementFromRow } = require('../entitlement');
const { fetchWithTimeout } = require('./fetch-with-timeout');

async function planAllows(userId) {
  if (process.env.PAYWALL_ENFORCE !== '1') return true;
  try {
    const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    const r = await fetchWithTimeout(`${base}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(userId)}&select=plan,status,expires_at&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }, 6000);
    if (!r.ok) return false;
    const rows = await r.json();
    return entitlementFromRow(Array.isArray(rows) ? rows[0] : null, Date.now()).active;
  } catch (e) {
    return false;
  }
}

module.exports = async function requirePlan(userId, res, body) {
  if (await planAllows(userId)) return true;
  res.status(402).json(body || { error: 'subscription_required' });
  return false;
};
module.exports.planAllows = planAllows;
