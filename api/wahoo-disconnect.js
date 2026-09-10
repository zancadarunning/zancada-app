// api/wahoo-disconnect.js
//
// Mismo rol que strava-disconnect.js/polar-disconnect.js: borra la fila de
// wahoo_connections, revoca el permiso del lado de Wahoo (DELETE
// /v1/permissions) y purga las carreras importadas.

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { purgeWahooRunsForUser } = require('./_lib/wahoo-activity-helpers');

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
      const connRes = await fetch(`${base}/rest/v1/wahoo_connections?user_id=eq.${userId}&select=access_token`, { headers });
      const connRows = await connRes.json();
      const accessToken = connRows && connRows[0] && connRows[0].access_token;
      if (accessToken) {
        await fetch('https://api.wahooligan.com/v1/permissions', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` }
        });
      }
    } catch (e) {
      console.error('wahoo-disconnect: revoke failed', e);
    }

    const delRes = await fetch(`${base}/rest/v1/wahoo_connections?user_id=eq.${userId}`, { method: 'DELETE', headers });
    if (!delRes.ok) {
      console.error('wahoo-disconnect: failed to delete connection row', await delRes.text());
      res.status(500).json({ error: 'Could not disconnect Wahoo' });
      return;
    }

    try {
      await purgeWahooRunsForUser(base, headers, userId);
    } catch (e) {
      console.error('wahoo-disconnect: error purging synced runs', e);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('wahoo-disconnect error', err);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
};
