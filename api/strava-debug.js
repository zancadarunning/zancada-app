const requireCronSecret = require('./_lib/require-cron-secret');

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  // Antes este secreto se mandaba por query string (?secret=...); ahora va
  // por el header Authorization, igual que el resto de los endpoints de
  // cron/debug (ver api/_lib/require-cron-secret.js para el por qué).
  if (!requireCronSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connsRes = await fetch(`${base}/rest/v1/strava_connections?select=*`, { headers });
    const conns = await connsRes.json();

    const results = [];
    for (const conn of (Array.isArray(conns) ? conns : [])) {
      try {
        let accessToken = conn.access_token;
        if (conn.expires_at < Math.floor(Date.now() / 1000)) {
          const refreshRes = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: conn.refresh_token })
          });
          const refreshed = await refreshRes.json();
          if (refreshed.access_token) accessToken = refreshed.access_token;
        }

        const meRes = await fetch('https://www.strava.com/api/v3/athlete', { headers: { Authorization: `Bearer ${accessToken}` } });
        const me = await meRes.json();

        const actsRes = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=5', { headers: { Authorization: `Bearer ${accessToken}` } });
        const acts = await actsRes.json();

        results.push({
          user_id: conn.user_id,
          athleteId: me.id,
          athleteName: `${me.firstname || ''} ${me.lastname || ''}`.trim(),
          recentActivities: Array.isArray(acts) ? acts.map(a => ({ name: a.name, type: a.type, date: a.start_date })) : acts
        });
      } catch (e) {
        results.push({ user_id: conn.user_id, error: e.message });
      }
    }

    res.status(200).json({ totalConnections: Array.isArray(conns) ? conns.length : 0, results });
  } catch (err) {
    console.error('strava-debug error', err);
    await reportError(err, { endpoint: 'strava-debug' });
    res.status(500).json({ error: err.message });
  }
});
