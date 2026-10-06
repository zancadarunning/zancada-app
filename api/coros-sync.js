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
const { withSentry, reportError, reportDiagnostic } = require('./_lib/sentry');
const { checkSyncCooldown } = require('./_lib/sync-cooldown');
const { probeCorosDetailShapes, enrichCorosRecord } = require('./_lib/coros-activity-helpers');

module.exports = withSentry(async (req, res) => {
  if (!(await requireCronSecret(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connsRes = await fetch(`${base}/rest/v1/coros_connections?select=*`, { headers });
    const conns = await connsRes.json();

    // Auditoría de costos: mismo tope que sync-strava.js/polar-sync.js/wahoo-sync.js.
    const CRON_TIME_BUDGET_MS = 8000;
    const cronStart = Date.now();
    let synced = 0, errors = 0, skipped = 0;
    let probedThisRun = false;
    const connsList = Array.isArray(conns) ? conns : [];
    for (const conn of connsList) {
      if (Date.now() - cronStart > CRON_TIME_BUDGET_MS) {
        skipped = connsList.length - synced - errors;
        console.error(`coros-sync (cron): tope de tiempo alcanzado, ${skipped} cuentas quedan para la próxima corrida`);
        break;
      }
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

        // TEMPORAL: una vez por semana y por cuenta, se registra en Sentry la ESTRUCTURA (sin valores) que devuelven las tools de
        // detalle de COROS, para poder traer parciales, mapa, desnivel y cadencia como en las otras marcas.
        if (runRecords.length && !probedThisRun) {
          probedThisRun = true;
          if (await checkSyncCooldown(base, headers, conn.user_id, 'coros-probe-6', 7 * 86400000)) {
            const labelId = getCorosRecordId(runRecords[0]);
            const shapes = await probeCorosDetailShapes(accessToken, labelId, runRecords[0].sportType, runRecords[0]).catch(e => ({ error: String(e && e.message).slice(0, 200) }));
            await reportDiagnostic('diag coros-detail-shapes', shapes).catch(() => {});
          }
        }

        if (runRecords.length) {
          const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}&select=data`, { headers });
          const stateRows = await stateRes.json();
          if (stateRows && stateRows.length) {
            const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.corosId));
            const newRecs = runRecords.filter(r => !knownIds.has(getCorosRecordId(r)));
            for (const rec of newRecs.slice(0, 3)) await enrichCorosRecord(accessToken, rec);
            const newRuns = newRecs.map(record => activityToRun(record));
            if (newRuns.length) await mergeCorosRuns(base, headers, conn.user_id, newRuns, 'skip');
          }
        }

        synced++;
      } catch (e) {
        errors++;
        console.error('coros-sync (cron): error syncing user', conn.user_id, e);
      }
    }

    res.status(200).json({ synced, errors, skipped, total: connsList.length });
  } catch (err) {
    console.error('coros-sync error', err);
    await reportError(err, { endpoint: 'coros-sync' });
    res.status(500).json({ error: err.message });
  }
});
