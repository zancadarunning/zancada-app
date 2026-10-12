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

const MB = 1024 * 1024;
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : d; };

// Límites a vigilar. Los valores por defecto son los del plan GRATIS de cada servicio y del cupo que tiene hoy
// la app en Strava; se pueden ajustar con variables de entorno si cambiás de plan o Strava te da más cupo.
//   STRAVA_ATHLETE_LIMIT (10), SUPABASE_DB_LIMIT_MB (500), SUPABASE_MAU_LIMIT (50000), CHAT_DAILY_LIMIT (60, el mismo de chat.js)
function buildLimits(s) {
  const u = s.users || {}, w = s.watches || {}, db = s.db || {}, chat = s.chat || {};
  const chatLimit = num(process.env.CHAT_DAILY_LIMIT, 60);
  return [
    { key: 'strava', used: w.strava || 0, limit: num(process.env.STRAVA_ATHLETE_LIMIT, 10), unit: 'atletas' },
    { key: 'db', used: Math.round((db.size_bytes || 0) / MB), limit: num(process.env.SUPABASE_DB_LIMIT_MB, 500), unit: 'MB' },
    { key: 'mau', used: u.signed_in_30d || 0, limit: num(process.env.SUPABASE_MAU_LIMIT, 50000), unit: 'personas' },
    { key: 'chat', used: chat.max_user_today || 0, limit: chatLimit, unit: 'mensajes' }
  ].map(l => Object.assign(l, { pct: Math.round((l.used / l.limit) * 100) }));
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
    const stats = await r.json();
    stats.limits = buildLimits(stats);
    res.status(200).json(stats);
  } catch (e) {
    reportError(e);
    res.status(500).json({ error: 'Error interno' });
  }
});
