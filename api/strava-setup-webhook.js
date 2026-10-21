const requireCronSecret = require('./_lib/require-cron-secret');

// Este endpoint tampoco tenía protección: cualquiera podía dispararlo y
// pedirle a Strava que (re)cree la suscripción al webhook a tu nombre. El
// callback_url y el verify_token salen siempre de tus variables de entorno
// (no del caller), así que no había forma de redirigir el webhook a otro
// lado, pero sí de generar llamadas de más contra la API de Strava sin que
// vos te enteraras. Ahora requiere el mismo secreto que el resto de los
// endpoints de administración.
const { withSentry, reportError } = require('./_lib/sentry');

// Strava comprueba la dirección con un GET antes de aceptarla y NO sigue redirecciones. zancada.org (sin www) redirige a www.zancada.org, así que la
// dirección tiene que ser directamente la final. (SITE_URL puede seguir apuntando al dominio sin www para el resto de la app.)
const WEBHOOK_BASE = process.env.STRAVA_WEBHOOK_BASE_URL || 'https://www.zancada.org';
// El valor pegado en Vercel puede traer un espacio o un salto de línea al final; Strava no lo respeta en la dirección: se recorta.
const WEBHOOK_SECRET = String(process.env.STRAVA_WEBHOOK_SECRET || '').trim();

module.exports = withSentry(async (req, res) => {
  if (!(await requireCronSecret(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const response = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
      method: 'POST',
      // Formulario clásico (application/x-www-form-urlencoded), como documenta Strava: con JSON, Strava no le pasaba el verify_token a la verificación.
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: String(process.env.STRAVA_CLIENT_ID || ''),
        client_secret: String(process.env.STRAVA_CLIENT_SECRET || ''),
        callback_url: `${WEBHOOK_BASE}/api/strava-webhook${WEBHOOK_SECRET ? '?k=' + encodeURIComponent(WEBHOOK_SECRET) : ''}`,
        verify_token: String(process.env.STRAVA_VERIFY_TOKEN || '')
      }).toString()
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('strava-setup-webhook error', err);
    await reportError(err, { endpoint: 'strava-setup-webhook' });
    res.status(500).json({ error: 'Internal error' });
  }
});
