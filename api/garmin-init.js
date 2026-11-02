// api/garmin-init.js
//
// Arranca la conexión con Garmin Connect (OAuth2 con PKCE, ver el PDF "OAuth2.0 PKCE Specification" del portal de desarrolladores de Garmin).
// Mismo diseño que coros-init.js: generamos un code_verifier al azar, mandamos a Garmin su hash (code_challenge) en la URL de autorización y guardamos el verifier
// CIFRADO dentro del "state" firmado (junto con el userId y la hora), porque los endpoints son funciones sin estado entre sí. La vuelta (garmin-callback.js) lo
// recupera para el intercambio del código. El secreto de la app (GARMIN_CLIENT_SECRET) solo se usa en el servidor.
//
// Variables de entorno (Vercel):
//   GARMIN_CLIENT_ID, GARMIN_CLIENT_SECRET  (del portal de Garmin, Apps)
//   GARMIN_STATE_SECRET                     (texto largo al azar, uno nuevo)
//   GARMIN_WEBHOOK_SECRET                   (texto largo al azar, otro distinto: va en la URL del webhook)

const crypto = require('crypto');
const verifyUser = require('./_lib/verify-user');
const { userCooldown } = require('./_lib/sync-cooldown');
const { encToken, keyIsValid } = require('./_lib/token-crypto');
const { applyCors, isPreflight } = require('./_lib/cors');
const { GARMIN_AUTHORIZE_URL, REDIRECT_URI } = require('./_lib/garmin-activity-helpers');
const { withSentry, reportError } = require('./_lib/sentry');

const base64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const secret = process.env.GARMIN_STATE_SECRET;
  const clientId = process.env.GARMIN_CLIENT_ID;
  if (!secret || !clientId) { res.status(500).json({ error: 'Not configured' }); return; }
  // sin clave valida encToken guarda en texto plano: el verifier de PKCE quedaria legible en la URL de autorizacion y PKCE no protegeria nada
  if (!keyIsValid()) { console.error('garmin-init: falta una clave de cifrado de tokens valida'); res.status(500).json({ error: 'Not configured' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;
  if (!(await userCooldown(userId, 'garmin-init', 5000))) { res.status(429).json({ error: 'Too many requests' }); return; }

  try {
    const codeVerifier = base64url(crypto.randomBytes(32));   // 43 caracteres, dentro del rango 43-128 que pide PKCE
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    const timestamp = Date.now().toString();
    const sealed = Buffer.from(encToken(codeVerifier)).toString('base64url');
    const payload = `${userId}.${timestamp}.${sealed}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const state = `${payload}.${signature}`;
    const authUrl = `${GARMIN_AUTHORIZE_URL}?` + new URLSearchParams({
      client_id: clientId, response_type: 'code', code_challenge: codeChallenge, code_challenge_method: 'S256', redirect_uri: REDIRECT_URI, state
    }).toString();
    res.status(200).json({ authUrl });
  } catch (err) {
    console.error('garmin-init error', err);
    await reportError(err, { endpoint: 'garmin-init' });
    res.status(500).json({ error: 'Internal error' });
  }
});
