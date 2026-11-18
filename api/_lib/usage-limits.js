// api/_lib/usage-limits.js
//
// Límites de uso a vigilar (los muestra el panel de administración, api/admin-stats.js, y los usa el aviso diario por correo,
// api/usage-alert.js). Los valores por defecto son los del plan GRATIS de cada servicio y del cupo que tiene hoy la app en Strava; se
// ajustan con variables de entorno cuando se cambia de plan (ver docs/limites-y-costos.md, que lista cada servicio con su fuente):
//   STRAVA_ATHLETE_LIMIT (10), SUPABASE_DB_LIMIT_MB (500), SUPABASE_MAU_LIMIT (50000), CHAT_DAILY_LIMIT (60, el mismo de chat.js),
//   CHAT_GLOBAL_DAILY_LIMIT (2000), RESEND_DAILY_LIMIT (100), SUPABASE_AUTH_EMAILS_HOUR (30)
//
// Lo que NO se puede medir desde adentro (hay que mirarlo en el panel de cada servicio, con sus propias alertas): el tráfico de salida
// de Supabase, el uso de Vercel, el gasto de Anthropic, las cargas de Mapbox y los errores de Sentry.

const MB = 1024 * 1024;
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : d; };

function buildLimits(s) {
  const u = s.users || {}, w = s.watches || {}, db = s.db || {}, chat = s.chat || {};
  const chatLimit = num(process.env.CHAT_DAILY_LIMIT, 60);
  return [
    { key: 'strava', used: w.strava || 0, limit: num(process.env.STRAVA_ATHLETE_LIMIT, 10), unit: 'atletas' },
    { key: 'db', used: Math.round((db.size_bytes || 0) / MB), limit: num(process.env.SUPABASE_DB_LIMIT_MB, 500), unit: 'MB' },
    { key: 'mau', used: u.signed_in_30d || 0, limit: num(process.env.SUPABASE_MAU_LIMIT, 50000), unit: 'personas' },
    { key: 'chat', used: chat.max_user_today || 0, limit: chatLimit, unit: 'mensajes' },
    { key: 'chat_global', used: chat.global_today || 0, limit: num(process.env.CHAT_GLOBAL_DAILY_LIMIT, 2000), unit: 'mensajes' },
    // aproximación: cada alta manda un correo de confirmación por Resend (tope diario del plan gratis)
    { key: 'signups_day', used: Math.ceil((u.new_7d || 0) / 7), limit: num(process.env.RESEND_DAILY_LIMIT, 100), unit: 'altas por día (promedio)' }
  ].map(l => Object.assign(l, { pct: Math.round((l.used / l.limit) * 100) }));
}

// Nivel de alerta de un límite: 0 = bien, 70 = "se acerca", 90 = "urgente", 100 = "llegó".
function alertLevel(pct) {
  if (!Number.isFinite(pct)) return 0;
  if (pct >= 100) return 100;
  if (pct >= 90) return 90;
  if (pct >= 70) return 70;
  return 0;
}

const NAMES = {
  strava: 'Strava (atletas conectados)',
  db: 'Supabase: tamaño de la base de datos',
  mau: 'Supabase: personas activas por mes',
  chat: 'Zonda: mensajes de la persona que más escribió hoy',
  chat_global: 'Zonda: mensajes totales de hoy (gasto de Anthropic)',
  signups_day: 'Resend: altas por día (correos de confirmación)'
};
const ADVICE = {
  strava: 'Strava tiene un tope de atletas por aplicación (y Zancada va a sacar Strava de las apps de las tiendas).',
  db: 'Pasar Supabase al plan Pro (más espacio, copias diarias).',
  mau: 'Pasar Supabase al plan Pro.',
  chat: 'Una persona está usando mucho a Zonda: revisar que no sea abuso.',
  chat_global: 'El gasto de Anthropic sube con cada mensaje: revisar el tope mensual en su consola.',
  signups_day: 'Pasar Resend a un plan pago y subir el tope de correos por hora en Supabase (Authentication, Rate Limits).'
};

// Correo de aviso (texto plano) para los límites que cambiaron de nivel hacia arriba.
function buildAlertEmail(changed, all) {
  const worst = Math.max(...changed.map(c => c.level));
  const subject = worst >= 100 ? 'Zancada: un límite de uso llegó al tope' : (worst >= 90 ? 'Zancada: un límite de uso está por llegar al tope' : 'Zancada: un límite de uso se está acercando');
  const lines = ['Hola,', '', 'Estos límites de uso cambiaron de nivel:', ''];
  for (const c of changed) lines.push(`- ${NAMES[c.key] || c.key}: ${c.used} de ${c.limit} ${c.unit} (${c.pct} %). ${ADVICE[c.key] || ''}`);
  lines.push('', 'Todos los límites ahora:');
  for (const l of all) lines.push(`- ${NAMES[l.key] || l.key}: ${l.used} de ${l.limit} ${l.unit} (${l.pct} %)`);
  lines.push('', 'No se puede medir desde la app (mirá las alertas de cada panel): el tráfico de salida de Supabase, el uso de Vercel, el gasto de Anthropic, las cargas de Mapbox y los errores de Sentry. La lista de límites y cuándo conviene pagar cada plan está en docs/limites-y-costos.md.', '', 'Aviso automático diario de Zancada.');
  return { subject, text: lines.join('\n') };
}

module.exports = { buildLimits, alertLevel, buildAlertEmail, NAMES };
