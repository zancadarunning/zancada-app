// api/wahoo-sync.js
//
// Mismo rol que sync-strava.js/coros-sync.js pero para Wahoo: lo dispara el cron de Vercel
// y recorre TODAS las cuentas conectadas, no solo la de quien tenga la app abierta. Hasta
// ahora Wahoo solo se sincronizaba con el botón "Sincronizar" manual de wahoo-sync-now.js.

const requireCronSecret = require('./_lib/require-cron-secret');
const { workoutToRun, mergeWahooRuns, isRunningWorkoutType, refreshWahooToken, fetchFitSplits } = require('./_lib/wahoo-activity-helpers');
const { withSentry, reportError } = require('./_lib/sentry');

// Cuántas carreras sin splits reales se completan por cuenta en cada corrida del cron --
// ver el comentario grande de backfillWahooSplits.
const BACKFILL_BATCH = 5;

// Completa splits/series/potencia de carreras YA guardadas que quedaron sin el FIT real
// (splitsV !== 3) -- el caso típico es una carrera cargada por el botón "Sincronizar
// ahora" (wahoo-sync-now.js) o por la conexión inicial (wahoo-auth.js), que a propósito
// no piden el FIT ahí para responder rápido. Antes esas carreras quedaban así para
// siempre: el resto de este cron solo procesa workouts NUEVOS, nunca vuelve a mirar uno
// que ya esté guardado. Mismo criterio que api/strava-resync.js/backfillPolarSplits en
// polar-sync.js, plegado acá adentro del cron normal en vez de un endpoint aparte.
//
// A diferencia de Polar (donde el FIT se pide por id, GET /v3/exercises/{id}/fit),
// workoutToRun necesita workout_summary.file.url para bajar el FIT de Wahoo, y esa url NO
// se guarda en el run ya mergeado (solo wahooId) -- hace falta volver a pedir el detalle
// del workout primero. Si ese pedido de detalle falla (red, Wahoo caído), NO se marca
// splitsV -- se reintenta en el próximo ciclo del cron en vez de darlo por perdido. Si el
// detalle sí responde pero no trae FIT (o el FIT viene vacío), se marca igual (mismo
// criterio que backfillPolarSplits: reintentar para siempre algo que Wahoo nunca va a
// tener no cambiaría el resultado).
async function backfillWahooSplits(base, headers, conn, accessToken) {
  const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}&select=data`, { headers });
  const stateRows = await stateRes.json();
  if (!stateRows || !stateRows.length) return 0;
  const data = stateRows[0].data || {};
  const runs = data.runs || [];
  const pending = runs.filter(r => r.source === 'wahoo' && r.wahooId && r.splitsV !== 3).slice(0, BACKFILL_BATCH);
  if (!pending.length) return 0;

  let changed = false;
  for (const run of pending) {
    try {
      const wRes = await fetch(`https://api.wahooligan.com/v1/workouts/${run.wahooId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!wRes.ok) continue; // se reintenta en el próximo ciclo, no se marca splitsV
      const workout = await wRes.json();
      const fitUrl = workout && workout.workout_summary && workout.workout_summary.file && workout.workout_summary.file.url;
      const fit = await fetchFitSplits(fitUrl, accessToken);
      run.splits = fit.splits;
      run.series = fit.series;
      if (fit.elevationGain != null) run.elevationGain = fit.elevationGain;
      if (fit.elevationLoss != null) run.elevationLoss = fit.elevationLoss;
      if (fit.avgCadence != null) run.avgCadence = fit.avgCadence;
      if (fit.avgPower != null) run.avgPower = fit.avgPower;
      if (fit.maxPower != null) run.maxPower = fit.maxPower;
      run.splitsV = 3;
      changed = true;
    } catch (e) {
      console.error('wahoo-sync (cron): backfill error for run', run.wahooId, e && e.message);
    }
  }
  if (changed) {
    await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ data, updated_at: new Date().toISOString() })
    });
  }
  return pending.length;
}

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

    let synced = 0, errors = 0, backfilled = 0;
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

        backfilled += await backfillWahooSplits(base, headers, conn, accessToken);
        synced++;
      } catch (e) {
        errors++;
        console.error('wahoo-sync (cron): error syncing user', conn.user_id, e);
      }
    }

    res.status(200).json({ synced, errors, backfilled, total: Array.isArray(conns) ? conns.length : 0 });
  } catch (err) {
    console.error('wahoo-sync error', err);
    await reportError(err, { endpoint: 'wahoo-sync' });
    res.status(500).json({ error: err.message });
  }
});
