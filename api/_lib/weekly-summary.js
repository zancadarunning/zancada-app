// api/_lib/weekly-summary.js
const { pick } = require('./own');
//
// Resumen de la semana que send-reminders.js (cron cada hora) manda el domingo entre las 19:00 y las 23:00, hora local de cada corredor:
// kilómetros y salidas de la semana, comparación con la anterior, sesiones del plan cumplidas y racha. buildWeeklySummary es una
// función pura (se prueba aparte); el cron solo decide a quién le toca y cómo se envía.

const MI_PER_KM = 0.621371;
// Cuántos días hacia atrás se mira para saber si alguien corrió "hace poco": solo a esas cuentas se les manda el empujón de la semana sin salidas.
const IDLE_NUDGE_DAYS = 28;
// El resumen se reparte en turnos de media hora del domingo a la noche (hora local de cada corredor), en vez de mandarlo todo junto: cada
// usuario tiene un turno fijo (lo saca de su id), así cada corrida del cron (cada 30 minutos) atiende a una fracción chica y entra sin
// problema en el tiempo máximo de la función. No hace falta recordar a quién ya se le mandó: su turno es siempre el mismo.
//
// Hay dos grupos, según el plan de la semana:
//   - SIN sesión planeada el domingo: 6 turnos, de 19:00 a 21:30.
//   - CON sesión planeada el domingo (es probable que corra a la tarde/noche): se posterga a la última instancia, 4 turnos, de 22:00 a
//     23:30, para que el resumen ya incluya esa salida y no cuente como pendiente una sesión que todavía no hizo.
// La franja total es de 19:00 a 23:30 (10 turnos: 0 = 19:00, 1 = 19:30, ... 9 = 23:30).
const WEEKLY_FIRST_HOUR = 19, WEEKLY_LAST_HOUR = 23;
const NORMAL_SLOTS = 6;              // turnos 0 a 5
const LATE_FIRST_SLOT = 6, LATE_SLOTS = 4;   // turnos 6 a 9
const WEEKLY_SLOTS = NORMAL_SLOTS + LATE_SLOTS;
function hashOf(userId) {
  let h = 0;
  for (const ch of String(userId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
// ¿Tiene sesión planeada el domingo de ESTA semana? (el plan guardado solo vale si es el de la semana en curso: lunes = hoy - 6)
function mondayKeyFor(now, tz) {
  const today = dayNum(localDateKey(now, tz));
  return new Date(Date.UTC(1970, 0, 1) + (today - 6) * 86400000).toISOString().slice(0, 10);
}
function hasSundaySession(plan, weekStart, tz, now) {
  return Array.isArray(plan) && weekStart === mondayKeyFor(now, tz) && !!(plan[6] && plan[6].dist > 0);
}
// Sesión del domingo todavía por hacer: planeada y no marcada como cumplida. Si el plan ya la tiene 'done' (la app lo marcó al cargar la
// carrera), el resumen no tiene por qué esperar a la última instancia.
function sundayPending(plan, weekStart, tz, now) {
  return hasSundaySession(plan, weekStart, tz, now) && plan[6].status !== 'done';
}
function weeklySlotOf(userId, sundaySession) {
  const h = hashOf(userId);
  return sundaySession ? LATE_FIRST_SLOT + (h % LATE_SLOTS) : h % NORMAL_SLOTS;
}
// Turno que corresponde a la hora y minuto locales actuales (0 a 9), o -1 si está fuera de la franja
function currentWeeklySlot(localHour, localMinute) {
  if (localHour < WEEKLY_FIRST_HOUR || localHour > WEEKLY_LAST_HOUR) return -1;
  return (localHour - WEEKLY_FIRST_HOUR) * 2 + (localMinute >= 30 ? 1 : 0);
}
// Con el registro de enviados (sql/sent_notifications.sql): ¿ya le corresponde el resumen? Es true desde su turno en adelante, así que si una
// corrida falló, las siguientes de la noche lo reintentan (el registro evita mandarlo dos veces).
function isWeeklyDue(userId, currentSlot, sundaySession) {
  return currentSlot >= 0 && currentSlot >= weeklySlotOf(userId, !!sundaySession);
}
// Sin registro (tabla todavía no creada): solo en su turno exacto, como antes. ¿A este usuario le toca el resumen ahora? (hora y minuto actuales en SU huso horario, en un domingo)
function isWeeklySlot(userId, localHour, localMinute, sundaySession) {
  return currentWeeklySlot(localHour, localMinute || 0) === weeklySlotOf(userId, !!sundaySession);
}

const L = {
  es: { title: 'Tu semana en Zancada', idle: `Esta semana no registraste salidas. ¿Retomamos mañana?`, runs: n => n === 1 ? '1 salida' : `${n} salidas`, head: (d, r, delta) => `${d} en ${r}${delta ? ` (${delta} vs la semana anterior)` : ''}.`, sessions: (a, b) => `Sesiones del plan: ${a} de ${b}.`, streak: n => `Racha: ${n} semanas seguidas.` },
  en: { title: 'Your week in Zancada', idle: `You didn't log any runs this week. Shall we get back to it tomorrow?`, runs: n => n === 1 ? '1 run' : `${n} runs`, head: (d, r, delta) => `${d} in ${r}${delta ? ` (${delta} vs last week)` : ''}.`, sessions: (a, b) => `Plan sessions: ${a} of ${b}.`, streak: n => `Streak: ${n} weeks in a row.` },
  pt: { title: 'Sua semana no Zancada', idle: `Esta semana você não registrou saídas. Retomamos amanhã?`, runs: n => n === 1 ? '1 saída' : `${n} saídas`, head: (d, r, delta) => `${d} em ${r}${delta ? ` (${delta} vs a semana anterior)` : ''}.`, sessions: (a, b) => `Sessões do plano: ${a} de ${b}.`, streak: n => `Sequência: ${n} semanas seguidas.` },
  fr: { title: 'Ta semaine sur Zancada', idle: `Cette semaine, tu n'as enregistré aucune sortie. On s'y remet demain ?`, runs: n => n === 1 ? '1 sortie' : `${n} sorties`, head: (d, r, delta) => `${d} en ${r}${delta ? ` (${delta} vs la semaine précédente)` : ''}.`, sessions: (a, b) => `Séances du plan : ${a} sur ${b}.`, streak: n => `Série : ${n} semaines de suite.` },
  it: { title: 'La tua settimana su Zancada', idle: `Questa settimana non hai registrato uscite. Riprendiamo domani?`, runs: n => n === 1 ? '1 uscita' : `${n} uscite`, head: (d, r, delta) => `${d} in ${r}${delta ? ` (${delta} rispetto alla settimana scorsa)` : ''}.`, sessions: (a, b) => `Sessioni del piano: ${a} su ${b}.`, streak: n => `Serie: ${n} settimane di fila.` },
  de: { title: 'Deine Woche in Zancada', idle: `Diese Woche hast du keinen Lauf aufgezeichnet. Wollen wir morgen wieder starten?`, runs: n => n === 1 ? '1 Lauf' : `${n} Läufe`, head: (d, r, delta) => `${d} in ${r}${delta ? ` (${delta} ggü. Vorwoche)` : ''}.`, sessions: (a, b) => `Planeinheiten: ${a} von ${b}.`, streak: n => `Serie: ${n} Wochen in Folge.` }
};

// Fecha local (YYYY-MM-DD) de un instante en un huso horario
const dateFormatters = new Map();
function localDateKey(ms, tz) {
  try {
    let f = dateFormatters.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
      if (dateFormatters.size > 50) dateFormatters.clear();
      dateFormatters.set(tz, f);
    }
    return f.format(ms);
  } catch (e) {
    return new Date(ms).toISOString().slice(0, 10);
  }
}
const dayNum = key => Math.floor(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86400000);

function fmtKm(km, imperial) {
  const v = imperial ? km * MI_PER_KM : km;
  return v.toFixed(1) + (imperial ? ' mi' : ' km');
}

// runs: [{date, distanceKm}], plan: [{dist, status}] de la semana en curso (o null), weekStart: 'YYYY-MM-DD' del lunes de ese plan.
// Devuelve {title, body}. Sin salidas esta semana: un mensaje corto para retomar si corrió en las últimas 4 semanas (nunca un "0 km", que desanima más
// de lo que ayuda); y null (no se manda nada) si hace más de 4 semanas que no corre o todavía no corrió nunca.
function buildWeeklySummary({ runs, plan, weekStart, streak, tz, lang, imperial, now }) {
  const T = pick(L, lang, 'es');
  const today = dayNum(localDateKey(now, tz));
  let km = 0, n = 0, prevKm = 0, ranRecently = false;
  for (const r of runs || []) {
    if (!r || !r.date) continue;
    const rms = new Date(r.date).getTime();
    if (!Number.isFinite(rms)) continue;   // fecha invalida (la escribe la propia cuenta): se ignora en vez de romper el resumen
    const d = dayNum(localDateKey(rms, tz));
    const dist = Number(r.distanceKm) || 0;
    if (d > today - 7 && d <= today) { km += dist; n++; }
    else if (d > today - 14 && d <= today - 7) prevKm += dist;
    if (d > today - IDLE_NUDGE_DAYS && d <= today) ranRecently = true;
  }
  if (!n) {
    // Sin salidas esta semana: en vez de callar, un empujón corto para retomar ("0 km" no se muestra). Solo a quien corrió en las últimas
    // 4 semanas: quien lleva meses sin abrir la app no recibe un reproche cada domingo, y a una cuenta nueva sin carreras no le decimos "retomamos".
    return ranRecently ? { title: T.title, body: T.idle } : null;
  }

  let delta = '';
  if (prevKm > 0.05) {
    const diff = km - prevKm;
    const v = Math.abs(imperial ? diff * MI_PER_KM : diff).toFixed(1);
    delta = (diff >= 0 ? '+' : '−') + v + (imperial ? ' mi' : ' km');
  }
  const parts = [T.head(fmtKm(km, imperial), T.runs(n), delta)];

  // las sesiones del plan solo se cuentan si el plan guardado es el de ESTA semana (el cliente lo renueva al abrir la app)
  const mondayKey = mondayKeyFor(now, tz);
  if (Array.isArray(plan) && plan.length && weekStart === mondayKey) {
    const planned = plan.filter(d => d && d.dist > 0).length;
    const done = plan.filter(d => d && d.dist > 0 && d.status === 'done').length;
    if (planned > 0) parts.push(T.sessions(done, planned));
  }
  if (Number(streak) >= 2) parts.push(T.streak(Number(streak)));
  return { title: T.title, body: parts.join(' ') };
}

module.exports = { buildWeeklySummary, WEEKLY_SLOTS, NORMAL_SLOTS, LATE_FIRST_SLOT, LATE_SLOTS, weeklySlotOf, currentWeeklySlot, isWeeklySlot, isWeeklyDue, hasSundaySession, sundayPending, mondayKeyFor, localDateKey, dayNum };
