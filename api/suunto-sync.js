// api/suunto-sync.js
//
// Cron DIARIO (no cada 15 minutos como las otras marcas): los entrenos nuevos de Suunto
// llegan en el momento por webhook (suunto-webhook.js), así que este cron es solo una red de
// seguridad -- por si un aviso se perdió -- y el que COMPLETA el detalle (splits, series,
// potencia) de las carreras que el webhook guardó solo con el resumen. Se mantiene a
// propósito liviano por la cuota de la Developer API de Suunto (200 llamadas por semana):
// por cuenta, 1 llamada de listado + el FIT de hasta FIT_BACKFILL_BATCH carreras.

const requireCronSecret = require('./_lib/require-cron-secret');
const {
  isRunningActivity, workoutToRun, mergeSuuntoRuns, ensureFreshSuuntoToken, listSuuntoWorkouts, fetchSuuntoFit
} = require('./_lib/suunto-activity-helpers');
const { withSentry, reportError } = require('./_lib/sentry');

const FIT_BACKFILL_BATCH = 3;
const LOOKBACK_DAYS = 7;

async function syncOneConnection(base, headers, conn) {
  const accessToken = await ensureFreshSuuntoToken(base, headers, conn);
  if (!accessToken) return { ok: false };

  const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}&select=data`, { headers });
  const stateRows = await stateRes.json();
  if (!stateRows || !stateRows.length) return { ok: true, added: 0, backfilled: 0 };
  const runs = (stateRows[0].data && stateRows[0].data.runs) || [];
  const knownIds = new Set(runs.map(r => r.suuntoId));

  // 1) Entrenos que el webhook se pudo haber perdido.
  let added = 0;
  const workouts = await listSuuntoWorkouts(accessToken, Date.now() - LOOKBACK_DAYS * 86400000, 50);
  const missing = workouts.filter(w => isRunningActivity(w.activityId) && !knownIds.has(String(w.workoutKey || w.key)));
  if (missing.length) {
    await mergeSuuntoRuns(base, headers, conn.user_id, missing.map(w => workoutToRun(w, null)), 'skip');
    added = missing.length;
  }

  // 2) Completar splits/series de carreras guardadas sin el FIT (splitsV !== 3).
  const pending = runs.filter(r => r.source === 'suunto' && r.suuntoId && r.splitsV !== 3).slice(0, FIT_BACKFILL_BATCH);
  const updated = [];
  for (const run of pending) {
    const fit = await fetchSuuntoFit(run.suuntoId, accessToken);
    if (fit._failed) continue; // se reintenta en el próximo ciclo
    run.splits = fit.splits;
    run.series = fit.series;
    if (fit.elevationGain != null) run.elevationGain = fit.elevationGain;
    if (fit.elevationLoss != null) run.elevationLoss = fit.elevationLoss;
    if (fit.avgCadence != null) run.avgCadence = fit.avgCadence;
    if (fit.avgPower != null) run.avgPower = fit.avgPower;
    if (fit.maxPower != null) run.maxPower = fit.maxPower;
    run.splitsV = 3;
    updated.push(run);
  }
  // 'upsert' reemplaza la carrera con la fila bloqueada y conserva el shoeId asignado a mano.
  if (updated.length) await mergeSuuntoRuns(base, headers, conn.user_id, updated, 'upsert');
  return { ok: true, added, backfilled: updated.length };
}

module.exports = withSentry(async (req, res) => {
  if (!(await requireCronSecret(req))) return res.status(401).json({ error: 'Unauthorized' });

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connsRes = await fetch(`${base}/rest/v1/suunto_connections?select=*`, { headers });
    const conns = await connsRes.json();
    const list = Array.isArray(conns) ? conns : [];

    const CRON_TIME_BUDGET_MS = 8000;
    const start = Date.now();
    let synced = 0, errors = 0, added = 0, backfilled = 0, skipped = 0;
    for (const conn of list) {
      if (Date.now() - start > CRON_TIME_BUDGET_MS) { skipped = list.length - synced - errors; break; }
      try {
        const r = await syncOneConnection(base, headers, conn);
        if (!r.ok) { errors++; continue; }
        synced++; added += r.added; backfilled += r.backfilled;
      } catch (e) {
        errors++;
        console.error('suunto-sync (cron): error syncing user', conn.user_id, e && e.message);
      }
    }
    res.status(200).json({ synced, errors, added, backfilled, skipped, total: list.length });
  } catch (err) {
    console.error('suunto-sync error', err);
    await reportError(err, { endpoint: 'suunto-sync' });
    res.status(500).json({ error: err.message });
  }
});
