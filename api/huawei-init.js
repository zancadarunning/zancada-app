// api/huawei-init.js
//
// Mismo rol que wahoo-init.js: genera el "state" firmado que
// se manda a Huawei al empezar la conexión.
//
// Variables de entorno que ya tenés:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
// Variables NUEVAS que hay que agregar en Vercel:
//   HUAWEI_CLIENT_ID
//   HUAWEI_CLIENT_SECRET
//   HUAWEI_STATE_SECRET   (cualquier string largo al azar, uno nuevo -- no
//                          reuses el de Strava/Polar)

const crypto = require('crypto');
const verifyUser = require('./_lib/verify-user');
const { userCooldown } = require('./_lib/sync-cooldown');
const { applyCors, isPreflight } = require('./_lib/cors');

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const secret = process.env.HUAWEI_STATE_SECRET;
  if (!secret) { res.status(500).json({ error: 'Missing HUAWEI_STATE_SECRET' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;
  // tope de frecuencia: sin esto una cuenta podia pedir states sin limite y usarlos para golpear el intercambio de codigo con la marca
  if (!(await userCooldown(userId, 'huawei-init', 5000))) { res.status(429).json({ error: 'Too many requests' }); return; }

  try {
    const timestamp = Date.now().toString();
    const payload = `${userId}.${timestamp}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const state = `${payload}.${signature}`;

    res.status(200).json({ state });
  } catch (err) {
    console.error('huawei-init error', err);
    await reportError(err, { endpoint: 'huawei-init' });
    res.status(500).json({ error: 'Internal error' });
  }
});
