// api/suunto-list-guides.js
//
// Le pregunta a Suunto qué guías SuuntoPlus de Zancada tiene la cuenta del usuario
// (GET /v2/guides/items). Sirve para confirmar que lo enviado con suunto-push-plan.js de
// verdad quedó guardado, sin depender de que la app de Suunto lo muestre (la app puede no
// mostrar guías si no hay un reloj compatible emparejado).

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { fetchWithTimeout } = require('./_lib/fetch-with-timeout');
const { SUUNTO_API_BASE, suuntoApiHeaders, ensureFreshSuuntoToken } = require('./_lib/suunto-activity-helpers');
const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connRes = await fetch(`${base}/rest/v1/suunto_connections?user_id=eq.${userId}&select=*`, { headers });
    const conns = await connRes.json();
    if (!conns || !conns.length) { res.status(200).json({ ok: false, reason: 'not_connected' }); return; }
    const accessToken = await ensureFreshSuuntoToken(base, headers, conns[0]);
    if (!accessToken) { res.status(200).json({ ok: false, reason: 'token_expired' }); return; }

    const r = await fetchWithTimeout(`${SUUNTO_API_BASE}/v2/guides/items`, { headers: suuntoApiHeaders(accessToken) }, 10000);
    if (!r.ok) { res.status(200).json({ ok: false, reason: 'suunto_error', status: r.status }); return; }
    const data = await r.json().catch(() => null);
    const items = (data && Array.isArray(data.payload)) ? data.payload : [];
    const guides = items
      .filter(g => g && g.owner === 'Zancada')
      .map(g => ({ name: g.name, localDate: g.localDate || null, externalId: g.externalId || null }))
      .sort((a, b) => String(a.localDate).localeCompare(String(b.localDate)));
    res.status(200).json({ ok: true, guides });
  } catch (err) {
    console.error('suunto-list-guides error', err);
    await reportError(err, { endpoint: 'suunto-list-guides' });
    res.status(500).json({ error: err.message });
  }
});
