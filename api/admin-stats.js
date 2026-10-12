// api/admin-stats.js
//
// Panel de administración: números globales de la app (cuentas, actividad, relojes, push).
// Solo lo puede usar quien esté en ADMIN_EMAILS (variable de entorno de Vercel, lista de mails
// separados por coma). Falla CERRADO: sin la variable, o con un mail que no está en la lista,
// o con un mail sin confirmar, nadie entra.
//
//   GET /api/admin-stats?probe=1   ->  { admin: true }   (solo para saber si mostrar el acceso)
//   GET /api/admin-stats           ->  { ...números }    (los arma la función SQL admin_stats())
//
// Las cuentas y los datos se leen con la clave de servicio de Supabase (SUPABASE_SERVICE_KEY),
// que vive solo en el servidor: nunca llega al teléfono ni a la web.

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { withSentry, reportError } = require('./_lib/sentry');

function adminList() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

  const admins = adminList();
  const email = String(auth.email || '').toLowerCase();
  if (!admins.length || !email || !auth.emailConfirmed || !admins.includes(email)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  if (req.query && String(req.query.probe) === '1') { res.status(200).json({ admin: true }); return; }

  try {
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    const r = await fetch(`${base}/rest/v1/rpc/admin_stats`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('admin-stats: rpc failed', r.status, detail);
      res.status(502).json({ error: 'No se pudo leer admin_stats() -- ¿ya corriste sql/admin_stats.sql en Supabase?' });
      return;
    }
    res.status(200).json(await r.json());
  } catch (e) {
    reportError(e);
    res.status(500).json({ error: 'Error interno' });
  }
});
