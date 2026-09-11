// api/polar-init.js
//
// Mismo rol que strava-init.js: genera el "state" firmado que se manda a
// Polar al empezar la conexión, para que polar-auth.js pueda verificar que
// la conexión corresponde a quien inició sesión (y no a un link armado a
// mano con el user_id de otra persona).
//
// Variables de entorno que ya tenés (las mismas de strava-auth.js):
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
// Variables de entorno NUEVAS que hay que agregar en Vercel:
//   POLAR_CLIENT_ID       (el "Client id" del panel de admin.polaraccesslink.com)
//   POLAR_CLIENT_SECRET   (el "Client Secret" del mismo panel -- se muestra
//                          una sola vez, no se puede volver a ver después)
//   POLAR_STATE_SECRET    (cualquier string largo y al azar, igual que
//                          STRAVA_STATE_SECRET pero uno nuevo -- por ejemplo
//                          generado con `openssl rand -hex 32`)

const crypto = require('crypto');
const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const secret = process.env.POLAR_STATE_SECRET;
  if (!secret) { res.status(500).json({ error: 'Missing POLAR_STATE_SECRET' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;

  try {
    const timestamp = Date.now().toString();
    const payload = `${userId}.${timestamp}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const state = `${payload}.${signature}`;

    res.status(200).json({ state });
  } catch (err) {
    console.error('polar-init error', err);
    await reportError(err, { endpoint: 'polar-init' });
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});
