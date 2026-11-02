// api/garmin-disconnect.js
//
// Mismo rol que coros-disconnect.js: desconecta Garmin desde Zancada. Por el acuerdo con Garmin (OAuth2 PKCE, "Delete User Registration") hay que avisarle con
// DELETE /partner-gateway/rest/user/registration cuando la persona quita la conexión desde acá. Además se borran los entrenamientos que Zancada había mandado a su
// Garmin Connect, la fila de garmin_connections y las carreras importadas de Garmin.

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { ensureFreshGarminToken, deleteGarminRegistration, purgeGarminRunsForUser } = require('./_lib/garmin-activity-helpers');
const { removeAllGarminWorkouts } = require('./_lib/garmin-plan-sync');
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
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    try {
      const connRes = await fetch(`${base}/rest/v1/garmin_connections?user_id=eq.${userId}&select=user_id,access_token,refresh_token,expires_at,refresh_expires_at`, { headers });
      const rows = await connRes.json();
      const conn = Array.isArray(rows) && rows[0];
      if (conn) {
        const accessToken = await ensureFreshGarminToken(base, headers, conn);
        if (accessToken) {
          await removeAllGarminWorkouts(base, headers, userId, accessToken);
          await deleteGarminRegistration(accessToken);
        }
      }
    } catch (e) {
      console.error('garmin-disconnect: no se pudo avisar a Garmin', e && e.message);
    }

    const delRes = await fetch(`${base}/rest/v1/garmin_connections?user_id=eq.${userId}`, { method: 'DELETE', headers });
    if (!delRes.ok) {
      console.error('garmin-disconnect: no se pudo borrar la conexión', await delRes.text().catch(() => ''));
      res.status(500).json({ error: 'Could not disconnect Garmin' });
      return;
    }
    await fetch(`${base}/rest/v1/sent_notifications?user_id=eq.${userId}&kind=eq.garmin_wk`, { method: 'DELETE', headers }).catch(() => {});
    try { await purgeGarminRunsForUser(base, headers, userId); } catch (e) { console.error('garmin-disconnect: error purgando las carreras', e && e.message); }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('garmin-disconnect error', err);
    await reportError(err, { endpoint: 'garmin-disconnect' });
    res.status(500).json({ error: 'Internal error' });
  }
});
