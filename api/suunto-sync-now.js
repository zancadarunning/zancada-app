// api/suunto-sync-now.js
//
// Mismo rol que wahoo-sync-now.js: traer entrenos nuevos "a pedido" (lo llama syncTodayNow()
// en app.js). Cuida la cuota: la Developer API de Suunto permite 10 llamadas por minuto y
// 200 por semana, así que acá se hace UNA sola llamada de listado y NO se baja el FIT de
// cada carrera (el cron diario suunto-sync.js completa splits/series).

const verifyUser = require('./_lib/verify-user');
const { isRunningActivity, workoutToRun, mergeSuuntoRuns, ensureFreshSuuntoToken, listSuuntoWorkouts } = require('./_lib/suunto-activity-helpers');
const { applyCors, isPreflight } = require('./_lib/cors');
const { checkSyncCooldown } = require('./_lib/sync-cooldown');
const { withSentry, reportError } = require('./_lib/sentry');

const SYNC_COOLDOWN_MS = 20000;
const LOOKBACK_DAYS = 30;

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  const auth = await verifyUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const userId = auth.userId;

  const base = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

  const allowed = await checkSyncCooldown(base, headers, userId, 'suunto', SYNC_COOLDOWN_MS);
  if (!allowed) return res.status(200).json({ synced: false, reason: 'cooldown' });

  try {
    const connRes = await fetch(`${base}/rest/v1/suunto_connections?user_id=eq.${userId}&select=*`, { headers });
    const conns = await connRes.json();
    if (!conns || !conns.length) return res.status(200).json({ synced: false, reason: 'not_connected' });
    const conn = conns[0];

    const accessToken = await ensureFreshSuuntoToken(base, headers, conn);
    if (!accessToken) return res.status(200).json({ synced: false, reason: 'token_expired' });

    let workouts;
    try {
      workouts = await listSuuntoWorkouts(accessToken, Date.now() - LOOKBACK_DAYS * 86400000, 50);
    } catch (e) {
      console.error('suunto-sync-now: list failed', e && e.message);
      return res.status(200).json({ synced: false, reason: 'no_new_activity' });
    }
    const runWorkouts = workouts.filter(w => isRunningActivity(w.activityId));
    if (!runWorkouts.length) return res.status(200).json({ synced: false, reason: 'no_new_activity' });

    const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers });
    const stateRows = await stateRes.json();
    if (!stateRows || !stateRows.length) return res.status(200).json({ synced: false });
    const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.suuntoId));

    const newRuns = runWorkouts
      .filter(w => !knownIds.has(String(w.workoutKey || w.key)))
      .map(w => workoutToRun(w, null));
    if (newRuns.length) await mergeSuuntoRuns(base, headers, userId, newRuns, 'skip');

    res.status(200).json({ synced: newRuns.length > 0 });
  } catch (err) {
    console.error('suunto-sync-now error', err);
    await reportError(err, { endpoint: 'suunto-sync-now' });
    res.status(500).json({ error: err.message });
  }
});
