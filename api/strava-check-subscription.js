const requireCronSecret = require('./_lib/require-cron-secret');

// Este endpoint no tenía NINGUNA protección: cualquiera en internet que
// conociera esta URL podía llamarlo. No exponía tu client_secret de Strava
// en la respuesta, pero sí dejaba que cualquiera consultara el estado de tu
// suscripción al webhook a voluntad. Ahora requiere el mismo secreto que el
// resto de los endpoints de administración (por header Authorization).
const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  if (!requireCronSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const url = `https://www.strava.com/api/v3/push_subscriptions?client_id=${process.env.STRAVA_CLIENT_ID}&client_secret=${process.env.STRAVA_CLIENT_SECRET}`;
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('strava-check-subscription error', err);
    await reportError(err, { endpoint: 'strava-check-subscription' });
    res.status(500).json({ error: err.message });
  }
});
