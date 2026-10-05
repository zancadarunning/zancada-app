// api/suunto-disconnect.js
//
// Mismo rol que wahoo-disconnect.js: borra la fila de suunto_connections y purga las
// carreras importadas. Suunto no documenta (en lo público) un endpoint para revocar el
// permiso desde acá, así que no se intenta: el usuario puede quitarlo también desde su
// cuenta de Suunto si quiere.

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { purgeSuuntoRunsForUser } = require('./_lib/suunto-activity-helpers');

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

    const delRes = await fetch(`${base}/rest/v1/suunto_connections?user_id=eq.${userId}`, { method: 'DELETE', headers });
    if (!delRes.ok) {
      console.error('suunto-disconnect: failed to delete connection row', await delRes.text());
      res.status(500).json({ error: 'Could not disconnect Suunto' });
      return;
    }

    try {
      await purgeSuuntoRunsForUser(base, headers, userId);
    } catch (e) {
      console.error('suunto-disconnect: error purging synced runs', e);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('suunto-disconnect error', err);
    await reportError(err, { endpoint: 'suunto-disconnect' });
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});
