const { withSentry, reportError } = require('./_lib/sentry');

// Feed de calendario suscribible (webcal://) -- ver ensureCalendarToken()/
// openCalendarSubscribe() en app.js para el porqué: reemplaza el viejo "bajar un .ics de
// esta semana", que generaba un evento suelto nuevo cada vez que se tocaba el botón, sin
// forma de que la app borre después lo que ya quedó adentro del Calendario del usuario
// (nunca tuvo permiso de escritura sobre el calendario, solo entregó un archivo una vez).
//
// Acá en cambio es una URL fija por usuario que su propio cliente de calendario vuelve a
// pedir solo, periódicamente. Como siempre devolvemos el estado ACTUAL de la semana en
// curso con los mismos UID de siempre (mismo esquema que ya usaba el .ics viejo), un
// evento que ya no aplica (semana vieja, día que cambió) simplemente deja de aparecer en
// el próximo refresco del cliente, en vez de quedar duplicado para siempre.
//
// Solo se arma la semana EN CURSO (app_state.data.plan/weekStart), no semanas futuras:
// esas se calculan al vuelo en el cliente (generatePlan()/getNextWeekPlan() en app.js, con
// toda la lógica de periodización/ajuste de volumen) y nunca se guardan en el servidor --
// portar ese algoritmo acá duplicaría una lógica grande que después hay que mantener
// sincronizada a mano con el cliente. La semana en curso alcanza para resolver el
// problema real (la acumulación de duplicados), que es lo que se pidió arreglar.
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
// Mismo orden que DAY_KEYS en app.js.
const DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
// Diccionario reducido, mismo criterio que ya usa api/send-reminders.js: no hace falta el
// diccionario completo de la app (con sus variantes de principiante, texto de zona, etc.)
// para una etiqueta corta de evento de calendario -- si el typeKey no está acá, se muestra
// tal cual en vez de romper.
const TYPE_LABELS = {
  es: {easy:'Rodaje suave', long:'Tirada larga', intervals:'Series', tempo:'Ritmo medio', hills:'Cuestas', fartlek:'Fartlek', progression:'Progresivo', recovery:'Trote regenerativo', race:'Carrera'},
  en: {easy:'Easy run', long:'Long run', intervals:'Intervals', tempo:'Tempo run', hills:'Hill repeats', fartlek:'Fartlek', progression:'Progression run', recovery:'Recovery jog', race:'Race'},
  pt: {easy:'Corrida leve', long:'Longão', intervals:'Tiros', tempo:'Ritmo médio', hills:'Subidas', fartlek:'Fartlek', progression:'Progressivo', recovery:'Trote regenerativo', race:'Prova'},
  fr: {easy:'Footing', long:'Sortie longue', intervals:'Fractionné', tempo:'Allure soutenue', hills:'Côtes', fartlek:'Fartlek', progression:'Progressif', recovery:'Footing de récupération', race:'Course'},
  it: {easy:'Corsa lenta', long:'Lungo', intervals:'Ripetute', tempo:'Ritmo medio', hills:'Salite', fartlek:'Fartlek', progression:'Progressivo', recovery:'Corsa di recupero', race:'Gara'},
  de: {easy:'Lockerer Lauf', long:'Langer Lauf', intervals:'Intervalle', tempo:'Tempolauf', hills:'Bergläufe', fartlek:'Fartlek', progression:'Steigerungslauf', recovery:'Regenerationslauf', race:'Wettkampf'}
};
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

function buildWeekICS(plan, weekStart, lang, profile){
  const monday = new Date(weekStart+'T00:00:00Z');
  const nowStamp = icsDateStamp(new Date());
  const events = (plan || []).filter(d => d.dist > 0).map(d => {
    const idx = DAY_KEYS.indexOf(d.day);
    if(idx < 0) return null;
    const date = new Date(monday); date.setUTCDate(monday.getUTCDate() + idx);
    const nextDate = new Date(date); nextDate.setUTCDate(date.getUTCDate() + 1);
    const summary = `${typeLabel(d, lang)} · ${amountText(d, profile)}`;
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
      'END:VEVENT'].join('\r\n');
  }).filter(Boolean);
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Zancada//Plan Semanal//ES','CALSCALE:GREGORIAN',
    'METHOD:PUBLISH','X-WR-CALNAME:Zancada',
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
    const url = `${base}/rest/v1/app_state?select=plan:data->plan,weekStart:data->>weekStart,lang:data->>lang,profile:data->profile&data->>calendarToken=eq.${encodeURIComponent(token)}`;
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
    const ics = buildWeekICS(row.plan, row.weekStart, row.lang, row.profile);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
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
