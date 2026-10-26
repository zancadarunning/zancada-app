// api/entitlement.js
//
// Devuelve el plan de la cuenta que hace el pedido ({ plan, active, expiresAt }). El plan vive en la tabla `entitlements` (sql/entitlements.sql), que solo escribe el
// servidor: NUNCA en app_state, que la persona puede editar desde su sesión. Mientras no haya cobro, la tabla está vacía y todas las cuentas son "free".
//
// Falla hacia "free": si la base no responde o la tabla todavía no existe, se responde free (nunca se regala un plan de pago por un error).

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { withSentry } = require('./_lib/sentry');

const FREE = { plan: 'free', active: false, expiresAt: null };

// ¿La fila cuenta como plan vigente ahora? Pura, para poder probarla.
function entitlementFromRow(row, nowMs) {
  if (!row || typeof row !== 'object') return FREE;
  const plan = String(row.plan || 'free');
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : null;
  const notExpired = expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > nowMs);
  const statusOk = row.status === 'active' || row.status === 'grace';
  const active = plan !== 'free' && statusOk && notExpired;
  return { plan: active ? plan : 'free', active, expiresAt: active && expiresAt ? new Date(expiresAt).toISOString() : null };
}

const handler = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const r = await fetch(`${base}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(auth.userId)}&select=plan,status,expires_at&limit=1`, { headers });
    if (!r.ok) { res.status(200).json(FREE); return; }
    const rows = await r.json();
    res.status(200).json(entitlementFromRow(Array.isArray(rows) ? rows[0] : null, Date.now()));
  } catch (e) {
    res.status(200).json(FREE);
  }
});

module.exports = handler;
module.exports.entitlementFromRow = entitlementFromRow;
