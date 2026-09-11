// api/coros-init.js
//
// Arranca la conexión con COROS. A diferencia de Strava/Polar/Wahoo (OAuth 2.0
// "clásico" con un client_id/client_secret creados a mano en un panel de
// developers), COROS expone un servidor MCP (Model Context Protocol) con OAuth
// 2.1 + PKCE y REGISTRO DINÁMICO DE CLIENTE (RFC 7591): en vez de crear la app
// en un dashboard, se registra por una llamada a su endpoint de registro y te
// devuelve un client_id -- eso ya se hizo una vez para "Zancada" (no hace
// falta repetirlo) y el client_id que devolvió es el que vive en la variable
// de entorno COROS_CLIENT_ID. Como es un cliente público (sin secreto -- COROS
// respondió token_endpoint_auth_method:"none"), la seguridad del intercambio
// del código por el token la da PKCE, no un secreto compartido.
//
// PKCE en corto: generamos un "code_verifier" al azar acá, mandamos a COROS su
// hash (code_challenge) en la URL de autorización, y guardamos el verifier
// para mandarlo de vuelta en coros-auth.js cuando se intercambia el code por
// el token -- así COROS puede confirmar que quien pide el token es el mismo
// que arrancó el flujo. Como los endpoints son funciones serverless sin
// estado entre sí, el verifier viaja metido DENTRO del "state" firmado (junto
// con el userId y el timestamp, igual que en los otros 3 relojes) en vez de
// guardarse en una sesión de servidor.
//
// Variables de entorno que ya tenés:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
// Variables NUEVAS que hay que agregar en Vercel:
//   COROS_CLIENT_ID       (el que devolvió el registro dinámico -- ver arriba)
//   COROS_STATE_SECRET    (cualquier string largo al azar, uno nuevo -- no
//                          reuses el de Strava/Polar/Wahoo)

const crypto = require('crypto');
const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const secret = process.env.COROS_STATE_SECRET;
  if (!secret) { res.status(500).json({ error: 'Missing COROS_STATE_SECRET' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;

  try {
    const codeVerifier = base64url(crypto.randomBytes(32)); // 43 caracteres, dentro del rango 43-128 que pide PKCE
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());

    const timestamp = Date.now().toString();
    const payload = `${userId}.${timestamp}.${codeVerifier}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const state = `${payload}.${signature}`;

    res.status(200).json({ state, codeChallenge });
  } catch (err) {
    console.error('coros-init error', err);
    await reportError(err, { endpoint: 'coros-init' });
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});
