// api/wahoo-sync.js
//
// Mismo rol que sync-strava.js/coros-sync.js pero para Wahoo: lo dispara el cron de Vercel
// y recorre TODAS las cuentas conectadas, no solo la de quien tenga la app abierta. Hasta
// ahora Wahoo solo se sincronizaba con el botón "Sincronizar" manual de wahoo-sync-now.js.

const requireCronSecret = require('./_lib/require-cron-secret');
const { workoutToRun, mergeWahooRuns, isRunningWorkoutType, refreshWahooToken, fetchFitSplits } = require('./_lib/wahoo-activity-helpers');
const { fetchWithTimeout } = require('./_lib/fetch-with-timeout');
const { withSentry, reportError } = require('./_lib/sentry');

// Cuántas carreras sin splits reales se completan por cuenta en cada corrida del cron --
// ver el comentario grande de backfillWahooSplits.
const BACKFILL_BATCH = 5;

// GET /v1/workouts de Wahoo no tiene ningún filtro por fecha (a diferencia de Strava,
// que sí soporta ?after=<timestamp> -- ver sync-strava.js) -- antes este cron pedía
// SIEMPRE page=1&per_page=10 nada más, sin importar cuántos workouts nuevos hubiera de
// verdad. Eso alcanza mientras el cron corra sin interrupciones (cada 15', casi nunca
// se acumulan más de 10 workouts nuevos entre corridas), pero si el token quedó sin
// refrescar un rato largo, o el usuario reconecta después de un tiempo desconectado,
// cualquier workout más viejo que los 10 más recientes quedaba fuera de esa única
// página para SIEMPRE -- el resto de este archivo solo mira "nuevo o no" contra la
// página que llegó, nunca reintenta una página más vieja.
//
// PER_PAGE/MAX_PAGES de acá abajo recorren hasta 5 páginas de 30 (150 workouts) y
// cortan antes si una página viene incompleta (wahoo ya no tiene más para dar). Es una
// cota, no una garantía absoluta para una cuenta con cientos de workouts de otro
// deporte entre medio -- pero cubre el caso real (reconexión después de días u horas
// desconectado) sin arriesgar un cron sin límite de páginas.
const WORKOUTS_PER_PAGE = 30;
const WORKOUTS_MAX_PAGES = 5;

async function fetchRecentWahooWorkouts(accessToken) {
  const all = [];
  for (let page = 1; page <= WORKOUTS_MAX_PAGES; page++) {
    const wRes = await fetchWithTimeout(`https://api.wahooligan.com/v1/workouts?page=${page}&per_page=${WORKOUTS_PER_PAGE}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!wRes.ok) {
      if (page === 1) throw new Error(`workouts fetch failed: ${wRes.status} ${await wRes.text().catch(() => '')}`);
      break; // ya trajimos al menos una página -- una falla en una página siguiente no debería tirar lo ya conseguido
    }
    const wData = await wRes.json();
    const workouts = (wData && wData.workouts) || [];
    all.push(...workouts);
    if (workouts.length < WORKOUTS_PER_PAGE) break; // última página (Wahoo no tenía más para dar)
  }
  return all;
}

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
  // Pendientes: sin parciales todavía (splitsV !== 3), o sin ruta GPS / pulso máximo (salvo que ya se sepa que no tiene GPS: noGps).
  const pending = runs.filter(r => r.source === 'wahoo' && r.wahooId && (r.splitsV !== 3 || (!(r.points && r.points.length > 1) && !r.noGps))).slice(0, BACKFILL_BATCH);
  if (!pending.length) return 0;

  const updated = [];
  for (const run of pending) {
    try {
      const wRes = await fetchWithTimeout(`https://api.wahooligan.com/v1/workouts/${run.wahooId}`, {
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
      if (fit.maxHr != null && run.maxHr == null) run.maxHr = fit.maxHr;
      if (fit.avgHr != null && run.avgHr == null) run.avgHr = fit.avgHr;
      if (fit.points && fit.points.length > 1) run.points = fit.points; else run.noGps = true;
      run.splitsV = 3;
      updated.push(run);
    } catch (e) {
      console.error('wahoo-sync (cron): backfill error for run', run.wahooId, e && e.message);
    }
  }
  // mergeWahooRuns en modo 'upsert' hace el reemplazo adentro de una transacción con la
  // fila bloqueada (ver merge_wahoo_runs.sql), preservando el shoeId que el usuario haya
  // asignado a mano -- reemplaza al viejo PATCH directo de acá, que mandaba de vuelta TODO
  // app_state.data tal como se había leído al principio de esta función, minutos antes:
  // si el usuario guardaba algo (chat, plan, perfil) en el medio, ese guardado se perdía.
  // Solo se mandan los runs que de verdad se actualizaron (updated), no todo pending --
  // los que fallaron el fetch del detalle (wRes no ok) no tienen por qué reescribirse.
  await mergeWahooRuns(base, headers, conn.user_id, updated, 'upsert');
  return pending.length;
}

module.exports = withSentry(async (req, res) => {
  if (!(await requireCronSecret(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connsRes = await fetch(`${base}/rest/v1/wahoo_connections?select=*`, { headers });
    const conns = await connsRes.json();

    // Auditoría de costos: mismo tope que sync-strava.js/polar-sync.js.
    const CRON_TIME_BUDGET_MS = 8000;
    const cronStart = Date.now();
    let synced = 0, errors = 0, backfilled = 0, skipped = 0;
    const connsList = Array.isArray(conns) ? conns : [];
    for (const conn of connsList) {
      if (Date.now() - cronStart > CRON_TIME_BUDGET_MS) {
        skipped = connsList.length - synced - errors;
        console.error(`wahoo-sync (cron): tope de tiempo alcanzado, ${skipped} cuentas quedan para la próxima corrida`);
        break;
      }
      try {
        let accessToken = conn.access_token;
        if (conn.expires_at < Math.floor(Date.now() / 1000)) {
          const refreshed = await refreshWahooToken(base, headers, conn.user_id, conn.refresh_token);
          if (!refreshed) { errors++; continue; }
          accessToken = refreshed.accessToken;
        }

        let workouts;
        try {
          workouts = await fetchRecentWahooWorkouts(accessToken);
        } catch (fetchErr) {
          errors++;
          console.error('wahoo-sync (cron): workouts fetch failed', conn.user_id, fetchErr && fetchErr.message);
          continue;
        }
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

    res.status(200).json({ synced, errors, backfilled, skipped, total: connsList.length });
  } catch (err) {
    console.error('wahoo-sync error', err);
    await reportError(err, { endpoint: 'wahoo-sync' });
    res.status(500).json({ error: err.message });
  }
});
