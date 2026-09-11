const requireCronSecret = require('./_lib/require-cron-secret');
const { activityToRun, mergeStravaRuns, setStravaSyncStatus } = require('./_lib/strava-activity-helpers');

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  if (!requireCronSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connsRes = await fetch(`${base}/rest/v1/strava_connections?select=*`, { headers });
    const conns = await connsRes.json();

    let synced = 0, errors = 0;
    for (const conn of (Array.isArray(conns) ? conns : [])) {
      try {
        let accessToken = conn.access_token;
        if (conn.expires_at < Math.floor(Date.now() / 1000)) {
          const refreshRes = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: conn.refresh_token })
          });
          const refreshed = await refreshRes.json();
          if (refreshed.access_token) {
            accessToken = refreshed.access_token;
            await fetch(`${base}/rest/v1/strava_connections?user_id=eq.${conn.user_id}`, {
              method: 'PATCH', headers,
              body: JSON.stringify({ access_token: refreshed.access_token, refresh_token: refreshed.refresh_token, expires_at: refreshed.expires_at })
            });
          }
        }

        const after = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
        const actsRes = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=30`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const acts = await actsRes.json();
        const runActs = Array.isArray(acts) ? acts.filter(a => ((a.sport_type || a.type || '').includes('Run'))) : [];

        if (runActs.length) {
          const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}&select=data`, { headers });
          const stateRows = await stateRes.json();
          if (stateRows && stateRows.length) {
            const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.stravaId));
            const newRuns = [];
            for (const act of runActs) {
              if (knownIds.has(act.id)) continue;
              newRuns.push(await activityToRun(act, accessToken));
            }
            await mergeStravaRuns(base, headers, conn.user_id, newRuns, 'skip');
          }
        }

        synced++;
        await setStravaSyncStatus(base, headers, conn.user_id, { ok: true });
      } catch (e) {
        errors++;
        await setStravaSyncStatus(base, headers, conn.user_id, { ok: false, error: e.message });
      }
    }

    res.status(200).json({ synced, errors, total: Array.isArray(conns) ? conns.length : 0 });
  } catch (err) {
    console.error('sync-strava error', err);
    await reportError(err, { endpoint: 'sync-strava' });
    res.status(500).json({ error: err.message });
  }
});
