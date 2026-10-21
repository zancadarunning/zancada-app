// api/_lib/verify-user.js
//
// Verifica el token de sesión de Supabase que manda el cliente en el header
// Authorization, y devuelve el user_id real verificado contra Supabase Auth.
// Nunca hay que confiar en un user_id que venga suelto del cliente (por
// ejemplo en el body del request): siempre hay que pasar por acá.
//
// Antes esta misma verificación estaba copiada, con pequeñas diferencias
// entre copias, en chat.js, delete-account.js, strava-init.js,
// strava-disconnect.js y strava-sync-now.js. Tenerla repetida 5 veces es
// justo lo que hace que un arreglo de seguridad futuro (o un bug en la
// verificación) quede aplicado en unos endpoints sí y en otros no, sin que
// nadie lo note. Ahora vive acá una sola vez.
//
// Uso típico dentro de un endpoint:
//
//   const verifyUser = require('./_lib/verify-user');
//   module.exports = async (req, res) => {
//     const auth = await verifyUser(req);
//     if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
//     const userId = auth.userId;
//     ...
//   };

// El token de Supabase trae en "amr" cuándo y cómo se autenticó la persona por última vez (el dato se conserva al renovar el token cada hora).
// Devuelve ese momento en segundos, o 0 si no se puede leer.
function lastAuthAtFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return (Array.isArray(payload.amr) ? payload.amr : []).reduce((max, a) => Math.max(max, Number(a && a.timestamp) || 0), 0);
  } catch (e) { return 0; }
}
// ¿Se autenticó hace poco? Solo se exige a las cuentas con contraseña (provider "email"): una sesión robada no alcanza para borrar o cambiar
// lo que no tiene vuelta atrás, hace falta volver a escribir la contraseña. Las cuentas de Google/Apple las protege su proveedor.
function isRecentLogin(auth, maxAgeSec) {
  if (!auth || auth.provider !== 'email') return true;
  const age = Date.now() / 1000 - (auth.lastAuthAt || 0);
  return auth.lastAuthAt > 0 && age >= -60 && age <= (maxAgeSec || 600);
}

// Nivel de autenticación del token ("aal1" = solo contraseña, "aal2" = también el segundo paso).
function aalFromToken(token) {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')).aal || 'aal1'; } catch (e) { return 'aal1'; }
}

async function verifyUser(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { ok: false, status: 401, error: 'Missing token' };

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  try {
    const userRes = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` }
    });
    const user = await userRes.json().catch(() => null);
    if (!userRes.ok || !user || !user.id) {
      return { ok: false, status: 401, error: 'Invalid session' };
    }
    // Cuenta con verificación en dos pasos activada: una sesión que solo pasó la contraseña (aal1) no alcanza, aunque el token sea válido.
    // (Un ladrón de contraseñas no puede usar la API sin el código.)
    const hasMfa = Array.isArray(user.factors) && user.factors.some(f => f && f.status === 'verified');
    if (hasMfa && aalFromToken(token) !== 'aal2') return { ok: false, status: 401, error: 'MFA required' };
    // email: agregado para send-feedback.js (necesita saber a quién responderle sin
    // confiar en un email que mande el cliente suelto) -- los demás endpoints que ya
    // usaban este helper solo leían userId, así que esto es puramente aditivo.
    // emailConfirmed: lo usa admin-stats.js (un mail sin confirmar no alcanza para ser admin)
    // provider y lastAuthAt: para exigir un inicio de sesión reciente antes de acciones que no se pueden deshacer (ver isRecentLogin)
    return { ok: true, userId: user.id, email: user.email, emailConfirmed: !!user.email_confirmed_at, token, provider: (user.app_metadata && user.app_metadata.provider) || null, lastAuthAt: lastAuthAtFromToken(token) };
  } catch (e) {
    console.error('verify-user: token verification failed', e);
    return { ok: false, status: 401, error: 'Invalid session' };
  }
}

module.exports = verifyUser;
module.exports.isRecentLogin = isRecentLogin;
module.exports.lastAuthAtFromToken = lastAuthAtFromToken;
module.exports.aalFromToken = aalFromToken;
