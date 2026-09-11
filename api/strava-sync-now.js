const verifyUser = require('./_lib/verify-user');
const { activityToRun, mergeStravaRuns, setStravaSyncStatus } = require('./_lib/strava-activity-helpers');
const { applyCors, isPreflight } = require('./_lib/cors');

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  const auth = await verifyUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const userId = auth.userId;

  const base = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

  try {
    const connRes = await fetch(`${base}/rest/v1/strava_connections?user_id=eq.${userId}&select=*`, { headers });
    const conns = await connRes.json();
    if (!conns || !conns.length) {
      return res.status(200).json({ synced: false, reason: 'not_connected' });
    }
    let conn = conns[0];

    if (conn.expires_at < Math.floor(Date.now() / 1000)) {
      const refreshRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: conn.refresh_token })
      });
      const refreshed = await refreshRes.json();
      if (refreshed.access_token) {
        conn.access_token = refreshed.access_token;
        await fetch(`${base}/rest/v1/strava_connections?user_id=eq.${userId}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ access_token: refreshed.access_token, refresh_token: refreshed.refresh_token, expires_at: refreshed.expires_at })
        });
      }
    }

    const after = Math.floor(Date.now() / 1000) - 24 * 3600;
    const actsRes = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=10`, {
      headers: { Authorization: `Bearer ${conn.access_token}` }
    });
    const acts = await actsRes.json();
    const runs = Array.isArray(acts) ? acts.filter(a => ((a.sport_type || a.type || '').includes('Run'))) : [];

    if (!runs.length) {
      await setStravaSyncStatus(base, headers, userId, { ok: true });
      return res.status(200).json({ synced: false, reason: 'no_new_activity' });
    }

    // Leemos el estado actual solo para saber qué carreras ya están
    // sincronizadas y no perder tiempo pidiéndole parciales a Strava para
    // esas — la corrección final (que no se dupliquen ni se pisen datos
    // concurrentes) la garantiza merge_strava_runs, no esta lectura.
    const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers });
    const stateRows = await stateRes.json();
    if (!stateRows || !stateRows.length) {
      return res.status(200).json({ synced: false });
    }
    const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.stravaId));

    const newRuns = [];
    for (const act of runs) {
      if (knownIds.has(act.id)) continue;
      // sin parciales acá, para que sea rápido; se completan solos con la sincronización periódica
      newRuns.push(await activityToRun(act, null));
    }

    if (newRuns.length) {
      await mergeStravaRuns(base, headers, userId, newRuns, 'skip');
    }

    await setStravaSyncStatus(base, headers, userId, { ok: true });
    res.status(200).json({ synced: newRuns.length > 0 });
  } catch (err) {
    console.error('strava-sync-now error', err);
    await reportError(err, { endpoint: 'strava-sync-now' });
    await setStravaSyncStatus(base, headers, userId, { ok: false, error: err.message });
    res.status(500).json({ error: err.message });
  }
});
