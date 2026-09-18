// api/polar-sync.js
//
// Mismo rol que sync-strava.js/coros-sync.js/wahoo-sync.js pero para Polar: lo dispara el
// cron de Vercel y recorre TODAS las cuentas conectadas. Hasta ahora Polar solo se
// sincronizaba con el botón "Sincronizar" manual de polar-sync-now.js. Los tokens de Polar
// no vencen (ver polar-sync-now.js), así que acá no hace falta ningún paso de refresh.

const requireCronSecret = require('./_lib/require-cron-secret');
const { exerciseToRun, mergePolarRuns, fetchFitSplits } = require('./_lib/polar-activity-helpers');
const { withSentry, reportError } = require('./_lib/sentry');

// Cuántas carreras sin splits reales se completan por cuenta en cada corrida del cron.
// Un lote chico en vez de todas de una: la mayoría de las cuentas no van a tener nada
// pendiente (el cron normal ya trae el FIT de cada carrera nueva, ver más abajo), y esto
// solo existe para ir vaciando de a poco lo que quedó sin completar por otras vías (ver
// backfillPolarSplits).
const BACKFILL_BATCH = 5;

// Completa splits/series/potencia de carreras YA guardadas que quedaron sin el FIT real
// (splitsV !== 3) -- el caso típico es una carrera cargada por el botón "Sincronizar
// ahora" (polar-sync-now.js) o por la conexión inicial (polar-auth.js), que a propósito
// no piden el FIT ahí para responder rápido. Antes esas carreras quedaban así para
// siempre: el resto de este cron solo procesa ejercicios NUEVOS (ver más abajo), nunca
// vuelve a mirar uno que ya esté guardado. Mismo criterio que api/strava-resync.js, pero
// plegado acá adentro del cron normal en vez de un endpoint aparte -- así no hace falta
// registrar un cron más (Vercel limita la cantidad de crons según el plan).
async function backfillPolarSplits(base, headers, conn) {
  const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}&select=data`, { headers });
  const stateRows = await stateRes.json();
  if (!stateRows || !stateRows.length) return 0;
  const data = stateRows[0].data || {};
  const runs = data.runs || [];
  const pending = runs.filter(r => r.source === 'polar' && r.polarId && r.splitsV !== 3).slice(0, BACKFILL_BATCH);
  if (!pending.length) return 0;

  for (const run of pending) {
    const fit = await fetchFitSplits(run.polarId, conn.access_token);
    run.splits = fit.splits;
    run.series = fit.series;
    if (fit.elevationGain != null) run.elevationGain = fit.elevationGain;
    if (fit.elevationLoss != null) run.elevationLoss = fit.elevationLoss;
    if (fit.avgCadence != null) run.avgCadence = fit.avgCadence;
    if (fit.avgPower != null) run.avgPower = fit.avgPower;
    if (fit.maxPower != null) run.maxPower = fit.maxPower;
    // Se marca completo aunque el FIT haya venido vacío (mismo criterio que
    // strava-resync.js) -- si Polar de verdad no tiene el archivo para ese ejercicio,
    // reintentarlo cada 15min para siempre no cambiaría el resultado.
    run.splitsV = 3;
  }
  // mergePolarRuns en modo 'upsert' hace el reemplazo adentro de una transacción con la
  // fila bloqueada (ver merge_polar_runs.sql), preservando el shoeId que el usuario haya
  // asignado a mano -- reemplaza al viejo PATCH directo de acá, que mandaba de vuelta TODO
  // app_state.data tal como se había leído al principio de esta función, minutos antes:
  // si el usuario guardaba algo (chat, plan, perfil) en el medio, ese guardado se perdía.
  await mergePolarRuns(base, headers, conn.user_id, pending, 'upsert');
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
    const connsRes = await fetch(`${base}/rest/v1/polar_connections?select=*`, { headers });
    const conns = await connsRes.json();

    let synced = 0, errors = 0, backfilled = 0;
    for (const conn of (Array.isArray(conns) ? conns : [])) {
      try {
        const exsRes = await fetch('https://www.polaraccesslink.com/v3/exercises', {
          headers: { Authorization: `Bearer ${conn.access_token}` }
        });
        const exsData = await exsRes.json().catch(() => null);
        if (!exsRes.ok) {
          errors++;
          console.error('polar-sync (cron): exercises fetch failed', conn.user_id, exsRes.status, JSON.stringify(exsData).slice(0, 500));
          continue;
        }
        const exercises = (exsData && exsData.exercises) || [];
        const runExercises = exercises.filter(ex => String(ex.sport || '').toUpperCase().includes('RUN'));

        if (runExercises.length) {
          const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}&select=data`, { headers });
          const stateRows = await stateRes.json();
          if (stateRows && stateRows.length) {
            const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.polarId));
            // El cron sí busca el FIT de cada ejercicio nuevo (splits/series/potencia) --
            // a diferencia del botón "Sincronizar ahora" (polar-sync-now.js), acá no hay
            // apuro por responder rápido a un usuario esperando en pantalla.
            const newRuns = [];
            for (const ex of runExercises.filter(ex => !knownIds.has(ex.id))) {
              newRuns.push(await exerciseToRun(ex, conn.access_token));
            }
            if (newRuns.length) await mergePolarRuns(base, headers, conn.user_id, newRuns, 'skip');
          }
        }

        backfilled += await backfillPolarSplits(base, headers, conn);
        synced++;
      } catch (e) {
        errors++;
        console.error('polar-sync (cron): error syncing user', conn.user_id, e);
      }
    }

    res.status(200).json({ synced, errors, backfilled, total: Array.isArray(conns) ? conns.length : 0 });
  } catch (err) {
    console.error('polar-sync error', err);
    await reportError(err, { endpoint: 'polar-sync' });
    res.status(500).json({ error: err.message });
  }
});
