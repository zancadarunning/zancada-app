const webpush = require('web-push');
const requireCronSecret = require('./_lib/require-cron-secret');

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
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour:'numeric', hour12:false, weekday:'short' }).formatToParts(new Date());
    let hour = null, weekday = null;
    for(const p of parts){
      if(p.type === 'hour') hour = parseInt(p.value, 10) % 24; // Intl puede devolver "24" para la medianoche en vez de "0"
      if(p.type === 'weekday') weekday = p.value;
    }
    if(hour === null || !(weekday in WEEKDAY_IDX)) throw new Error('huso horario inválido: ' + tz);
    return { hour, dayIdx: WEEKDAY_IDX[weekday] };
  }catch(e){
    // tz guardado mal o directamente desconocido para Intl -- mejor caer al default
    // que reventar el envío de TODOS los demás usuarios en esta corrida.
    if(tz === DEFAULT_TZ) return { hour: -1, dayIdx: 0 }; // corta la recursión si hasta el default fallara
    return localHourAndDayIdx(DEFAULT_TZ);
  }
}

// Mensajes cortos por idioma — no necesita el diccionario completo de la app.
const MSGS = {
  es: { types:{easy:'Rodaje suave',intervals:'Series',tempo:'Ritmo medio',long:'Tirada larga'}, body:(type,km)=>`Hoy toca: ${type} · ${km}km` },
  en: { types:{easy:'Easy run',intervals:'Intervals',tempo:'Tempo run',long:'Long run'}, body:(type,km)=>`Today: ${type} · ${km}km` },
  pt: { types:{easy:'Corrida leve',intervals:'Tiros',tempo:'Ritmo médio',long:'Longão'}, body:(type,km)=>`Hoje: ${type} · ${km}km` },
  fr: { types:{easy:'Footing',intervals:'Fractionné',tempo:'Allure soutenue',long:'Sortie longue'}, body:(type,km)=>`Aujourd'hui : ${type} · ${km}km` },
  it: { types:{easy:'Corsa lenta',intervals:'Ripetute',tempo:'Ritmo medio',long:'Lungo'}, body:(type,km)=>`Oggi: ${type} · ${km}km` },
  de: { types:{easy:'Lockerer Lauf',intervals:'Intervalle',tempo:'Tempolauf',long:'Langer Lauf'}, body:(type,km)=>`Heute: ${type} · ${km}km` }
};

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  if (!requireCronSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
    const statesRes = await fetch(`${base}/rest/v1/app_state?select=user_id,data`, { headers });
    if (!statesRes.ok) {
      const body = await statesRes.text().catch(() => '');
      throw new Error(`app_state fetch failed: ${statesRes.status} ${body}`);
    }
    const states = await statesRes.json();
    const subsRes = await fetch(`${base}/rest/v1/push_subscriptions?select=user_id,subscription`, { headers });
    if (!subsRes.ok) {
      const body = await subsRes.text().catch(() => '');
      throw new Error(`push_subscriptions fetch failed: ${subsRes.status} ${body}`);
    }
    const subs = await subsRes.json();

    const subsByUser = {};
    (subs || []).forEach(s => { subsByUser[s.user_id] = s.subscription; });

    let sent = 0, skipped = 0, failed = 0;
    for (const row of (states || [])) {
      const sub = subsByUser[row.user_id];
      if (!sub) { skipped++; continue; }
      const data = row.data || {};
      const plan = data.plan;
      if (!plan || !plan.length) { skipped++; continue; }

      // El plan guardado se actualiza a la semana real desde el cliente (checkWeekRollover()
      // en app.js), no acá -- si alguien no abrió la app en mucho tiempo (o la dejó "viva" en
      // segundo plano sin que se re-ejecute ese chequeo, bug reportado por un usuario), lo que
      // tenemos guardado puede seguir siendo el plan de una semana vieja. plan[dayIdx] seguiría
      // devolviendo ALGO, pero podría ser un descanso donde hoy en realidad toca entrenar, o
      // al revés -- mejor no mandar nada antes que mandar un aviso equivocado. 10 días de
      // margen (no 7 justos) para no cortar por un caso límite de huso horario.
      if (data.weekStart) {
        const staleMs = Date.now() - new Date(data.weekStart + 'T00:00:00Z').getTime();
        if (staleMs > 10 * 86400000) { skipped++; continue; }
      }

      const tz = (data.profile && data.profile.tz) || DEFAULT_TZ;
      const { hour, dayIdx } = localHourAndDayIdx(tz);
      if (hour !== REMINDER_HOUR) { skipped++; continue; } // todavía no son las 8am en el huso de ESTE usuario

      const today = plan[dayIdx];
      // today.dist sigue siendo el km planeado aunque la sesión ya se haya marcado 'done'
      // (autoMarkSessionDone en app.js no toca d.dist) -- sin chequear status, alguien que
      // entrena temprano y ya terminó su sesión antes de las 8am igual recibía el recordatorio
      // "Hoy toca: ..." como si no hubiera corrido todavía.
      if (!today || !today.dist || today.status) { skipped++; continue; } // día de descanso o sesión ya resuelta, no molestamos

      const lang = MSGS[data.lang] ? data.lang : 'es';
      const typeLabel = today.custom ? today.type : (MSGS[lang].types[today.typeKey] || today.typeKey);
      const body = MSGS[lang].body(typeLabel, today.dist);

      try {
        await webpush.sendNotification(sub, JSON.stringify({ title: 'Zancada', body }));
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 404 || err.statusCode === 410) {
          await fetch(`${base}/rest/v1/push_subscriptions?user_id=eq.${row.user_id}`, { method: 'DELETE', headers });
        }
      }
    }

    res.status(200).json({ sent, skipped, failed });
  } catch (err) {
    console.error('send-reminders error', err);
    await reportError(err, { endpoint: 'send-reminders' });
    res.status(500).json({ error: err.message });
  }
});
