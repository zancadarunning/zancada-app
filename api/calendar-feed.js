const { withSentry, reportError } = require('./_lib/sentry');

// Feed de calendario suscribible (webcal://) -- ver ensureCalendarToken()/
// openCalendarSubscribe() en app.js para el porqué: reemplaza el viejo "bajar un .ics de
// esta semana", que generaba un evento suelto nuevo cada vez que se tocaba el botón, sin
// forma de que la app borre después lo que ya quedó adentro del Calendario del usuario
// (nunca tuvo permiso de escritura sobre el calendario, solo entregó un archivo una vez).
//
// Acá en cambio es una URL fija por usuario que su propio cliente de calendario vuelve a
// pedir solo, periódicamente. Como siempre devolvemos el estado ACTUAL del plan con los
// mismos UID de siempre, un evento que ya no aplica (semana vieja, día que cambió, sesión
// salteada) simplemente deja de aparecer en el próximo refresco del cliente, en vez de
// quedar duplicado para siempre.
//
// Qué semanas incluye: la EN CURSO (app_state.data.plan/weekStart) y la SIGUIENTE
// (app_state.data.calendarNextWeek, que el cliente deja ya calculada en cada guardado -- ver
// refreshCalendarCache() en app.js). La siguiente no se puede calcular acá: sale de
// generatePlan()/getNextWeekPlan() del cliente (periodización, ajuste por lo calificado,
// cambios del coach), y portar ese algoritmo duplicaría una lógica grande que después hay
// que mantener sincronizada a mano. Semanas más lejanas son proyecciones que pueden
// cambiar enteras, no tiene sentido fijarlas en un calendario.
//
// Sin login: ningún cliente de calendario (Apple/Google Calendar) sabe autenticarse con
// una sesión de Supabase, así que el usuario se identifica con un token random e
// impredecible en la URL (state.calendarToken, generado una sola vez del lado del
// cliente) -- mismo criterio de "secreto en la URL en vez de login" que cualquier feed de
// calendario privado (Trello, Google Calendar "dirección privada", etc.).

function icsEscape(str){
  return String(str||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}
function icsDateStamp(dateObj){
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth()+1).padStart(2,'0');
  const d = String(dateObj.getUTCDate()).padStart(2,'0');
  return `${y}${m}${d}`;
}
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Mismo orden que DAY_KEYS en app.js.
const DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
// Diccionario reducido, mismo criterio que ya usa api/send-reminders.js: no hace falta el
// diccionario completo de la app (con sus variantes de principiante, texto de zona, etc.)
// para una etiqueta corta de evento de calendario -- si el typeKey no está acá, se muestra
// tal cual en vez de romper.
const TYPE_LABELS = {
  es: {easy:'Rodaje suave', long:'Tirada larga', intervals:'Series', tempo:'Ritmo medio', hills:'Cuestas', fartlek:'Fartlek', progression:'Progresivo', recovery:'Trote regenerativo', race:'Carrera', test:'Test de nivel'},
  en: {easy:'Easy run', long:'Long run', intervals:'Intervals', tempo:'Tempo run', hills:'Hill repeats', fartlek:'Fartlek', progression:'Progression run', recovery:'Recovery jog', race:'Race', test:'Fitness test'},
  pt: {easy:'Corrida leve', long:'Longão', intervals:'Tiros', tempo:'Ritmo médio', hills:'Subidas', fartlek:'Fartlek', progression:'Progressivo', recovery:'Trote regenerativo', race:'Prova', test:'Teste de nível'},
  fr: {easy:'Footing', long:'Sortie longue', intervals:'Fractionné', tempo:'Allure soutenue', hills:'Côtes', fartlek:'Fartlek', progression:'Progressif', recovery:'Footing de récupération', race:'Course', test:'Test de niveau'},
  it: {easy:'Corsa lenta', long:'Lungo', intervals:'Ripetute', tempo:'Ritmo medio', hills:'Salite', fartlek:'Fartlek', progression:'Progressivo', recovery:'Corsa di recupero', race:'Gara', test:'Test di livello'},
  de: {easy:'Lockerer Lauf', long:'Langer Lauf', intervals:'Intervalle', tempo:'Tempolauf', hills:'Bergläufe', fartlek:'Fartlek', progression:'Steigerungslauf', recovery:'Regenerationslauf', race:'Wettkampf', test:'Leistungstest'}
};
const ZONE_WORD = { es:'Zona', en:'Zone', pt:'Zona', fr:'Zone', it:'Zona', de:'Zone' };
function typeLabel(d, lang){
  // Un día "custom" (texto libre que el coach escribió por chat) ya trae su propio
  // d.type listo para mostrar -- no hace falta traducción.
  if(d.custom && d.type) return d.type;
  const dict = TYPE_LABELS[lang] || TYPE_LABELS.es;
  return dict[d.typeKey] || d.typeKey || dict.easy;
}
function amountText(d, profile){
  const imperial = !!(profile && profile.units === 'imperial');
  const val = imperial ? d.dist * 0.621371 : d.dist;
  return `${val.toFixed(1)}${imperial ? 'mi' : 'km'}`;
}

function buildWeekEvents(plan, weekStart, lang, profile, nowStamp){
  const monday = new Date(weekStart+'T00:00:00Z');
  return (plan || []).filter(d => d && d.dist > 0 && d.status !== 'skipped').map(d => {
    const idx = DAY_KEYS.indexOf(d.day);
    if(idx < 0) return null;
    const date = new Date(monday); date.setUTCDate(monday.getUTCDate() + idx);
    const nextDate = new Date(date); nextDate.setUTCDate(date.getUTCDate() + 1);
    // ✓ en las sesiones ya hechas: el calendario sirve también de registro de lo que
    // se cumplió. Las saltadas directamente no aparecen (ya no van a pasar).
    const summary = `${d.status === 'done' ? '✓ ' : ''}${typeLabel(d, lang)} · ${amountText(d, profile)}`;
    const zoneLine = d.zone ? `${ZONE_WORD[lang] || ZONE_WORD.es} ${d.zone}` : '';
    // Mismo UID que generaba el viejo generateWeekICS() del lado del cliente -- si algún
    // usuario todavía tiene eventos de una exportación manual anterior con este mismo UID,
    // un cliente de calendario que respete RFC 5545 los trata como el mismo evento
    // (actualiza en vez de duplicar) al re-sincronizar esta suscripción.
    const uid = `zancada-${weekStart}-${d.day}@zancada.app`;
    return ['BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowStamp}T000000Z`,
      `DTSTART;VALUE=DATE:${icsDateStamp(date)}`,
      `DTEND;VALUE=DATE:${icsDateStamp(nextDate)}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${icsEscape(['Zancada', zoneLine].filter(Boolean).join(' · '))}`,
      // TRANSP:TRANSPARENT -- un entrenamiento de día completo no debería marcar al
      // usuario como "ocupado" todo el día en agendas compartidas.
      'TRANSP:TRANSPARENT',
      'END:VEVENT'].join('\r\n');
  }).filter(Boolean);
}

function buildICS(weeks, lang, profile){
  const nowStamp = icsDateStamp(new Date());
  const events = weeks.flatMap(w => buildWeekEvents(w.plan, w.weekStart, lang, profile, nowStamp));
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Zancada//Plan Semanal//ES','CALSCALE:GREGORIAN',
    'METHOD:PUBLISH','X-WR-CALNAME:Zancada',
    // Pistas de frecuencia de refresco: Apple Calendar respeta REFRESH-INTERVAL (si no lo
    // trae, usa su propio valor, que puede ser de un día entero); Google lo ignora y refresca
    // cuando quiere (cada ~8-24 hs).
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H','X-PUBLISHED-TTL:PT6H',
    ...events,'END:VCALENDAR'].join('\r\n');
}

module.exports = withSentry(async (req, res) => {
  const token = (req.query && req.query.t) || '';
  // Token con forma rara: 404 liso, no 400 -- un cliente de calendario no sabe mostrar un
  // mensaje de error legible, y de paso no le confirmamos a nadie si un token "casi
  // correcto" existe de verdad o no.
  if (!/^[a-z0-9-]{10,80}$/i.test(token)) {
    return res.status(404).send('Not found');
  }
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const url = `${base}/rest/v1/app_state?select=plan:data->plan,weekStart:data->>weekStart,nextWeek:data->calendarNextWeek,lang:data->>lang,profile:data->profile&data->>calendarToken=eq.${encodeURIComponent(token)}`;
    const r = await fetch(url, { headers });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`app_state fetch failed: ${r.status} ${body}`);
    }
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(404).send('Not found');
    }
    const row = rows[0];
    const weeks = [];
    if (ISO_DATE_RE.test(row.weekStart || '')) {
      weeks.push({ plan: row.plan, weekStart: row.weekStart });
      // La semana siguiente guardada solo vale si de verdad es POSTERIOR a la actual: si el
      // corredor no abrió la app en un tiempo, lo que quedó cacheado puede ser la misma
      // semana (o una vieja) y mostrarla duplicaría/pisaría la actual.
      const nw = row.nextWeek;
      if (nw && ISO_DATE_RE.test(nw.weekStart || '') && nw.weekStart > row.weekStart) {
        weeks.push({ plan: nw.plan, weekStart: nw.weekStart });
      }
    }
    const ics = buildICS(weeks, row.lang, row.profile);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    // ?dl=1: el botón de Android lo abre en el navegador del sistema, que lo baja como
    // archivo y lo ofrece abrir con Calendar. Una suscripción (sin dl) tiene que seguir
    // siendo inline, no un adjunto.
    if (req.query.dl) res.setHeader('Content-Disposition', 'attachment; filename="zancada.ics"');
    // No-cache: queremos que cada refresco del cliente de calendario traiga el estado
    // más nuevo del plan, no una respuesta vieja servida desde algún cache intermedio.
    res.setHeader('Cache-Control', 'no-cache, max-age=0');
    res.status(200).send(ics);
  } catch (err) {
    console.error('calendar-feed error', err);
    await reportError(err, { endpoint: 'calendar-feed' });
    res.status(500).send('Error generating calendar');
  }
});
