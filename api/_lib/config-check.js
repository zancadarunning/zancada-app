// api/_lib/config-check.js
//
// Revisa que estén cargadas en Vercel las variables de las que depende la SEGURIDAD. Sin esto, si una se borra o se edita mal (por ejemplo al rotar
// CRON_SECRET o TOKEN_ENCRYPTION_KEY), no se rompe nada a la vista: los tokens de relojes se guardarían SIN cifrar o los crons dejarían de correr,
// y solo quedaría un mensaje en un log que nadie mira. Lo llama el cron de recordatorios (corre cada 30 minutos): si falta algo, manda un aviso a
// Sentry (que ya te llega por mail como "avisos de seguridad"), como mucho uno cada 12 horas por instancia. Solo se informan los NOMBRES, nunca valores.

const { keyIsValid } = require('./token-crypto');

// Solo las que seguro están cargadas en producción (si se agrega una que todavía no existe, saltaría una alarma falsa).
const ESSENTIAL = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'CRON_SECRET', 'STRAVA_STATE_SECRET', 'STRAVA_WEBHOOK_SECRET'];
const ALERT_EVERY_MS = 12 * 60 * 60 * 1000;

function missingConfig(env) {
  const e = env || process.env;
  const out = ESSENTIAL.filter(n => !String(e[n] || '').trim());
  if (!keyIsValid()) out.push('TOKEN_ENCRYPTION_KEY');   // falta o no son 32 bytes en base64
  return out;
}

let lastAlertAt = 0;
async function alertIfMisconfigured(report, now) {
  const missing = missingConfig();
  if (!missing.length) return missing;
  const t = now === undefined ? Date.now() : now;
  if (t - lastAlertAt < ALERT_EVERY_MS) return missing;
  lastAlertAt = t;
  console.error('config-check: faltan o están mal estas variables en Vercel:', missing.join(', '));
  await Promise.resolve(report('Configuración de seguridad incompleta en Vercel: ' + missing.join(', '), { missing })).catch(() => {});
  return missing;
}
function resetAlertThrottle() { lastAlertAt = 0; }

module.exports = { missingConfig, alertIfMisconfigured, resetAlertThrottle, ESSENTIAL };
