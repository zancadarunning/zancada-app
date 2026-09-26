const requireCronSecret = require('./_lib/require-cron-secret');
const { decodePolyline, fetchStreams, mergeStravaRuns } = require('./_lib/strava-activity-helpers');

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  // Antes este secreto se mandaba por query string (?secret=...), lo que lo
  // deja mucho más expuesto a quedar guardado en logs del hosting o de
  // proxies intermedios que un header. Ahora, como el resto de los
  // endpoints de cron, va por el header Authorization.
  if (!requireCronSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connsRes = await fetch(`${base}/rest/v1/strava_connections?select=*`, { headers });
    const conns = await connsRes.json();

    let usersUpdated = 0, runsUpdated = 0, errors = 0;
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

        const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}&select=data`, { headers });
        const stateRows = await stateRes.json();
        if (!stateRows || !stateRows.length) continue;
        const data = stateRows[0].data || {};
        data.runs = data.runs || [];

        const changedRuns = [];
        for (const run of data.runs) {
          if (run.source !== 'strava' || !run.stravaId) continue;
          const hasBasics = run.elevationGain !== undefined && run.calories !== undefined;
          const hasCurrentSplits = run.splitsV === 3;
          if (hasBasics && hasCurrentSplits) continue; // ya tiene todo, con la versión más nueva de parciales

          if (!hasBasics) {
            const actRes = await fetch(`https://www.strava.com/api/v3/activities/${run.stravaId}`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            const act = await actRes.json();
            if (!act || act.errors) continue;

            run.name = act.name || null;
            run.elevationGain = act.total_elevation_gain || 0;
            run.avgHr = act.average_heartrate ? Math.round(act.average_heartrate) : (run.avgHr || null);
            run.maxHr = act.max_heartrate ? Math.round(act.max_heartrate) : null;
            // *2: Strava reporta la cadencia de running como pasos de UNA sola pierna por
          // minuto, no el total -- mismo criterio que activityToRun() en
          // strava-activity-helpers.js (línea ~198). Sin el *2 acá, una carrera vieja
          // rellenada por este cron de backfill quedaba con la mitad de la cadencia real,
          // mientras que la misma carrera sincronizada de cero mostraba el valor correcto.
          run.avgCadence = act.average_cadence ? Math.round(act.average_cadence * 2) : null;
            run.calories = act.calories ? Math.round(act.calories) : null;
            if (act.map && act.map.summary_polyline && (!run.points || !run.points.length)) {
              run.points = decodePolyline(act.map.summary_polyline);
            }
          }
          if (!hasCurrentSplits) {
            const streams = await fetchStreams(run.stravaId, accessToken);
            run.splits = streams.splits;
            run.series = streams.series;
            if (streams.elevationGain != null) run.elevationGain = streams.elevationGain;
            if (streams.elevationLoss != null) run.elevationLoss = streams.elevationLoss;
            run.splitsV = 3;
          }
          changedRuns.push(run);
          runsUpdated++;
        }

        if (changedRuns.length) {
          // mergeStravaRuns en modo 'upsert' hace el reemplazo adentro de una transacción
          // con la fila bloqueada (ver merge_strava_runs.sql), preservando el shoeId que el
          // usuario haya asignado a mano -- reemplaza al viejo PATCH directo de acá, que
          // mandaba de vuelta TODO app_state.data tal como se había leído al principio de
          // esta corrida, potencialmente varias carreras (con sus streams) atrás: si el
          // usuario guardaba algo (chat, plan, perfil) en el medio, ese guardado se perdía.
          await mergeStravaRuns(base, headers, conn.user_id, changedRuns, 'upsert');
          usersUpdated++;
        }
      } catch (e) {
        errors++;
      }
    }

    res.status(200).json({ usersUpdated, runsUpdated, errors, totalConnections: Array.isArray(conns) ? conns.length : 0 });
  } catch (err) {
    console.error('strava-resync error', err);
    await reportError(err, { endpoint: 'strava-resync' });
    res.status(500).json({ error: err.message });
  }
});
