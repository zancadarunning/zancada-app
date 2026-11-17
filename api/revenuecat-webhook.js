// api/revenuecat-webhook.js
//
// Recibe los avisos de RevenueCat (alta, renovación, cancelación, vencimiento, reembolso...) y deja el plan de la cuenta en la tabla `entitlements`
// (sql/entitlements.sql). Es lo ÚNICO que escribe ahí: la app nunca decide sola si alguien pagó.
//
// Autenticación: RevenueCat manda el valor que se cargue en su panel (Project settings > Integrations > Webhooks > "Authorization header value") en el header
// Authorization. Tiene que ser exactamente "Bearer <REVENUECAT_WEBHOOK_SECRET>"; se compara en tiempo constante. Sin secreto configurado, todo se rechaza.
//
// Respuestas: 200 cuando se procesó o se ignoró a propósito (RevenueCat no reintenta); 500 si falla la base (RevenueCat reintenta). Nunca se devuelve el detalle de un error.
// Privacidad: los logs no llevan ids de cuenta ni correos, solo el tipo de aviso.
// Orden: los avisos pueden llegar desordenados; un aviso más viejo (event_timestamp_ms) que el último ya aplicado no pisa nada.
const crypto = require('crypto');
const { entitlementFromEvent } = require('./_lib/revenuecat-event');
const { fetchWithTimeout } = require('./_lib/fetch-with-timeout');
const { withSentry, reportError, reportSecurityEvent } = require('./_lib/sentry');

function secretMatches(auth, secret) {
  const a = Buffer.from(String(auth || '')), b = Buffer.from('Bearer ' + secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const handler = withSentry(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret || !secretMatches(req.headers['authorization'], secret)) {
    await reportSecurityEvent('Webhook de RevenueCat con secreto ausente o incorrecto', { method: req.method }).catch(() => {});
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : null;
  const decision = entitlementFromEvent(body && body.event, { allowSandbox: process.env.REVENUECAT_ALLOW_SANDBOX === '1' });
  if (decision.action === 'ignore') { res.status(200).json({ ok: true, ignored: true }); return; }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const row = decision.row;
  try {
    // no pisar un aviso nuevo con uno viejo
    const cur = await fetchWithTimeout(`${base}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(row.user_id)}&select=last_event_ms&limit=1`, { headers }, 6000);
    if (cur.ok) {
      const rows = await cur.json();
      const last = Array.isArray(rows) && rows[0] ? Number(rows[0].last_event_ms) : NaN;
      if (Number.isFinite(last) && last > row.last_event_ms) { res.status(200).json({ ok: true, stale: true }); return; }
    }
    const up = await fetchWithTimeout(`${base}/rest/v1/entitlements?on_conflict=user_id`, {
      method: 'POST',
      headers: Object.assign({}, headers, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(row)
    }, 8000);
    // 409 = la cuenta ya no existe (se borró): no hay a quién asignarle el plan y reintentar no sirve
    if (up.status === 409) { res.status(200).json({ ok: true, ignored: true }); return; }
    if (!up.ok) { console.error('revenuecat-webhook: no se pudo guardar el plan (HTTP ' + up.status + ')'); res.status(500).json({ error: 'Error interno' }); return; }
    res.status(200).json({ ok: true });
  } catch (e) {
    await reportError(e, { where: 'revenuecat-webhook' }).catch(() => {});
    console.error('revenuecat-webhook: error al guardar el plan');
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = handler;
module.exports.secretMatches = secretMatches;
