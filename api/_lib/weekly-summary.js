// api/_lib/weekly-summary.js
//
// Resumen de la semana que send-reminders.js (cron cada hora) manda el domingo entre las 19:00 y las 23:00, hora local de cada corredor:
// kilómetros y salidas de la semana, comparación con la anterior, sesiones del plan cumplidas y racha. buildWeeklySummary es una
// función pura (se prueba aparte); el cron solo decide a quién le toca y cómo se envía.

const MI_PER_KM = 0.621371;
// El resumen se reparte en 8 turnos de media hora del domingo a la noche (19:00 a 22:30, hora local de cada corredor) en vez de mandarlo
// todo junto: cada usuario tiene un turno fijo (lo saca de su id), así cada corrida del cron (cada 30 minutos) atiende a la octava
// parte y entra sin problema en el tiempo máximo de la función. No hace falta recordar a quién ya se le mandó: su turno es siempre el mismo.
const WEEKLY_FIRST_HOUR = 19, WEEKLY_LAST_HOUR = 22;   // el último turno es 22:30 (se manda antes de las 23:00)
const WEEKLY_SLOTS = (WEEKLY_LAST_HOUR - WEEKLY_FIRST_HOUR + 1) * 2;
function weeklySlotOf(userId) {
  let h = 0;
  for (const ch of String(userId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % WEEKLY_SLOTS;
}
// Turno que corresponde a la hora y minuto locales actuales (0 a 7), o -1 si está fuera de la franja
function currentWeeklySlot(localHour, localMinute) {
  if (localHour < WEEKLY_FIRST_HOUR || localHour > WEEKLY_LAST_HOUR) return -1;
  return (localHour - WEEKLY_FIRST_HOUR) * 2 + (localMinute >= 30 ? 1 : 0);
}
// ¿A este usuario le toca el resumen ahora? (hora y minuto actuales en SU huso horario, en un domingo)
function isWeeklySlot(userId, localHour, localMinute) { return currentWeeklySlot(localHour, localMinute || 0) === weeklySlotOf(userId); }

const L = {
  es: { title: 'Tu semana en Zancada', runs: n => n === 1 ? '1 salida' : `${n} salidas`, head: (d, r, delta) => `${d} en ${r}${delta ? ` (${delta} vs la semana anterior)` : ''}.`, sessions: (a, b) => `Sesiones del plan: ${a} de ${b}.`, streak: n => `Racha: ${n} semanas seguidas.` },
  en: { title: 'Your week in Zancada', runs: n => n === 1 ? '1 run' : `${n} runs`, head: (d, r, delta) => `${d} in ${r}${delta ? ` (${delta} vs last week)` : ''}.`, sessions: (a, b) => `Plan sessions: ${a} of ${b}.`, streak: n => `Streak: ${n} weeks in a row.` },
  pt: { title: 'Sua semana no Zancada', runs: n => n === 1 ? '1 saída' : `${n} saídas`, head: (d, r, delta) => `${d} em ${r}${delta ? ` (${delta} vs a semana anterior)` : ''}.`, sessions: (a, b) => `Sessões do plano: ${a} de ${b}.`, streak: n => `Sequência: ${n} semanas seguidas.` },
  fr: { title: 'Ta semaine sur Zancada', runs: n => n === 1 ? '1 sortie' : `${n} sorties`, head: (d, r, delta) => `${d} en ${r}${delta ? ` (${delta} vs la semaine précédente)` : ''}.`, sessions: (a, b) => `Séances du plan : ${a} sur ${b}.`, streak: n => `Série : ${n} semaines de suite.` },
  it: { title: 'La tua settimana su Zancada', runs: n => n === 1 ? '1 uscita' : `${n} uscite`, head: (d, r, delta) => `${d} in ${r}${delta ? ` (${delta} rispetto alla settimana scorsa)` : ''}.`, sessions: (a, b) => `Sessioni del piano: ${a} su ${b}.`, streak: n => `Serie: ${n} settimane di fila.` },
  de: { title: 'Deine Woche in Zancada', runs: n => n === 1 ? '1 Lauf' : `${n} Läufe`, head: (d, r, delta) => `${d} in ${r}${delta ? ` (${delta} ggü. Vorwoche)` : ''}.`, sessions: (a, b) => `Planeinheiten: ${a} von ${b}.`, streak: n => `Serie: ${n} Wochen in Folge.` }
};

// Fecha local (YYYY-MM-DD) de un instante en un huso horario
function localDateKey(ms, tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
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
// Devuelve {title, body} o null si no hubo ninguna salida esta semana (no se manda nada: un "0 km" desanima más de lo que ayuda).
function buildWeeklySummary({ runs, plan, weekStart, streak, tz, lang, imperial, now }) {
  const T = L[lang] || L.es;
  const today = dayNum(localDateKey(now, tz));
  let km = 0, n = 0, prevKm = 0;
  for (const r of runs || []) {
    if (!r || !r.date) continue;
    const d = dayNum(localDateKey(new Date(r.date).getTime(), tz));
    const dist = Number(r.distanceKm) || 0;
    if (d > today - 7 && d <= today) { km += dist; n++; }
    else if (d > today - 14 && d <= today - 7) prevKm += dist;
  }
  if (!n) return null;

  let delta = '';
  if (prevKm > 0.05) {
    const diff = km - prevKm;
    const v = Math.abs(imperial ? diff * MI_PER_KM : diff).toFixed(1);
    delta = (diff >= 0 ? '+' : '−') + v + (imperial ? ' mi' : ' km');
  }
  const parts = [T.head(fmtKm(km, imperial), T.runs(n), delta)];

  // las sesiones del plan solo se cuentan si el plan guardado es el de ESTA semana (el cliente lo renueva al abrir la app)
  const mondayKey = (() => { const t = new Date(Date.UTC(1970, 0, 1) + (today - 6) * 86400000); return t.toISOString().slice(0, 10); })();
  if (Array.isArray(plan) && plan.length && weekStart === mondayKey) {
    const planned = plan.filter(d => d && d.dist > 0).length;
    const done = plan.filter(d => d && d.dist > 0 && d.status === 'done').length;
    if (planned > 0) parts.push(T.sessions(done, planned));
  }
  if (Number(streak) >= 2) parts.push(T.streak(Number(streak)));
  return { title: T.title, body: parts.join(' ') };
}

module.exports = { buildWeeklySummary, WEEKLY_SLOTS, weeklySlotOf, currentWeeklySlot, isWeeklySlot, localDateKey };
