// api/suunto-status.js
//
// Dice si la cuenta del usuario tiene Suunto conectado, leyendo suunto_connections con la clave de
// servicio. Es la fuente de verdad: la consulta directa desde el navegador (supabase-js + RLS)
// devolvía vacío SIN error en el iPhone aunque la cuenta estaba conectada, y las marcas guardadas
// en el estado de la cuenta pueden quedar viejas si otro dispositivo las vuelve a guardar después de
// desconectar. Solo toca la base de datos: no llama a Suunto (no gasta cuota de su API).

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  try {
    const r = await fetch(`${base}/rest/v1/suunto_connections?user_id=eq.${auth.userId}&select=user_id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (!r.ok) { res.status(502).json({ error: 'No se pudo consultar la conexión' }); return; }
    const rows = await r.json();
    res.status(200).json({ connected: Array.isArray(rows) && rows.length > 0 });
  } catch (err) {
    console.error('suunto-status error', err);
    await reportError(err, { endpoint: 'suunto-status' });
    res.status(500).json({ error: err.message });
  }
});
