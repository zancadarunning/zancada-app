const requireCronSecret = require('./_lib/require-cron-secret');

// Este endpoint tampoco tenía protección: cualquiera podía dispararlo y
// pedirle a Strava que (re)cree la suscripción al webhook a tu nombre. El
// callback_url y el verify_token salen siempre de tus variables de entorno
// (no del caller), así que no había forma de redirigir el webhook a otro
// lado, pero sí de generar llamadas de más contra la API de Strava sin que
// vos te enteraras. Ahora requiere el mismo secreto que el resto de los
// endpoints de administración.
const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  if (!requireCronSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const response = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        callback_url: `${process.env.SITE_URL}/api/strava-webhook`,
        verify_token: process.env.STRAVA_VERIFY_TOKEN
      })
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('strava-setup-webhook error', err);
    await reportError(err, { endpoint: 'strava-setup-webhook' });
    res.status(500).json({ error: err.message });
  }
});
