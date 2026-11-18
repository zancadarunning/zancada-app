// api/huawei-disconnect.js
//
// Mismo rol que wahoo-disconnect.js: revoca el permiso del lado de Huawei (DELETE /healthkit/v2/consents/{appId}),
// borra la fila de huawei_connections y purga las carreras importadas.

const { decToken } = require('./_lib/token-crypto');
const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { purgeHuaweiRunsForUser, cancelHuaweiConsent } = require('./_lib/huawei-activity-helpers');

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

    try {
      const connRes = await fetch(`${base}/rest/v1/huawei_connections?user_id=eq.${userId}&select=access_token`, { headers });
      const connRows = await connRes.json();
      const accessToken = connRows && connRows[0] && decToken(connRows[0].access_token);
      if (accessToken) await cancelHuaweiConsent(accessToken);   // si el token ya venció la revocación falla en silencio: igual se borra todo de nuestro lado
    } catch (e) {
      console.error('huawei-disconnect: revoke failed', e);
    }

    const delRes = await fetch(`${base}/rest/v1/huawei_connections?user_id=eq.${userId}`, { method: 'DELETE', headers });
    if (!delRes.ok) {
      console.error('huawei-disconnect: failed to delete connection row', await delRes.text());
      res.status(500).json({ error: 'Could not disconnect Huawei' });
      return;
    }

    try {
      await purgeHuaweiRunsForUser(base, headers, userId);
    } catch (e) {
      console.error('huawei-disconnect: error purging synced runs', e);
      await reportError(e, { endpoint: 'huawei-disconnect', step: 'purge' }).catch(() => {});
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('huawei-disconnect error', err);
    await reportError(err, { endpoint: 'huawei-disconnect' });
    res.status(500).json({ error: 'Internal error' });
  }
});
