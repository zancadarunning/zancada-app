// api/device-status.js
//
// Dice qué marcas tiene conectadas la cuenta del usuario leyendo las tablas *_connections con la
// clave de servicio. Es la fuente de verdad: la consulta directa desde el navegador (supabase-js +
// RLS) devolvió vacío SIN error en el iPhone aunque la cuenta estaba conectada. Solo toca la base
// de datos (no llama a ninguna marca, no gasta cuota de sus APIs).

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { withSentry, reportError } = require('./_lib/sentry');

const TABLES = { strava: 'strava_connections', polar: 'polar_connections', wahoo: 'wahoo_connections', coros: 'coros_connections', suunto: 'suunto_connections' };

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  try {
    const entries = await Promise.all(Object.entries(TABLES).map(async ([brand, table]) => {
      const r = await fetch(`${base}/rest/v1/${table}?user_id=eq.${auth.userId}&select=user_id`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!r.ok) return [brand, null]; // no se pudo saber: el cliente usa su propia consulta para esa marca
      const rows = await r.json().catch(() => null);
      return [brand, Array.isArray(rows) ? rows.length > 0 : null];
    }));
    res.status(200).json(Object.fromEntries(entries));
  } catch (err) {
    console.error('device-status error', err);
    await reportError(err, { endpoint: 'device-status' });
    res.status(500).json({ error: err.message });
  }
});
