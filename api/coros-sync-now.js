// api/coros-sync-now.js
//
// Mismo rol que strava-sync-now.js/polar-sync-now.js/wahoo-sync-now.js: traer
// actividades nuevas "a pedido" (lo llama syncTodayNow() en app.js). Los
// tokens de COROS vencen, así que renovamos con refreshCorosToken() si hace
// falta, igual que Wahoo.

const verifyUser = require('./_lib/verify-user');
const { activityToRun, mergeCorosRuns, refreshCorosToken, callCorosMcpTool, corosDateRangeArgs, getCorosRunRecords, getCorosRecordId } = require('./_lib/coros-activity-helpers');
const { applyCors, isPreflight } = require('./_lib/cors');

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  const auth = await verifyUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const userId = auth.userId;

  const base = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

  try {
    const connRes = await fetch(`${base}/rest/v1/coros_connections?user_id=eq.${userId}&select=*`, { headers });
    const conns = await connRes.json();
    if (!conns || !conns.length) {
      return res.status(200).json({ synced: false, reason: 'not_connected' });
    }
    let conn = conns[0];

    if (conn.expires_at < Math.floor(Date.now() / 1000)) {
      const refreshed = await refreshCorosToken(base, headers, userId, conn.refresh_token);
      if (!refreshed) {
        return res.status(200).json({ synced: false, reason: 'token_expired' });
      }
      conn.access_token = refreshed.accessToken;
    }

    const records = await callCorosMcpTool(conn.access_token, 'querySportRecords', corosDateRangeArgs(30));
    // querySportRecords devuelve un reporte de texto (no JSON) cuando hay actividades --
    // confirmado en producción, ver el comentario grande junto a parseCorosSportRecordsText
    // en coros-activity-helpers.js. getCorosRunRecords ya sabe parsearlo y filtrar running.
    const runRecords = getCorosRunRecords(records);
    if (!runRecords.length) {
      return res.status(200).json({ synced: false, reason: 'no_new_activity' });
    }

    const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers });
    const stateRows = await stateRes.json();
    if (!stateRows || !stateRows.length) {
      return res.status(200).json({ synced: false });
    }
    const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.corosId));
    const newRecords = runRecords.filter(r => !knownIds.has(getCorosRecordId(r)));

    // El reporte de querySportRecords ya trae todo lo necesario (distancia, duración, FC
    // promedio, calorías) -- no hace falta getActivityDetail para armar un run decente.
    const newRuns = newRecords.map(record => activityToRun(record));

    if (newRuns.length) {
      await mergeCorosRuns(base, headers, userId, newRuns, 'skip');
    }

    res.status(200).json({ synced: newRuns.length > 0 });
  } catch (err) {
    console.error('coros-sync-now error', err);
    await reportError(err, { endpoint: 'coros-sync-now' });
    res.status(500).json({ error: err.message });
  }
});
