const requireCronSecret = require('./_lib/require-cron-secret');
const { activityToRun, mergeStravaRuns, setStravaSyncStatus, fetchStreams } = require('./_lib/strava-activity-helpers');

const { withSentry, reportError } = require('./_lib/sentry');

// Cuántas carreras sin parciales reales se completan por cuenta en cada corrida del cron
// -- ver el comentario grande de backfillStravaSplits.
const BACKFILL_BATCH = 5;

// Completa splits/series/parciales de carreras YA guardadas que quedaron sin streams
// reales (splitsV !== 3) -- el caso típico es una carrera cargada por el botón
// "Sincronizar ahora" (strava-sync-now.js) o por la conexión inicial (strava-auth.js),
// que a propósito no piden los streams ahí para responder rápido. Antes esas carreras
// quedaban así para siempre: el resto de este cron solo procesa actividades NUEVAS, nunca
// vuelve a mirar una que ya esté guardada -- y api/strava-resync.js (el endpoint que sí
// las completaba) es un script de migración de una sola vez, no un cron que se repita.
// Mismo criterio que backfillPolarSplits/backfillWahooSplits en polar-sync.js/
// wahoo-sync.js, plegado acá adentro del cron normal en vez de otro cron más.
async function backfillStravaSplits(base, headers, conn, accessToken) {
  const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}&select=data`, { headers });
  const stateRows = await stateRes.json();
  if (!stateRows || !stateRows.length) return 0;
  const data = stateRows[0].data || {};
  const runs = data.runs || [];
  const pending = runs.filter(r => r.source === 'strava' && r.stravaId && r.splitsV !== 3).slice(0, BACKFILL_BATCH);
  if (!pending.length) return 0;

  for (const run of pending) {
    const streams = await fetchStreams(run.stravaId, accessToken);
    run.splits = streams.splits;
    run.series = streams.series;
    if (streams.elevationGain != null) run.elevationGain = streams.elevationGain;
    if (streams.elevationLoss != null) run.elevationLoss = streams.elevationLoss;
    // Se marca completo aunque streams haya venido vacío (mismo criterio que
    // backfillPolarSplits/backfillWahooSplits) -- si Strava de verdad no tiene streams
    // para esa actividad, reintentarlo cada 15min para siempre no cambiaría el resultado.
    run.splitsV = 3;
  }
  await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ data, updated_at: new Date().toISOString() })
  });
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
    const connsRes = await fetch(`${base}/rest/v1/strava_connections?select=*`, { headers });
    const conns = await connsRes.json();

    let synced = 0, errors = 0, backfilled = 0;
    for (const conn of (Array.isArray(conns) ? conns : [])) {
      try {
        let accessToken = conn.access_token;
        if (conn.expires_at < Math.floor(Date.now() / 1000)) {
          const refreshRes = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: conn.refresh_token })
          });
          const refreshed = await refreshRes.json();
          if (refreshed.access_token) {
            accessToken = refreshed.access_token;
            await fetch(`${base}/rest/v1/strava_connections?user_id=eq.${conn.user_id}`, {
              method: 'PATCH', headers,
              body: JSON.stringify({ access_token: refreshed.access_token, refresh_token: refreshed.refresh_token, expires_at: refreshed.expires_at })
            });
          }
        }

        const after = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
        const actsRes = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=30`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        // Mismo bug que ya se había arreglado en polar-sync-now.js/wahoo-sync-now.js (ver esos
        // comentarios): sin chequear actsRes.ok, un 401/429/lo que sea de Strava devuelve un
        // objeto de error en vez de un array, Array.isArray da false, runActs queda [] y el
        // código de más abajo lo trataba como "sincronización exitosa, sin carreras nuevas" --
        // marcando ok:true y ocultando para siempre que la sincronización real está rota.
        if (!actsRes.ok) {
          const body = await actsRes.text().catch(() => '');
          throw new Error(`strava activities fetch failed: ${actsRes.status} ${body.slice(0, 300)}`);
        }
        const acts = await actsRes.json();
        const runActs = Array.isArray(acts) ? acts.filter(a => ((a.sport_type || a.type || '').includes('Run'))) : [];

        if (runActs.length) {
          const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}&select=data`, { headers });
          const stateRows = await stateRes.json();
          if (stateRows && stateRows.length) {
            const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.stravaId));
            const newRuns = [];
            for (const act of runActs) {
              if (knownIds.has(act.id)) continue;
              newRuns.push(await activityToRun(act, accessToken));
            }
            await mergeStravaRuns(base, headers, conn.user_id, newRuns, 'skip');
          }
        }

        backfilled += await backfillStravaSplits(base, headers, conn, accessToken);
        synced++;
        await setStravaSyncStatus(base, headers, conn.user_id, { ok: true });
      } catch (e) {
        errors++;
        // Antes esto no se registraba en ningún lado -- setStravaSyncStatus guarda el
        // mensaje en app_state.data.stravaSync.lastError, pero esa misma función SQL lo
        // BORRA automáticamente en cuanto el próximo intento (cron o "Sincronizar ahora")
        // sale bien (ver set_strava_sync_status.sql: `v_sync := v_sync - 'lastError'`) --
        // así que un error que el usuario alcanzó a ver en el cartel y resolvió tocando
        // sincronizar quedaba, un minuto después, irrecuperable para siempre: nada lo
        // había mandado a los logs de Vercel ni a Sentry. polar-sync.js/wahoo-sync.js sí
        // hacían console.error acá -- este archivo se había quedado atrás.
        console.error('sync-strava (cron): error syncing user', conn.user_id, e);
        await setStravaSyncStatus(base, headers, conn.user_id, { ok: false, error: e.message });
      }
    }

    res.status(200).json({ synced, errors, backfilled, total: Array.isArray(conns) ? conns.length : 0 });
  } catch (err) {
    console.error('sync-strava error', err);
    await reportError(err, { endpoint: 'sync-strava' });
    res.status(500).json({ error: err.message });
  }
});
