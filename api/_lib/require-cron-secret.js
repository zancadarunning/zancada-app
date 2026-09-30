// api/_lib/require-cron-secret.js
//
// Protege los endpoints que solo deberían poder disparar los crons de
// Vercel (o vos a mano para debug), nunca cualquiera en internet.
//
// El secreto se manda SIEMPRE por el header Authorization ("Bearer
// <CRON_SECRET>"), nunca por query string (por ejemplo ?secret=...): las
// URLs quedan mucho más fácil logueadas en texto plano — en los logs del
// hosting, en proxies intermedios, en el historial del navegador si alguna
// vez la visitás a mano — que los headers, que normalmente no se guardan
// así.
//
// Antes de este helper, sync-strava.js y send-reminders.js ya validaban el
// secreto por header (bien), pero strava-debug.js lo pedía por query string
// (mal) y strava-check-subscription.js y strava-setup-webhook.js no pedían
// ningún secreto — cualquiera que supiera la URL podía llamarlos.
//
// Uso típico:
//
//   const requireCronSecret = require('./_lib/require-cron-secret');
//   module.exports = async (req, res) => {
//     if (!(await requireCronSecret(req))) { res.status(401).json({ error: 'Unauthorized' }); return; }
//     ...
//   };
//
// Es async (antes no lo era) porque un rechazo acá es una señal fuerte de
// que alguien está probando estos endpoints sin conocer el secreto -- a
// diferencia de un token de usuario vencido (común, ruidoso, no vale una
// alerta), nadie legítimo llega a este chequeo sin el CRON_SECRET correcto.
// Se reporta a Sentry (ver reportSecurityEvent) además del console.error de
// siempre, para enterarnos sin tener que ir a revisar Vercel Logs a mano.
const { reportSecurityEvent } = require('./sentry');

module.exports = async function requireCronSecret(req) {
  const auth = req.headers['authorization'] || '';
  const secret = process.env.CRON_SECRET;
  const ok = Boolean(secret) && auth === `Bearer ${secret}`;
  if (!ok) {
    console.error('require-cron-secret: intento con secret ausente o incorrecto —', req.url);
    await reportSecurityEvent('Intento de acceso a endpoint protegido con CRON_SECRET incorrecto', { url: req.url, method: req.method }).catch(() => {});
  }
  return ok;
};
