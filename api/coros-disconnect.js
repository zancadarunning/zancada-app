// api/coros-disconnect.js
//
// Mismo rol que strava-disconnect.js/polar-disconnect.js/wahoo-disconnect.js:
// revoca el token del lado de COROS, borra la fila de coros_connections y
// purga las carreras importadas de app_state.data.runs.

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { purgeCorosRunsForUser } = require('./_lib/coros-activity-helpers');

const REGION_HOST = 'mcpus.coros.com'; // ver el comentario sobre región en coros-auth.js

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
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
      const connRes = await fetch(`${base}/rest/v1/coros_connections?user_id=eq.${userId}&select=access_token`, { headers });
      const connRows = await connRes.json();
      const accessToken = connRows && connRows[0] && connRows[0].access_token;
      if (accessToken) {
        await fetch(`https://${REGION_HOST}/oauth2/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: accessToken, client_id: process.env.COROS_CLIENT_ID })
        });
      }
    } catch (e) {
      console.error('coros-disconnect: revoke failed', e);
    }

    const delRes = await fetch(`${base}/rest/v1/coros_connections?user_id=eq.${userId}`, { method: 'DELETE', headers });
    if (!delRes.ok) {
      console.error('coros-disconnect: failed to delete connection row', await delRes.text());
      res.status(500).json({ error: 'Could not disconnect COROS' });
      return;
    }

    try {
      await purgeCorosRunsForUser(base, headers, userId);
    } catch (e) {
      console.error('coros-disconnect: error purging synced runs', e);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('coros-disconnect error', err);
    await reportError(err, { endpoint: 'coros-disconnect' });
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});
