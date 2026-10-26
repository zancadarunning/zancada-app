const webpush = require('web-push');
const requireCronSecret = require('./_lib/require-cron-secret');
const { sendFcmPush } = require('./_lib/fcm');
const pushDevices = require('./_lib/push-devices');
const { isTrustedPushEndpoint } = require('./_lib/push-endpoint');
const { buildWeeklySummary, isWeeklySlot, isWeeklyDue, sundayPending, currentWeeklySlot, mondayKeyFor } = require('./_lib/weekly-summary');
const sentRegistry = require('./_lib/sent-registry');
const nudge = require('./_lib/missing-run-nudge');
const { pick, ownKey } = require('./_lib/own');

// ANTES este cron corría UNA vez por día a una hora fija en UTC (11:00 UTC, ver
// vercel.json) -- pensada para que le llegue a las 8am a un corredor en Argentina
// (UTC-3), pero un amigo usando la misma app desde Estados Unidos recibía el mismo
// aviso a las 3, 4 o 7 de la madrugada según su huso horario, porque el cron no sabe
// nada de dónde está cada usuario, solo dispara una vez a una hora fija para todos.
//
// Ahora el cron corre cada hora en punto (vercel.json: "0 * * * *") y en cada corrida
// revisamos, PARA CADA USUARIO, si la hora ahora mismo en SU propio huso horario
// (guardado en profile.tz -- ver detectDeviceTz() en app.js, que lee el huso horario
// real del celular de cada uno) coincide con REMINDER_HOUR. Si no coincide, no se le
// manda nada en esta corrida; le va a tocar en otra, cuando sea su 8am. Con esto cada
// corredor recibe el aviso a las 8 de la mañana, hora suya, sea cual sea el país.
const REMINDER_HOUR = 8;
// Cuántos user_id van por consulta a app_state (la URL no puede crecer sin límite).
const STATE_BATCH = 100;
const SEND_CONCURRENCY = 10;
// Corredores que ya tenían la cuenta creada antes de que existiera profile.tz (o algún
// caso raro donde no se pudo detectar el huso del navegador) caen acá -- el
// comportamiento de siempre, hora de Argentina, en vez de romper el envío.
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';
// Mapea el nombre corto de día que devuelve Intl al índice que usa el plan semanal
// (plan[0] = lunes ... plan[6] = domingo, mismo orden que ya usaba (getUTCDay()+6)%7).
const WEEKDAY_IDX = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };

// Calcula, para un huso horario IANA dado, qué hora es AHORA MISMO ahí y qué día de la
// semana es (ambos en hora LOCAL de ese huso, no en UTC) -- así cada corredor se
// evalúa contra su propio reloj, no contra el del servidor.
function localHourAndDayIdx(tz){
  try{
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour:'numeric', minute:'numeric', hour12:false, weekday:'short' }).formatToParts(new Date());
    let hour = null, minute = 0, weekday = null;
    for(const p of parts){
      if(p.type === 'hour') hour = parseInt(p.value, 10) % 24; // Intl puede devolver "24" para la medianoche en vez de "0"
      if(p.type === 'minute') minute = parseInt(p.value, 10) || 0;
      if(p.type === 'weekday') weekday = p.value;
    }
    if(hour === null || !(weekday in WEEKDAY_IDX)) throw new Error('huso horario inválido: ' + tz);
    return { hour, minute, dayIdx: WEEKDAY_IDX[weekday] };
  }catch(e){
    // tz guardado mal o directamente desconocido para Intl -- mejor caer al default
    // que reventar el envío de TODOS los demás usuarios en esta corrida.
    if(tz === DEFAULT_TZ) return { hour: -1, minute: 0, dayIdx: 0 }; // corta la recursión si hasta el default fallara
    return localHourAndDayIdx(DEFAULT_TZ);
  }
}
// Construir un Intl.DateTimeFormat es lo más caro de este cron (decenas de microsegundos cada vez) y hay un puñado de usos
// horarios para miles de usuarios: se calcula una vez por huso y se reutiliza durante toda la corrida.
function makeLocalClock(){
  const cache = new Map();
  return tz => {
    const k = tz || DEFAULT_TZ;
    let v = cache.get(k);
    if(!v){ v = localHourAndDayIdx(k); cache.set(k, v); }
    return v;
  };
}

// Mensajes cortos por idioma — no necesita el diccionario completo de la app.
const MSGS = {
  es: { types:{easy:'Rodaje suave',intervals:'Series',tempo:'Ritmo medio',long:'Tirada larga',test:'Test de nivel'}, body:what=>`Hoy toca: ${what}` },
  en: { types:{easy:'Easy run',intervals:'Intervals',tempo:'Tempo run',long:'Long run',test:'Fitness test'}, body:what=>`Today: ${what}` },
  pt: { types:{easy:'Corrida leve',intervals:'Tiros',tempo:'Ritmo médio',long:'Longão',test:'Teste de nível'}, body:what=>`Hoje: ${what}` },
  fr: { types:{easy:'Footing',intervals:'Fractionné',tempo:'Allure soutenue',long:'Sortie longue',test:'Test de niveau'}, body:what=>`Aujourd'hui : ${what}` },
  it: { types:{easy:'Corsa lenta',intervals:'Ripetute',tempo:'Ritmo medio',long:'Lungo',test:'Test di livello'}, body:what=>`Oggi: ${what}` },
  de: { types:{easy:'Lockerer Lauf',intervals:'Intervalle',tempo:'Tempolauf',long:'Langer Lauf',test:'Leistungstest'}, body:what=>`Heute: ${what}` }
};

const { withSentry, reportError, reportSecurityEvent } = require('./_lib/sentry');
const { alertIfMisconfigured } = require('./_lib/config-check');

module.exports = withSentry(async (req, res) => {
  if (!(await requireCronSecret(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Avisa (a Sentry, que te llega por mail) si falta o está mal alguna variable de seguridad en Vercel; nunca frena el envío.
  await alertIfMisconfigured(reportSecurityEvent).catch(() => {});

  webpush.setVapidDetails(
    'mailto:info@zancada.org',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    // Sin este chequeo, cuando Supabase devuelve un error (rate limit, timeout, etc.) la
    // REST API responde con un OBJETO ({code, message, ...}) en vez del array esperado --
    // (subs || []) no lo detecta porque ese objeto es truthy, así que .forEach/for...of
    // reventaban más abajo con un TypeError que no decía nada del problema real (Sentry
    // reportó justamente eso: "forEach is not a function" / "is not iterable", dos veces,
    // sin ninguna pista de qué había fallado). Mismo chequeo que ya tienen sync-strava.js/
    // strava-sync-now.js/polar-sync-now.js/wahoo-sync-now.js.
    // Auditoría de costos: antes pedía "data" completo (historial de carreras, toda la charla
    // con Zonda, perfil entero) de CADA usuario, cada hora, solo para leer estos 4 campos
    // chicos. PostgREST permite pedir subcampos de una columna JSON directo en el select
    // (data->plan, data->>weekStart, etc.), así que el resto de "data" ni sale de la base --
    // mismo comportamiento exacto de acá para abajo, mucho menos ancho de banda/lectura.
    // Consultas dirigidas (antes: TODA la tabla app_state, de todos los usuarios, cada hora, para después descartar en JS a
    // los que no tienen notificaciones activadas). Primero las suscripciones (una fila chica por usuario con push), y recién
    // después el plan de ESOS usuarios, de a lotes por id.
    // Paginado y ordenado: PostgREST corta en ~1000 filas por pedido, y sin esto los usuarios de más allá de la fila 1000 nunca recibían avisos.
    const SUBS_PAGE = 1000;
    const subs = [];
    for (let off = 0; ; off += SUBS_PAGE) {
      const subsRes = await fetch(`${base}/rest/v1/push_subscriptions?select=*&order=user_id&limit=${SUBS_PAGE}&offset=${off}`, { headers });   // select=*: funciona antes y después de agregar device_id
      if (!subsRes.ok) {
        const body = await subsRes.text().catch(() => '');
        throw new Error(`push_subscriptions fetch failed: ${subsRes.status} ${body}`);
      }
      const page = await subsRes.json();
      if (!Array.isArray(page)) throw new Error('push_subscriptions fetch failed: respuesta no es una lista');
      subs.push(...page);
      if (page.length < SUBS_PAGE) break;
    }
    const subUserIds = (Array.isArray(subs) ? subs : []).map(x => x.user_id).filter(Boolean);
    const states = [];
    for (let i = 0; i < subUserIds.length; i += STATE_BATCH) {
      const ids = subUserIds.slice(i, i + STATE_BATCH).map(encodeURIComponent).join(',');
      const statesRes = await fetch(`${base}/rest/v1/app_state?user_id=in.(${ids})&select=user_id,plan:data->plan,weekStart:data->>weekStart,tz:data->profile->>tz,rh:data->profile->>reminderHour,lang:data->>lang,streak:data->>streakWeeks,units:data->profile->>units,trainBy:data->profile->>trainBy`, { headers });
      if (!statesRes.ok) {
        const body = await statesRes.text().catch(() => '');
        throw new Error(`app_state fetch failed: ${statesRes.status} ${body}`);
      }
      const chunk = await statesRes.json();
      if (Array.isArray(chunk)) states.push(...chunk);
    }
    const localClock = makeLocalClock();

    // Todos los dispositivos de cada cuenta (platform puede venir null en filas viejas: 'web' de fallback, ver sql/push_subscriptions_add_platform.sql).
    const subsByUser = pushDevices.groupByUser(subs);

    let sent = 0, skipped = 0, failed = 0;
    const due = [];
    const nudges = [];   // a quién le toca el aviso de la noche "hoy tenías salida y todavía no aparece cargada" (20:00 hora local)
    const weekly = [];   // a quién le toca el resumen semanal (domingo, en el turno fijo de cada uno entre las 19:00 y las 23:30, hora local; con sesión planeada el domingo, al final de la noche)
    for (const row of (states || [])) {
     try {
      const subRow = subsByUser[row.user_id];
      if (!subRow) { skipped++; continue; }
      const wClock = localClock(row.tz || DEFAULT_TZ);
      if (wClock.dayIdx === 6) {
        const wtz = row.tz || DEFAULT_TZ, wNow = Date.now();
        const slot = currentWeeklySlot(wClock.hour, wClock.minute);
        const pending = sundayPending(row.plan, row.weekStart, wtz, wNow);
        // candidato = ya le corresponde (su turno o uno posterior: reintento); más abajo se descartan los que ya recibieron y, si no hay
        // registro de enviados, se vuelve a "solo en su turno exacto"
        if (isWeeklyDue(row.user_id, slot, pending)) weekly.push({ row, subRow, period: mondayKeyFor(wNow, wtz), exact: isWeeklySlot(row.user_id, wClock.hour, wClock.minute, pending) });
      }
      // si el corredor eligió justo la hora del aviso de la noche como hora de su recordatorio diario, ya recibe "Hoy toca..." a esa hora: el aviso de "no apareció tu salida" saldría pegado y repetido
      const chosenForNudge = parseInt(row.rh, 10);
      if (nudge.isNudgeTime(wClock.hour, wClock.minute) && !(Number.isInteger(chosenForNudge) && nudge.isNudgeTime(chosenForNudge, 0))) {
        const ntz = row.tz || DEFAULT_TZ;
        const nSession = nudge.sessionDueToday(row.plan, row.weekStart, nudge.mondayOf(Date.now(), ntz, wClock.dayIdx), wClock.dayIdx);
        if (nSession) nudges.push({ row, subRow, tz: ntz, session: nSession });
      }
      const plan = row.plan;
      if (!plan || !plan.length) { skipped++; continue; }

      // El plan guardado se actualiza a la semana real desde el cliente (checkWeekRollover()
      // en app.js), no acá -- si alguien no abrió la app en mucho tiempo (o la dejó "viva" en
      // segundo plano sin que se re-ejecute ese chequeo, bug reportado por un usuario), lo que
      // tenemos guardado puede seguir siendo el plan de una semana vieja. plan[dayIdx] seguiría
      // devolviendo ALGO, pero podría ser un descanso donde hoy en realidad toca entrenar, o
      // al revés -- mejor no mandar nada antes que mandar un aviso equivocado. 10 días de
      // margen (no 7 justos) para no cortar por un caso límite de huso horario.
      if (row.weekStart) {
        const staleMs = Date.now() - new Date(row.weekStart + 'T00:00:00Z').getTime();
        if (staleMs > 10 * 86400000) { skipped++; continue; }
      }

      const tz = row.tz || DEFAULT_TZ;
      const { hour, minute, dayIdx } = localClock(tz);
      // Cada corredor puede elegir la hora del aviso en Perfil (profile.reminderHour, 0-23); sin elegir, las 8.
      const chosen = parseInt(row.rh, 10);
      const wantHour = Number.isInteger(chosen) && chosen >= 0 && chosen <= 23 ? chosen : REMINDER_HOUR;
      // El cron corre cada 30 minutos: de las dos corridas de cada hora, el recordatorio diario sale solo en la que cae en la primera
      // mitad de la hora LOCAL del corredor (siempre hay exactamente una, también en husos con :30 o :45), si no llegaría duplicado.
      if (hour !== wantHour || minute >= 30) { skipped++; continue; } // todavía no es la hora elegida en el huso de ESTE usuario

      // sessionDueToday exige que el plan guardado sea el de ESTA semana (weekStart == lunes actual en el huso del corredor): antes bastaba con que tuviera menos de 10 días, y
      // quien no abrió la app el lunes recibía el "Hoy toca" con la sesión del mismo día de la semana PASADA. Además descarta el descanso y la sesión ya resuelta
      // (today.dist sigue siendo el km planeado aunque ya esté 'done'): no molestamos.
      const today = nudge.sessionDueToday(plan, row.weekStart, nudge.mondayOf(Date.now(), tz, dayIdx), dayIdx);
      if (!today) { skipped++; continue; }

      const lang = ownKey(MSGS, row.lang, 'es');
      const typeLabel = today.custom ? String(today.type) : (pick(MSGS[lang].types, today.typeKey, '__none__') || String(today.typeKey));
      const body = MSGS[lang].body(nudge.describeSession(today, typeLabel, row.units === 'imperial', row.trainBy === 'time'));

      due.push({ row, subRow, body });
     } catch (rowErr) {
      // los datos de app_state los escribe cada cuenta con su propio JWT: una fila rara se salta, nunca aborta a las demás
      failed++;
      console.error('send-reminders: fila omitida por datos inválidos', row && row.user_id, rowErr && rowErr.message);
     }
    }

    // El envío (una llamada de red por usuario) va en paralelo, de a SEND_CONCURRENCY: a las 8 am de un huso populoso pueden
    // juntarse cientos de avisos en la misma corrida y, de a uno, la función se quedaba sin tiempo antes de terminar.
    // Manda a TODOS los dispositivos de la cuenta. 'sent' si llegó a alguno; 'dead' si todos estaban muertos (se borra solo esa fila); 'failed' si no llegó a
    // ninguno y alguno falló por algo pasajero (red, servicio de push): se puede reintentar.
    async function sendOne({ row, subRow, body, title }) {
      title = title || 'Zancada';
      let anySent = false, anyTransient = false;
      for (const dev of subRow.devices) {
        try {
          if (dev.platform === 'android' || dev.platform === 'ios') {
            // App nativa (Capacitor) -- acá subscription es {token: '<token de FCM>'}, no una
            // suscripción Web Push (ver sql/push_subscriptions_add_platform.sql y api/_lib/fcm.js).
            const dead = await sendFcmPush(dev.subscription && dev.subscription.token, title, body);
            if (dead) { await pushDevices.deleteDevice(base, headers, row.user_id, dev.device_id); continue; }
          } else {
            // el endpoint lo escribe el cliente: solo se le manda a los servicios de push reales (evita SSRF a ciegas)
            if (!dev.subscription || !isTrustedPushEndpoint(dev.subscription.endpoint)) continue;
            await webpush.sendNotification(dev.subscription, JSON.stringify({ title, body }));
          }
          anySent = true;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) await pushDevices.deleteDevice(base, headers, row.user_id, dev.device_id);
          else anyTransient = true;
        }
      }
      if (anySent) { sent++; return 'sent'; }
      failed++;
      return anyTransient ? 'failed' : 'dead';
    }
    let nextDue = 0;
    const workers = Array.from({ length: Math.min(SEND_CONCURRENCY, due.length) }, async () => {
      while (nextDue < due.length) { await sendOne(due[nextDue++]); }
    });
    await Promise.all(workers);

    // Resumen semanal. El historial de carreras es pesado (puntos GPS), así que solo se pide para quienes les toca.
    // Con el registro de enviados (sql/sent_notifications.sql): a cada candidato se le "reclama" el aviso antes de mandarlo, así que una
    // corrida caída o sin tiempo se recupera en la siguiente (a los 30 minutos) y nunca se manda dos veces. Sin la tabla, vuelve a
    // funcionar solo en el turno exacto de cada usuario.
    let weeklySent = 0, weeklyRetried = 0, registryOk = true;
    const KIND = 'weekly_summary';
    let toSend = weekly;
    if (weekly.length) {
      const byPeriod = new Map();
      weekly.forEach(w => { if (!byPeriod.has(w.period)) byPeriod.set(w.period, []); byPeriod.get(w.period).push(w); });
      const pending = [];
      for (const [period, list] of byPeriod) {
        const already = await sentRegistry.fetchSent(base, headers, KIND, period, list.map(w => w.row.user_id));
        if (already === null) { registryOk = false; break; }
        list.forEach(w => { if (!already.has(w.row.user_id)) pending.push(w); });
      }
      toSend = registryOk ? pending : weekly.filter(w => w.exact);
      if (!registryOk) console.warn('send-reminders: tabla sent_notifications no disponible; resumen semanal solo en el turno exacto (sin reintentos)');
      // limpieza: cada domingo, en la primera corrida de la franja, se borran los registros de más de 60 días
      if (registryOk && currentWeeklySlot(localClock(DEFAULT_TZ).hour, localClock(DEFAULT_TZ).minute) === 0) await sentRegistry.pruneOld(base, headers, 60);
    }
    async function sendWeekly({ row, subRow, period, exact }) {
      let claimed = false;
      try {
        if (registryOk) {
          const c = await sentRegistry.claim(base, headers, row.user_id, KIND, period);
          if (c === false) return;                 // otra corrida ya lo reclamó
          claimed = c === true;
        }
        const rRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${row.user_id}&select=runs:data->runs`, { headers });
        if (!rRes.ok) { if (claimed) await sentRegistry.release(base, headers, row.user_id, KIND, period); failed++; return; }
        const rows = await rRes.json();
        const runs = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].runs) ? rows[0].runs : [];
        const msg = buildWeeklySummary({
          runs, plan: row.plan, weekStart: row.weekStart, streak: row.streak, tz: row.tz || DEFAULT_TZ,
          lang: ownKey(MSGS, row.lang, 'es'), imperial: row.units === 'imperial', now: Date.now()
        });
        if (!msg) return;                          // sin salidas esta semana: queda registrado como atendido, no se vuelve a evaluar
        const r = await sendOne({ row, subRow, body: msg.body, title: msg.title });
        if (r === 'sent') { weeklySent++; if (!exact) weeklyRetried++; }
        else if (r === 'failed' && claimed) await sentRegistry.release(base, headers, row.user_id, KIND, period);   // pasajera: se reintenta
      } catch (e) {
        failed++;
        if (claimed) await sentRegistry.release(base, headers, row.user_id, KIND, period);
      }
    }
    // Tope de tiempo (la función serverless no puede pasarse): los que no alcanzan quedan sin reclamar y los toma la próxima corrida.
    const weeklyStart = Date.now();
    let nextWeekly = 0;
    await Promise.all(Array.from({ length: Math.min(8, toSend.length) }, async () => {
      while (nextWeekly < toSend.length && Date.now() - weeklyStart < 6000) { await sendWeekly(toSend[nextWeekly++]); }
    }));
    const weeklyPending = Math.max(0, toSend.length - nextWeekly);
    if (weeklyPending) console.warn('send-reminders: resumen semanal sin enviar por falta de tiempo (se reintenta en la próxima corrida):', weeklyPending);

    // Aviso de la noche: solo a quien no tiene ninguna carrera hoy. La pregunta va a la base (has_run_between, sql/has_run_between.sql); si esa función
    // no existe o falla, no se manda nada. Un aviso por persona por día (registro de enviados); tope de tiempo como el resumen semanal.
    let nudgeSent = 0;
    async function sendNudge({ row, subRow, tz, session }) {
      const now = Date.now();
      const win = nudge.localDayWindow(tz, now);
      const ran = await nudge.hasRunToday(base, headers, row.user_id, win);
      if (ran !== false) return;                  // ya corrió hoy, o no se pudo saber: no molestamos
      let claimed = false;
      if (registryOk) {
        const c = await sentRegistry.claim(base, headers, row.user_id, 'missing_run', win.dayKey);
        if (c === false) return;                  // ya se le mandó hoy
        claimed = c === true;
      }
      const lang = ownKey(MSGS, row.lang, 'es');
      const typeLabel = session.custom ? String(session.type) : (pick(MSGS[lang].types, session.typeKey, '__none__') || String(session.typeKey));
      const msg = nudge.buildNudge(lang, nudge.describeSession(session, typeLabel, row.units === 'imperial', row.trainBy === 'time'));
      const r = await sendOne({ row, subRow, body: msg.body, title: msg.title });
      if (r === 'sent') nudgeSent++;
      else if (r === 'failed' && claimed) await sentRegistry.release(base, headers, row.user_id, 'missing_run', win.dayKey);
    }
    const nudgeStart = Date.now();
    let nextNudge = 0;
    await Promise.all(Array.from({ length: Math.min(8, nudges.length) }, async () => {
      while (nextNudge < nudges.length && Date.now() - nudgeStart < 5000) {
        try { await sendNudge(nudges[nextNudge++]); } catch (e) { failed++; console.error('send-reminders: aviso de la noche', e && e.message); }
      }
    }));

    res.status(200).json({ sent, skipped, failed, nudgeSent, weeklySent, weeklyRetried, weeklyPending, weeklyRegistry: registryOk });
  } catch (err) {
    console.error('send-reminders error', err);
    await reportError(err, { endpoint: 'send-reminders' });
    res.status(500).json({ error: 'Internal error' });
  }
});
