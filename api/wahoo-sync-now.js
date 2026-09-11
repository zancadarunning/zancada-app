// api/wahoo-sync-now.js
//
// Mismo rol que strava-sync-now.js/polar-sync-now.js: traer workouts nuevos
// "a pedido" (lo llama syncTodayNow() en app.js). A diferencia de Polar, acá
// sí hace falta renovar el access_token si venció -- ver refreshWahooToken()
// en _lib/wahoo-activity-helpers.js.

const verifyUser = require('./_lib/verify-user');
const { workoutToRun, mergeWahooRuns, isRunningWorkoutType, refreshWahooToken } = require('./_lib/wahoo-activity-helpers');
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
    const connRes = await fetch(`${base}/rest/v1/wahoo_connections?user_id=eq.${userId}&select=*`, { headers });
    const conns = await connRes.json();
    if (!conns || !conns.length) {
      return res.status(200).json({ synced: false, reason: 'not_connected' });
    }
    let conn = conns[0];

    if (conn.expires_at < Math.floor(Date.now() / 1000)) {
      const refreshed = await refreshWahooToken(base, headers, userId, conn.refresh_token);
      if (!refreshed) {
        return res.status(200).json({ synced: false, reason: 'token_expired' });
      }
      conn.access_token = refreshed.accessToken;
    }

    const wRes = await fetch('https://api.wahooligan.com/v1/workouts?page=1&per_page=10', {
      headers: { Authorization: `Bearer ${conn.access_token}` }
    });
    if (!wRes.ok) {
      const body = await wRes.text().catch(() => '');
      return res.status(200).json({ synced: false, reason: 'no_new_activity', debug: { httpStatus: wRes.status, body } });
    }
    const wData = await wRes.json();
    const workouts = (wData && wData.workouts) || [];
    const runWorkouts = workouts.filter(w => isRunningWorkoutType(w.workout_type_id));

    if (!runWorkouts.length) {
      return res.status(200).json({ synced: false, reason: 'no_new_activity' });
    }

    const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers });
    const stateRows = await stateRes.json();
    if (!stateRows || !stateRows.length) {
      return res.status(200).json({ synced: false });
    }
    const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.wahooId));
    const newRuns = runWorkouts.filter(w => !knownIds.has(w.id)).map(workoutToRun);

    if (newRuns.length) {
      await mergeWahooRuns(base, headers, userId, newRuns, 'skip');
    }

    res.status(200).json({ synced: newRuns.length > 0 });
  } catch (err) {
    console.error('wahoo-sync-now error', err);
    await reportError(err, { endpoint: 'wahoo-sync-now' });
    res.status(500).json({ error: err.message });
  }
});
