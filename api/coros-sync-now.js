// api/coros-sync-now.js
//
// Mismo rol que strava-sync-now.js/polar-sync-now.js/wahoo-sync-now.js: traer
// actividades nuevas "a pedido" (lo llama syncTodayNow() en app.js). Los
// tokens de COROS vencen, así que renovamos con refreshCorosToken() si hace
// falta, igual que Wahoo.

const verifyUser = require('./_lib/verify-user');
const { activityToRun, mergeCorosRuns, refreshCorosToken, callCorosMcpTool } = require('./_lib/coros-activity-helpers');
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
    const connRes = await fetch(`${base}/rest/v1/coros_connections?user_id=eq.${userId}&select=*`, { headers });
    const conns = await connRes.json();
    if (!conns || !conns.length) {
      return res.status(200).json({ synced: false, reason: 'not_connected' });
    }
    let conn = conns[0];

    if (conn.expires_at < Math.floor(Date.now() / 1000)) {
      const refreshed = await refreshCorosToken(base, headers, userId, conn.refresh_token);
      if (!refreshed) {
        return res.status(200).json({ synced: false, reason: 'token_expired' });
      }
      conn.access_token = refreshed.accessToken;
    }

    const records = await callCorosMcpTool(conn.access_token, 'querySportRecords', { limit: 10 });
    const list = Array.isArray(records) ? records : (records && records.records) || [];
    const runRecords = list.filter(r => {
      const sport = r.sportType ?? r.sport_type ?? r.sportName ?? '';
      return String(sport).toLowerCase().includes('run');
    });

    if (!runRecords.length) {
      return res.status(200).json({ synced: false, reason: 'no_new_activity' });
    }

    const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers });
    const stateRows = await stateRes.json();
    if (!stateRows || !stateRows.length) {
      return res.status(200).json({ synced: false });
    }
    const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.corosId));
    const newRecords = runRecords.filter(r => !knownIds.has(r.id ?? r.activityId ?? r.labelId));

    const newRuns = [];
    for (const record of newRecords) {
      let detail = null;
      try {
        detail = await callCorosMcpTool(conn.access_token, 'getActivityDetail', { id: record.id ?? record.activityId ?? record.labelId });
      } catch (e) {
        console.error('coros-sync-now: getActivityDetail failed for', record.id, e);
      }
      newRuns.push(activityToRun(record, detail));
    }

    if (newRuns.length) {
      await mergeCorosRuns(base, headers, userId, newRuns, 'skip');
    }

    res.status(200).json({ synced: newRuns.length > 0 });
  } catch (err) {
    console.error('coros-sync-now error', err);
    await reportError(err, { endpoint: 'coros-sync-now' });
    res.status(500).json({ error: err.message });
  }
});
