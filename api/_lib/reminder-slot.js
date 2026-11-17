// api/_lib/reminder-slot.js
//
// Reparte el recordatorio diario ("Hoy toca: ...") para que no salgan TODOS en la misma corrida. Cada corredor elige su hora en Perfil (profile.reminderHour) y mucha gente elige las
// mismas (las 7, las 8, las 18...): con un solo envío por hora, miles de avisos caían en una única corrida y a los últimos no les llegaba (la función serverless se queda sin tiempo).
//
// Cómo se reparte: el cron corre cada STEP_MIN (30) minutos, así que la hora elegida tiene BUCKETS (2) turnos: en punto y y media. A cada corredor le toca siempre el mismo turno, que sale
// de su id de cuenta (estable: no cambia de un día para otro, y no hace falta guardar nada). Con 2 turnos el pico se parte a la mitad; si algún día el cron corre cada 15 minutos, subir
// STEP_MIN a 15 y BUCKETS a 4 (y cambiar vercel.json) lo reparte en cuatro sin tocar nada más.
//
// Reintento: un aviso que no se alcanzó a mandar (la corrida se quedó sin tiempo o el servicio de push falló) se reintenta en la corrida siguiente, dentro de WINDOW_MIN minutos desde el
// comienzo de su turno. Que no se duplique lo garantiza el registro de enviados (sent_notifications: ver api/_lib/sent-registry.js).
const STEP_MIN = 30;
const BUCKETS = 2;
const WINDOW_MIN = 60;

// FNV-1a de 32 bits: simple, sin dependencias y con buena dispersión para ids tipo UUID.
function hashUser(id) {
  let h = 0x811c9dc5;
  const s = String(id == null ? '' : id);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

function reminderBucket(userId, buckets) {
  return hashUser(userId) % (buckets || BUCKETS);
}

// Minuto (desde la medianoche LOCAL) en que empieza el turno de este corredor para la hora que eligió.
function slotStartMin(userId, wantHour, opts) {
  const o = opts || {};
  return wantHour * 60 + reminderBucket(userId, o.buckets) * (o.stepMin || STEP_MIN);
}

// ¿Ya le toca (o está en su ventana de reintento)? hour/minute = hora local de ahora.
function isReminderDue(userId, wantHour, hour, minute, opts) {
  const o = opts || {};
  const start = slotStartMin(userId, wantHour, o), now = hour * 60 + minute;
  return now >= start && now < start + (o.windowMin || WINDOW_MIN);
}

// ¿Es la corrida exacta de su turno (la primera)? Sin registro de enviados solo ahí se manda: es lo que evita duplicados.
function isExactRun(userId, wantHour, hour, minute, opts) {
  const o = opts || {};
  const start = slotStartMin(userId, wantHour, o), now = hour * 60 + minute;
  return now >= start && now < start + (o.stepMin || STEP_MIN);
}

module.exports = { STEP_MIN, BUCKETS, WINDOW_MIN, hashUser, reminderBucket, slotStartMin, isReminderDue, isExactRun };
