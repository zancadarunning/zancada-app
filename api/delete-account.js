// api/delete-account.js
//
// Borra la cuenta de un usuario por completo: sus datos en la base y, al
// final, su usuario de autenticación en Supabase. Sigue el mismo estilo que
// tus otros endpoints (fetch directo a la REST API de Supabase, sin
// librerías extra como @supabase/supabase-js).
//
// Usa las mismas variables de entorno que ya tenés configuradas para
// strava-auth.js:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');

module.exports = async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  // Verificamos el token contra Supabase Auth para saber con certeza qué
  // usuario está pidiendo el borrado (nunca confiamos en un user_id que
  // venga del cliente).
  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

    // Antes de borrar cada conexión, le avisamos al proveedor que revoque el
    // permiso -- si no, la autorización queda activa de su lado aunque acá
    // ya no quede rastro de ella (esto un rato NO lo hacíamos para Polar y
    // Wahoo, solo para Strava; quedaba el mismo problema para los otros dos
    // relojes, solo que nadie lo había notado todavía).
    try {
      const connRes = await fetch(`${base}/rest/v1/strava_connections?user_id=eq.${userId}&select=access_token`, { headers });
      const connRows = await connRes.json();
      const accessToken = connRows && connRows[0] && connRows[0].access_token;
      if (accessToken) {
        await fetch(`https://www.strava.com/oauth/deauthorize?access_token=${encodeURIComponent(accessToken)}`, { method: 'POST' });
      }
    } catch (e) { console.error('delete-account: strava revoke failed', e); }

    try {
      const connRes = await fetch(`${base}/rest/v1/polar_connections?user_id=eq.${userId}&select=access_token,polar_user_id`, { headers });
      const connRows = await connRes.json();
      const conn = connRows && connRows[0];
      if (conn && conn.access_token) {
        await fetch(`https://www.polaraccesslink.com/v3/users/${conn.polar_user_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${conn.access_token}` }
        });
      }
    } catch (e) { console.error('delete-account: polar revoke failed', e); }

    try {
      const connRes = await fetch(`${base}/rest/v1/wahoo_connections?user_id=eq.${userId}&select=access_token`, { headers });
      const connRows = await connRes.json();
      const accessToken = connRows && connRows[0] && connRows[0].access_token;
      if (accessToken) {
        await fetch('https://api.wahooligan.com/v1/permissions', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` }
        });
      }
    } catch (e) { console.error('delete-account: wahoo revoke failed', e); }

    // Borramos los datos de la app asociados al usuario, tabla por tabla.
    // Cada una se borra de forma tolerante a errores: si una falla, seguimos
    // igual con las demás en vez de frenar todo el proceso a mitad de camino.
    // (No hace falta listar acá polar_connections/wahoo_connections ni las
    // tablas sociales -- usernames/follows/run_feed/run_likes -- porque las
    // 6 tienen su user_id con ON DELETE CASCADE hacia auth.users, así que el
    // borrado del usuario de auth más abajo ya las limpia solas. Sí hace
    // falta listar acá las 3 de abajo porque son las únicas que el borrado
    // del usuario de auth no toca de por sí.)
    const tables = ['app_state', 'push_subscriptions', 'strava_connections'];
    for (const table of tables) {
      try {
        await fetch(`${base}/rest/v1/${table}?user_id=eq.${userId}`, { method: 'DELETE', headers });
      } catch (e) { console.error(`delete-account: failed to clear ${table}`, e); }
    }

    // Por último, borramos el usuario de autenticación. Esto es lo que hace
    // que ya no pueda volver a iniciar sesión con ese email.
    const deleteRes = await fetch(`${base}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (!deleteRes.ok) {
      const errBody = await deleteRes.text();
      console.error('delete-account: failed to delete auth user', errBody);
      res.status(500).json({ error: 'Could not delete account' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('delete-account error', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
};
