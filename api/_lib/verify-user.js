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

module.exports = async function verifyUser(req) {
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
    // email: agregado para send-feedback.js (necesita saber a quién responderle sin
    // confiar en un email que mande el cliente suelto) -- los demás endpoints que ya
    // usaban este helper solo leían userId, así que esto es puramente aditivo.
    return { ok: true, userId: user.id, email: user.email, token };
  } catch (e) {
    console.error('verify-user: token verification failed', e);
    return { ok: false, status: 401, error: 'Invalid session' };
  }
};
