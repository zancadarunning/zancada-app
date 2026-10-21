// api/_lib/missing-run-nudge.js
//
// Aviso de la noche "hoy tenías una salida planeada y todavía no aparece cargada": send-reminders.js (cron cada 30 minutos) se lo manda a
// quien tenía una sesión planeada HOY, no la marcó como resuelta y no tiene ninguna carrera guardada hoy, a las 20:00 de su hora local.
// Sirve para dos cosas: acordarse de salir, y darse cuenta de que la carrera ya hecha no llegó (a veces hay que abrir Strava o la app del
// reloj para que se sincronice).
//
// El cron solo decide a quién le toca; acá están el momento, la pregunta a la base y el texto (funciones puras, se prueban aparte).
// Mismo registro de enviados que el resumen semanal (sql/sent_notifications.sql): un aviso por persona por día, aunque la corrida se repita.

const { pick } = require('./own');
const { localDateKey, dayNum } = require('./weekly-summary');

const NUDGE_HOUR = 20;           // hora local en que sale (la primera mitad de esa hora: el cron corre en :00 y :30)
const MI_PER_KM = 0.621371;

const TEXTS = {
  es: { title: 'Zancada', body: (what) => `Hoy tenías ${what} y todavía no aparece cargado. Si ya corriste, abrí Strava o la app de tu reloj para que se sincronice.` },
  en: { title: 'Zancada', body: (what) => `Today you had ${what} planned and it hasn't shown up yet. If you already ran, open Strava or your watch app so it syncs.` },
  pt: { title: 'Zancada', body: (what) => `Hoje você tinha ${what} no plano e ainda não apareceu. Se você já correu, abra o Strava ou o app do seu relógio para sincronizar.` },
  fr: { title: 'Zancada', body: (what) => `Aujourd'hui, tu avais prévu ${what} et rien n'apparaît encore. Si tu as déjà couru, ouvre Strava ou l'appli de ta montre pour la synchroniser.` },
  it: { title: 'Zancada', body: (what) => `Oggi avevi in programma ${what} e non risulta ancora caricato. Se hai già corso, apri Strava o l'app del tuo orologio per sincronizzare.` },
  de: { title: 'Zancada', body: (what) => `Heute stand ${what} auf dem Plan und es ist noch nicht aufgetaucht. Wenn du schon gelaufen bist, öffne Strava oder die App deiner Uhr zum Synchronisieren.` }
};

// ¿Le toca el aviso a esta persona ahora? Su plan guardado tiene que ser el de ESTA semana (si no, no sabemos qué tocaba hoy), con sesión
// planeada hoy y sin marcar como resuelta (hecha, saltada...). Devuelve la sesión de hoy o null.
function sessionDueToday(plan, weekStart, mondayKey, dayIdx) {
  if (!Array.isArray(plan) || !weekStart || weekStart !== mondayKey) return null;
  const today = plan[dayIdx];
  if (!today || typeof today !== 'object' || !(Number(today.dist) > 0) || today.status) return null;
  return today;
}

// Lunes (YYYY-MM-DD) de la semana en curso, en el huso de la persona, a partir del día de la semana local (0 = lunes ... 6 = domingo).
// (mondayKeyFor de weekly-summary.js solo vale en domingo: acá el aviso sale cualquier día.)
function mondayOf(now, tz, dayIdx) {
  return new Date((dayNum(localDateKey(now, tz)) - dayIdx) * 86400000).toISOString().slice(0, 10);
}

function isNudgeTime(localHour, localMinute) {
  return localHour === NUDGE_HOUR && localMinute < 30;
}

// Qué decía la sesión, para el texto: "Rodaje suave · 8.0 km" (o minutos si el plan es por tiempo). Todo sale de números y de la lista fija de
// nombres de tipo; un tipo propio de la persona (custom) se recorta y se limpia.
function describeSession(today, typeLabel, imperial, timeMode) {
  let label = String(typeLabel || '').replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 40).trim();
  let amount;
  if (timeMode && Number(today.durMin) > 0) amount = Math.round(Number(today.durMin)) + ' min';
  else {
    const km = Number(today.dist);
    amount = (imperial ? km * MI_PER_KM : km).toFixed(1) + (imperial ? ' mi' : ' km');
  }
  return label ? `${label} · ${amount}` : amount;
}

function buildNudge(lang, what) {
  const T = pick(TEXTS, lang, 'es');
  return { title: T.title, body: T.body(what) };
}

// Desde la medianoche local de hoy hasta una hora a futuro, en ISO UTC, más la fecha local (para las carreras cargadas a mano con fecha sola).
function localDayWindow(tz, now) {
  const dayKey = localDateKey(now, tz);
  let offsetMs = 0;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now);
    const g = t => Number((parts.find(p => p.type === t) || {}).value);
    offsetMs = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(now / 1000) * 1000;
  } catch (e) { offsetMs = 0; }
  const midnightUtc = dayNum(dayKey) * 86400000 - offsetMs;
  return { dayKey, fromIso: new Date(midnightUtc).toISOString(), toIso: new Date(now + 3600000).toISOString() };
}

// true = ya hay una carrera hoy, false = no hay, null = no se pudo saber (la función de la base no existe o falló: NO se manda nada).
async function hasRunToday(base, headers, userId, win) {
  try {
    const res = await fetch(`${base}/rest/v1/rpc/has_run_between`, {
      method: 'POST', headers,
      body: JSON.stringify({ p_user_id: userId, p_from: win.fromIso, p_to: win.toIso, p_day: win.dayKey })
    });
    if (!res.ok) return null;
    const v = await res.json();
    return typeof v === 'boolean' ? v : null;
  } catch (e) { return null; }
}

module.exports = { NUDGE_HOUR, mondayOf, isNudgeTime, sessionDueToday, describeSession, buildNudge, localDayWindow, hasRunToday };
