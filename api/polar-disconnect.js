// api/polar-disconnect.js
//
// Mismo rol que strava-disconnect.js: borra la fila de polar_connections,
// le avisa a Polar que de-registre al usuario (revoca el token de su lado)
// y purga las carreras importadas de Polar de app_state.data.runs -- ver el
// comentario largo en strava-disconnect.js para el porqué de purgar los
// datos sincronizados al desconectar.
//
// Usa las mismas variables de entorno que ya tenés configuradas:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { purgePolarRunsForUser } = require('./_lib/polar-activity-helpers');

module.exports = async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

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
    } catch (e) {
      // Igual que en strava-disconnect: si Polar no responde, mejor dejar la
      // conexión borrada de nuestro lado que trabar al usuario.
      console.error('polar-disconnect: revoke failed', e);
    }

    const delRes = await fetch(`${base}/rest/v1/polar_connections?user_id=eq.${userId}`, { method: 'DELETE', headers });
    if (!delRes.ok) {
      console.error('polar-disconnect: failed to delete connection row', await delRes.text());
      res.status(500).json({ error: 'Could not disconnect Polar' });
      return;
    }

    try {
      await purgePolarRunsForUser(base, headers, userId);
    } catch (e) {
      console.error('polar-disconnect: error purging synced runs', e);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('polar-disconnect error', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
};
