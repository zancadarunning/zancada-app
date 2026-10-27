// api/_lib/notify-new-run.js
//
// Avisa por notificación al celular cuando aparece en Zancada un entrenamiento traído desde un reloj (Suunto, Wahoo, COROS, Polar
// o Strava): "Entrenamiento cargado -- 8.00 km · 48:48 · 6:06/km". Se usa SOLO en las vías automáticas (webhooks y crons), que son
// las que corren cuando el corredor no está mirando la app; las vías "sincronizar ahora" las dispara el propio usuario desde la
// app y ya ve el resultado en pantalla.
//
// Cómo sabe que la carrera es nueva sin leer el historial entero (puede pesar varios MB por los puntos GPS): le pregunta a la base
// "¿esta carrera ya está guardada?" con un filtro de contención de JSON (data=cs.{"runs":[{"id":...}]}), antes y después del merge.
// Si antes no estaba y después sí, es nueva (si el merge la descartó por duplicada -- ya llegó por otra marca -- no avisa).
//
// Nunca rompe la sincronización: cualquier error acá se traga (la notificación es un extra).

const { sendFcmPush } = require('./fcm');
const pushDevices = require('./push-devices');
const { isTrustedPushEndpoint } = require('./push-endpoint');
const { pick } = require('./own');
const { localDateKey, dayNum } = require('./weekly-summary');

const BRANDS = { suunto: 'Suunto', wahoo: 'Wahoo', coros: 'COROS', polar: 'Polar', strava: 'Strava' };
const MAX_AGE_MS = 36 * 3600 * 1000;   // solo entrenos recientes: un reenvío o un relleno de historial viejo no avisa
const MI_PER_KM = 0.621371;
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';   // mismo respaldo que send-reminders.js para cuentas sin profile.tz

const TEXTS = {
  es: { plan: (p, pct) => `Plan del día: ${p} (hiciste el ${pct}%).`, title: 'Entrenamiento cargado', one: (b, d, t, p) => `Cargamos tu carrera de ${b}: ${d} · ${t} · ${p}. Ya está en tu Historial.`, many: (n, b, d) => `Cargamos ${n} entrenamientos de ${b} (${d} en total). Ya están en tu Historial.` },
  en: { plan: (p, pct) => `Today's plan: ${p} (you did ${pct}%).`, title: 'Workout loaded', one: (b, d, t, p) => `We loaded your ${b} run: ${d} · ${t} · ${p}. It's in your History.`, many: (n, b, d) => `We loaded ${n} workouts from ${b} (${d} in total). They're in your History.` },
  pt: { plan: (p, pct) => `Plano do dia: ${p} (você fez ${pct}%).`, title: 'Treino carregado', one: (b, d, t, p) => `Carregamos sua corrida do ${b}: ${d} · ${t} · ${p}. Já está no seu Histórico.`, many: (n, b, d) => `Carregamos ${n} treinos do ${b} (${d} no total). Já estão no seu Histórico.` },
  fr: { plan: (p, pct) => `Plan du jour : ${p} (tu as fait ${pct} %).`, title: 'Séance chargée', one: (b, d, t, p) => `Nous avons chargé ta course ${b} : ${d} · ${t} · ${p}. Elle est dans ton Historique.`, many: (n, b, d) => `Nous avons chargé ${n} séances ${b} (${d} au total). Elles sont dans ton Historique.` },
  it: { plan: (p, pct) => `Piano del giorno: ${p} (hai fatto il ${pct}%).`, title: 'Allenamento caricato', one: (b, d, t, p) => `Abbiamo caricato la tua corsa da ${b}: ${d} · ${t} · ${p}. È nel tuo Storico.`, many: (n, b, d) => `Abbiamo caricato ${n} allenamenti da ${b} (${d} in totale). Sono nel tuo Storico.` },
  de: { plan: (p, pct) => `Plan für heute: ${p} (du hast ${pct} % geschafft).`, title: 'Training geladen', one: (b, d, t, p) => `Wir haben deinen Lauf von ${b} geladen: ${d} · ${t} · ${p}. Er ist in deinem Verlauf.`, many: (n, b, d) => `Wir haben ${n} Trainings von ${b} geladen (${d} insgesamt). Sie sind in deinem Verlauf.` }
};

function fmtDist(km, imperial) {
  const v = imperial ? km * MI_PER_KM : km;
  return v.toFixed(2) + (imperial ? ' mi' : ' km');
}
function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(r).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function fmtPace(durationSec, km, imperial) {
  const dist = imperial ? km * MI_PER_KM : km;
  if (!(dist > 0) || !(durationSec > 0)) return '--:--';
  const perUnit = durationSec / dist;
  const m = Math.floor(perUnit / 60), s = Math.round(perUnit % 60);
  const mm = s === 60 ? m + 1 : m, ss = s === 60 ? 0 : s;
  return `${mm}:${String(ss).padStart(2, '0')}/${imperial ? 'mi' : 'km'}`;
}

// Arma título y cuerpo para una o varias carreras nuevas. Función pura (se prueba aparte).
// planInfo (opcional, solo para una carrera): lo que el plan decía para ESE día, de planFor(). Se agrega como segunda frase.
function buildMessage(runs, source, lang, imperial, planInfo) {
  const T = pick(TEXTS, lang, 'es');
  const brand = BRANDS[source] || 'tu reloj';
  if (runs.length === 1) {
    const r = runs[0];
    let body = T.one(brand, fmtDist(r.distanceKm || 0, imperial), fmtTime(r.durationSec || 0), fmtPace(r.durationSec, r.distanceKm, imperial));
    if (planInfo && planInfo.planned > 0) {
      const planned = planInfo.timeMode ? Math.round(planInfo.planned) + ' min' : fmtDist(planInfo.planned, imperial);
      const pct = Math.min(999, Math.max(0, Math.round(planInfo.actual / planInfo.planned * 100)));
      body += ' ' + T.plan(planned, pct);
    }
    return { title: T.title, body };
  }
  const total = runs.reduce((a, r) => a + (r.distanceKm || 0), 0);
  return { title: T.title, body: T.many(runs.length, brand, fmtDist(total, imperial)) };
}

// Qué decía el plan para el día (en su huso horario) en que se hizo la carrera. Solo se compara si ese día cae en la semana del plan guardado
// (weekStart = lunes) y tenía sesión planeada; un día de descanso o un plan viejo no se comenta. Los números salen del estado de la
// persona (lo escribe ella): se leen como número y solo eso llega al texto.
// La sesión del plan se corre CON entrada en calor y vuelta a la calma (el texto de la sesión lo indica y los relojes las traen como bloques): 3 min de movilidad + 10 de trote en las sesiones de
// calidad o + 5 en rodajes y tiradas, y 5 de vuelta a la calma. El número del plan es solo la parte principal, así que sin esto una carrera hecha tal cual daba "hiciste el 170%".
const QUALITY_TYPES = new Set(['intervals', 'tempo', 'fartlek', 'hills', 'progression', 'test']);
function warmCoolMin(d) { return typeof d.typeKey === 'string' && d.typeKey !== 'rest' ? (QUALITY_TYPES.has(d.typeKey) ? 13 : 8) + 5 : 0; }

function planFor(run, plan, weekStart, tz, timeMode) {
  if (!Array.isArray(plan) || !/^\d{4}-\d{2}-\d{2}$/.test(String(weekStart || ''))) return null;
  const runMs = new Date(run && run.date).getTime();
  if (!Number.isFinite(runMs)) return null;
  const idx = dayNum(localDateKey(runMs, tz || DEFAULT_TZ)) - dayNum(String(weekStart));
  if (!(idx >= 0 && idx <= 6)) return null;
  const d = plan[idx];
  if (!d || typeof d !== 'object') return null;
  if (timeMode) {
    const main = Number(d.durMin), actual = (Number(run.durationSec) || 0) / 60;
    const planned = main + (main > 0 ? warmCoolMin(d) : 0);
    return main > 0 && planned < 1000 ? { timeMode: true, planned, actual } : null;
  }
  const main = Number(d.dist), actual = Number(run.distanceKm) || 0;
  // en distancia, los minutos de calentamiento y vuelta a la calma se pasan a km con el ritmo medio de la propia carrera (si es creíble)
  const paceMinPerKm = actual > 0 ? ((Number(run.durationSec) || 0) / 60) / actual : 0;
  const extraKm = main > 0 && paceMinPerKm >= 2 && paceMinPerKm <= 20 ? Math.round((warmCoolMin(d) / paceMinPerKm) * 10) / 10 : 0;
  const planned = main + extraKm;
  return main > 0 && planned < 1000 ? { timeMode: false, planned, actual } : null;
}

async function runExists(base, headers, userId, runId) {
  // (URL armada por concatenación: el filtro ya va escapado con encodeURIComponent)
  const filter = encodeURIComponent(JSON.stringify({ runs: [{ id: runId }] }));
  const res = await fetch(base + '/rest/v1/app_state?user_id=eq.' + encodeURIComponent(userId) + '&data=cs.' + filter + '&select=user_id', { headers });
  if (!res.ok) throw new Error('exists check failed ' + res.status);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function pushToUser(base, headers, userId, message, tag) {
  const subRes = await fetch(`${base}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*`, { headers });
  const subs = subRes.ok ? await subRes.json() : [];
  if (!Array.isArray(subs) || !subs.length) return false;   // sin notificaciones activadas
  // a TODOS los dispositivos de la cuenta (sin repetir el mismo destino)
  const devices = (pushDevices.groupByUser(subs.map(s => ({ ...s, user_id: userId }))) [userId] || { devices: [] }).devices;
  let anySent = false;
  for (const dev of devices) {
    try {
      if (dev.platform === 'android' || dev.platform === 'ios') {
        const dead = await sendFcmPush(dev.subscription && dev.subscription.token, message.title, message.body, { tag });
        if (dead) await pushDevices.deleteDevice(base, headers, userId, dev.device_id);
        else anySent = true;
        continue;
      }
      if (!dev.subscription || !isTrustedPushEndpoint(dev.subscription.endpoint)) continue;
      const webpush = require('web-push');
      webpush.setVapidDetails('mailto:info@zancada.org', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
      await webpush.sendNotification(dev.subscription, JSON.stringify({ title: message.title, body: message.body, tag }), { timeout: 10000 });
      anySent = true;
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) await pushDevices.deleteDevice(base, headers, userId, dev.device_id);
    }
  }
  return anySent;
}

// Hace el merge de siempre (mergeFn) y, si dejó carreras nuevas y recientes, manda la notificación. Devuelve lo que devuelva mergeFn.
// budgetMs: tiempo máximo que puede sumar el aviso (el webhook de Suunto tiene que responder en menos de 2 s).
async function mergeAndNotify(mergeFn, base, headers, userId, runs, mode, source, budgetMs) {
  const now = Date.now();
  const candidates = (runs || []).filter(r => r && r.id && now - new Date(r.date).getTime() <= MAX_AGE_MS).slice(0, 5);
  let fresh = [];
  try {
    for (const r of candidates) { if (!(await runExists(base, headers, userId, r.id))) fresh.push(r); }
  } catch (e) { fresh = []; }

  const result = await mergeFn(base, headers, userId, runs, mode);
  if (!fresh.length) return result;

  const notify = (async () => {
    const added = [];
    for (const r of fresh) { if (await runExists(base, headers, userId, r.id)) added.push(r); }
    if (!added.length) return;
    const stRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${encodeURIComponent(userId)}&select=lang:data->>lang,units:data->profile->>units,tz:data->profile->>tz,trainBy:data->profile->>trainBy,weekStart:data->>weekStart,plan:data->plan`, { headers });
    const st = stRes.ok ? await stRes.json() : [];
    const lang = st && st[0] && st[0].lang, imperial = !!(st && st[0] && st[0].units === 'imperial');
    const planInfo = added.length === 1 && st && st[0] ? planFor(added[0], st[0].plan, st[0].weekStart, st[0].tz, st[0].trainBy === 'time') : null;
    const msg = buildMessage(added, source, lang, imperial, planInfo);
    // misma "etiqueta" para todo entreno nuevo del usuario: si llega por dos marcas a la vez (Suunto y Strava), la segunda reemplaza
    // a la primera en vez de apilarse
    await pushToUser(base, headers, userId, msg, 'zancada-run-import');
  })().catch(e => console.error('notify-new-run:', e && e.message));
  await Promise.race([notify, new Promise(r => setTimeout(r, budgetMs || 3000))]);
  return result;
}

module.exports = { mergeAndNotify, buildMessage, planFor, fmtPace, fmtTime, fmtDist };
