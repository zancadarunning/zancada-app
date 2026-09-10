// api/wahoo-init.js
//
// Mismo rol que strava-init.js/polar-init.js: genera el "state" firmado que
// se manda a Wahoo al empezar la conexión.
//
// Variables de entorno que ya tenés:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
// Variables NUEVAS que hay que agregar en Vercel:
//   WAHOO_CLIENT_ID
//   WAHOO_CLIENT_SECRET
//   WAHOO_STATE_SECRET   (cualquier string largo al azar, uno nuevo -- no
//                          reuses el de Strava/Polar)

const crypto = require('crypto');
const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');

module.exports = async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const secret = process.env.WAHOO_STATE_SECRET;
  if (!secret) { res.status(500).json({ error: 'Missing WAHOO_STATE_SECRET' }); return; }

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
    console.error('wahoo-init error', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
};
