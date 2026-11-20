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
    // Escritura atómica y en orden (dos avisos casi simultáneos no se pisan):
    //   1) se actualiza la fila SOLO si el último aviso aplicado no es más nuevo que este (la condición la evalúa la base);
    //   2) si no había fila, se inserta (sin pisar una fila que apareció en el medio);
    //   3) si el insert no escribió nada, otro aviso creó la fila justo ahora: se reintenta el paso 1 una vez (si no, un aviso NUEVO se descartaría por error);
    //   4) si tampoco así, la fila tiene un aviso más nuevo y este se descarta.
    const uid = encodeURIComponent(row.user_id);
    const patchUrl = `${base}/rest/v1/entitlements?user_id=eq.${uid}&or=(last_event_ms.is.null,last_event_ms.lte.${encodeURIComponent(String(Math.floor(row.last_event_ms)))})`;
    const patchIfNewer = async () => {
      const r = await fetchWithTimeout(patchUrl, { method: 'PATCH', headers: Object.assign({}, headers, { Prefer: 'return=representation' }), body: JSON.stringify(row) }, 8000);
      if (!r.ok) { console.error('revenuecat-webhook: no se pudo guardar el plan (HTTP ' + r.status + ')'); return { fail: true }; }
      const out = await r.json();
      return { applied: Array.isArray(out) && out.length > 0 };
    };
    let w = await patchIfNewer();
    if (w.fail) { res.status(500).json({ error: 'Error interno' }); return; }
    if (w.applied) { res.status(200).json({ ok: true }); return; }
    const ins = await fetchWithTimeout(`${base}/rest/v1/entitlements?on_conflict=user_id`, {
      method: 'POST',
      headers: Object.assign({}, headers, { Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify(row)
    }, 8000);
    // 409 = la cuenta ya no existe (se borró): no hay a quién asignarle el plan y reintentar no sirve
    if (ins.status === 409) { res.status(200).json({ ok: true, ignored: true }); return; }
    if (!ins.ok) { console.error('revenuecat-webhook: no se pudo guardar el plan (HTTP ' + ins.status + ')'); res.status(500).json({ error: 'Error interno' }); return; }
    const inserted = await ins.json();
    if (Array.isArray(inserted) && inserted.length) { res.status(200).json({ ok: true }); return; }
    w = await patchIfNewer();
    if (w.fail) { res.status(500).json({ error: 'Error interno' }); return; }
    res.status(200).json(w.applied ? { ok: true } : { ok: true, stale: true });
  } catch (e) {
    await reportError(e, { where: 'revenuecat-webhook' }).catch(() => {});
    console.error('revenuecat-webhook: error al guardar el plan');
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = handler;
module.exports.secretMatches = secretMatches;
