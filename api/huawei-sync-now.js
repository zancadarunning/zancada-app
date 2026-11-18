// api/huawei-sync-now.js
//
// Mismo rol que wahoo-sync-now.js: traer las carreras nuevas "a pedido" (lo llama syncTodayNow() en app.js).
// El access_token de Huawei dura 1 hora: se renueva con el refresh_token si venció (ver refreshHuaweiToken()).

const { decToken } = require('./_lib/token-crypto');
const verifyUser = require('./_lib/verify-user');
const { recordToRun, isImportableRecord, fetchRunRecords, mergeHuaweiRuns, refreshHuaweiToken } = require('./_lib/huawei-activity-helpers');
const { applyCors, isPreflight } = require('./_lib/cors');
const { checkSyncCooldown } = require('./_lib/sync-cooldown');

const { withSentry, reportError } = require('./_lib/sentry');
const { safeConvert } = require('./_lib/safe-convert');
const { knownRunIds } = require('./_lib/known-run-ids');

const SYNC_COOLDOWN_MS = 20000;
const WINDOW_MS = 14 * 24 * 3600 * 1000;   // las carreras de las últimas 2 semanas alcanzan para "sincronizar ahora"

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  const auth = await verifyUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const userId = auth.userId;

  const base = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

  const allowed = await checkSyncCooldown(base, headers, userId, 'huawei', SYNC_COOLDOWN_MS);
  if (!allowed) return res.status(200).json({ synced: false, reason: 'cooldown' });

  try {
    const connRes = await fetch(`${base}/rest/v1/huawei_connections?user_id=eq.${userId}&select=*`, { headers });
    const conns = await connRes.json();
    if (!conns || !conns.length) {
      return res.status(200).json({ synced: false, reason: 'not_connected' });
    }
    const conn = conns[0];
    let accessToken = decToken(conn.access_token);

    if (conn.expires_at < Math.floor(Date.now() / 1000) + 60) {
      const refreshed = await refreshHuaweiToken(base, headers, userId, decToken(conn.refresh_token));
      if (!refreshed) {
        return res.status(200).json({ synced: false, reason: 'token_expired' });
      }
      accessToken = refreshed.accessToken;
    }

    const found = await fetchRunRecords(accessToken, Date.now() - WINDOW_MS, Date.now());
    if (!found.ok) {
      console.error('huawei-sync-now: records fetch failed', found.status);
      return res.status(200).json({ synced: false, reason: found.status === 401 ? 'token_expired' : 'no_new_activity' });
    }
    if (found.privacy === 2) return res.status(200).json({ synced: false, reason: 'not_authorized_in_health_app' });   // la persona no aceptó el permiso en la app Huawei Health
    const runRecords = (found.records || []).filter(isImportableRecord);
    if (!runRecords.length) {
      return res.status(200).json({ synced: false, reason: 'no_new_activity' });
    }

    const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers });
    const stateRows = await stateRes.json();
    if (!stateRows || !stateRows.length) {
      return res.status(200).json({ synced: false });
    }
    const knownIds = knownRunIds(stateRows[0].data, 'huaweiId', 'huawei');
    const newRuns = [];
    for (const r of runRecords.filter(r => !knownIds.has(String(r.id)))) {
      const run = await safeConvert(() => recordToRun(r), 'huawei'); if (run) newRuns.push(run);
    }
    if (newRuns.length) {
      await mergeHuaweiRuns(base, headers, userId, newRuns, 'skip');
    }

    res.status(200).json({ synced: newRuns.length > 0 });
  } catch (err) {
    console.error('huawei-sync-now error', err);
    await reportError(err, { endpoint: 'huawei-sync-now' });
    res.status(500).json({ error: 'Internal error' });
  }
});
