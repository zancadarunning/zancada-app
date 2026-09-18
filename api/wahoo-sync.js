// api/wahoo-sync.js
//
// Mismo rol que sync-strava.js/coros-sync.js pero para Wahoo: lo dispara el cron de Vercel
// y recorre TODAS las cuentas conectadas, no solo la de quien tenga la app abierta. Hasta
// ahora Wahoo solo se sincronizaba con el botón "Sincronizar" manual de wahoo-sync-now.js.

const requireCronSecret = require('./_lib/require-cron-secret');
const { workoutToRun, mergeWahooRuns, isRunningWorkoutType, refreshWahooToken } = require('./_lib/wahoo-activity-helpers');
const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  if (!requireCronSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connsRes = await fetch(`${base}/rest/v1/wahoo_connections?select=*`, { headers });
    const conns = await connsRes.json();

    let synced = 0, errors = 0;
    for (const conn of (Array.isArray(conns) ? conns : [])) {
      try {
        let accessToken = conn.access_token;
        if (conn.expires_at < Math.floor(Date.now() / 1000)) {
          const refreshed = await refreshWahooToken(base, headers, conn.user_id, conn.refresh_token);
          if (!refreshed) { errors++; continue; }
          accessToken = refreshed.accessToken;
        }

        const wRes = await fetch('https://api.wahooligan.com/v1/workouts?page=1&per_page=10', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!wRes.ok) {
          errors++;
          console.error('wahoo-sync (cron): workouts fetch failed', conn.user_id, wRes.status, await wRes.text().catch(() => ''));
          continue;
        }
        const wData = await wRes.json();
        const workouts = (wData && wData.workouts) || [];
        const runWorkouts = workouts.filter(w => isRunningWorkoutType(w.workout_type_id));

        if (runWorkouts.length) {
          const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}&select=data`, { headers });
          const stateRows = await stateRes.json();
          if (stateRows && stateRows.length) {
            const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.wahooId));
            // El cron sí busca el FIT de cada workout nuevo (splits/series/potencia) --
            // a diferencia del botón "Sincronizar ahora" (wahoo-sync-now.js), acá no hay
            // apuro por responder rápido a un usuario esperando en pantalla.
            const newRuns = [];
            for (const w of runWorkouts.filter(w => !knownIds.has(w.id))) {
              newRuns.push(await workoutToRun(w, accessToken));
            }
            if (newRuns.length) await mergeWahooRuns(base, headers, conn.user_id, newRuns, 'skip');
          }
        }

        synced++;
      } catch (e) {
        errors++;
        console.error('wahoo-sync (cron): error syncing user', conn.user_id, e);
      }
    }

    res.status(200).json({ synced, errors, total: Array.isArray(conns) ? conns.length : 0 });
  } catch (err) {
    console.error('wahoo-sync error', err);
    await reportError(err, { endpoint: 'wahoo-sync' });
    res.status(500).json({ error: err.message });
  }
});
