// api/coros-sync.js
//
// Mismo rol que sync-strava.js pero para COROS: lo dispara el cron de Vercel (no un
// usuario) y recorre TODAS las cuentas conectadas, no solo la de quien esté con la app
// abierta. Hasta ahora COROS solo se sincronizaba con el botón "Sincronizar" manual de
// coros-sync-now.js -- a diferencia de Strava, que además de eso ya se sincroniza solo
// cada 15'. Reportado como bug ("aparece conectado pero no aparecen las carreras") por un
// usuario que nunca tocó ese botón -- no hay forma de que alguien nuevo sepa que existe.

const requireCronSecret = require('./_lib/require-cron-secret');
const { activityToRun, mergeCorosRuns, refreshCorosToken, callCorosMcpTool, corosDateRangeArgs, getCorosRunRecords, getCorosRecordId } = require('./_lib/coros-activity-helpers');
const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  if (!requireCronSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connsRes = await fetch(`${base}/rest/v1/coros_connections?select=*`, { headers });
    const conns = await connsRes.json();

    let synced = 0, errors = 0;
    for (const conn of (Array.isArray(conns) ? conns : [])) {
      try {
        let accessToken = conn.access_token;
        if (conn.expires_at < Math.floor(Date.now() / 1000)) {
          const refreshed = await refreshCorosToken(base, headers, conn.user_id, conn.refresh_token);
          if (!refreshed) { errors++; continue; }
          accessToken = refreshed.accessToken;
        }

        const records = await callCorosMcpTool(accessToken, 'querySportRecords', corosDateRangeArgs(30));
        // querySportRecords devuelve un reporte de texto (no JSON) cuando hay actividades --
        // confirmado en producción, ver parseCorosSportRecordsText en coros-activity-helpers.js.
        const runRecords = getCorosRunRecords(records);

        if (runRecords.length) {
          const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}&select=data`, { headers });
          const stateRows = await stateRes.json();
          if (stateRows && stateRows.length) {
            const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.corosId));
            const newRuns = runRecords.filter(r => !knownIds.has(getCorosRecordId(r))).map(record => activityToRun(record));
            if (newRuns.length) await mergeCorosRuns(base, headers, conn.user_id, newRuns, 'skip');
          }
        }

        synced++;
      } catch (e) {
        errors++;
        console.error('coros-sync (cron): error syncing user', conn.user_id, e);
      }
    }

    res.status(200).json({ synced, errors, total: Array.isArray(conns) ? conns.length : 0 });
  } catch (err) {
    console.error('coros-sync error', err);
    await reportError(err, { endpoint: 'coros-sync' });
    res.status(500).json({ error: err.message });
  }
});
