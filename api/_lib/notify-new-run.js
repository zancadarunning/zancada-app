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
const { isTrustedPushEndpoint } = require('./push-endpoint');

const BRANDS = { suunto: 'Suunto', wahoo: 'Wahoo', coros: 'COROS', polar: 'Polar', strava: 'Strava' };
const MAX_AGE_MS = 36 * 3600 * 1000;   // solo entrenos recientes: un reenvío o un relleno de historial viejo no avisa
const MI_PER_KM = 0.621371;

const TEXTS = {
  es: { title: 'Entrenamiento cargado', one: (b, d, t, p) => `Cargamos tu carrera de ${b}: ${d} · ${t} · ${p}. Ya está en tu Historial.`, many: (n, b, d) => `Cargamos ${n} entrenamientos de ${b} (${d} en total). Ya están en tu Historial.` },
  en: { title: 'Workout loaded', one: (b, d, t, p) => `We loaded your ${b} run: ${d} · ${t} · ${p}. It's in your History.`, many: (n, b, d) => `We loaded ${n} workouts from ${b} (${d} in total). They're in your History.` },
  pt: { title: 'Treino carregado', one: (b, d, t, p) => `Carregamos sua corrida do ${b}: ${d} · ${t} · ${p}. Já está no seu Histórico.`, many: (n, b, d) => `Carregamos ${n} treinos do ${b} (${d} no total). Já estão no seu Histórico.` },
  fr: { title: 'Séance chargée', one: (b, d, t, p) => `Nous avons chargé ta course ${b} : ${d} · ${t} · ${p}. Elle est dans ton Historique.`, many: (n, b, d) => `Nous avons chargé ${n} séances ${b} (${d} au total). Elles sont dans ton Historique.` },
  it: { title: 'Allenamento caricato', one: (b, d, t, p) => `Abbiamo caricato la tua corsa da ${b}: ${d} · ${t} · ${p}. È nel tuo Storico.`, many: (n, b, d) => `Abbiamo caricato ${n} allenamenti da ${b} (${d} in totale). Sono nel tuo Storico.` },
  de: { title: 'Training geladen', one: (b, d, t, p) => `Wir haben deinen Lauf von ${b} geladen: ${d} · ${t} · ${p}. Er ist in deinem Verlauf.`, many: (n, b, d) => `Wir haben ${n} Trainings von ${b} geladen (${d} insgesamt). Sie sind in deinem Verlauf.` }
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
function buildMessage(runs, source, lang, imperial) {
  const T = TEXTS[lang] || TEXTS.es;
  const brand = BRANDS[source] || 'tu reloj';
  if (runs.length === 1) {
    const r = runs[0];
    return { title: T.title, body: T.one(brand, fmtDist(r.distanceKm || 0, imperial), fmtTime(r.durationSec || 0), fmtPace(r.durationSec, r.distanceKm, imperial)) };
  }
  const total = runs.reduce((a, r) => a + (r.distanceKm || 0), 0);
  return { title: T.title, body: T.many(runs.length, brand, fmtDist(total, imperial)) };
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
  const subRes = await fetch(`${base}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=subscription,platform`, { headers });
  const subs = subRes.ok ? await subRes.json() : [];
  if (!Array.isArray(subs) || !subs.length) return false;   // sin notificaciones activadas
  const sub = subs[0];
  const platform = sub.platform || 'web';
  try {
    if (platform === 'android' || platform === 'ios') {
      const dead = await sendFcmPush(sub.subscription && sub.subscription.token, message.title, message.body, { tag });
      if (dead) await fetch(`${base}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE', headers });
      return !dead;
    }
    if (!sub.subscription || !isTrustedPushEndpoint(sub.subscription.endpoint)) return false;
    const webpush = require('web-push');
    webpush.setVapidDetails('mailto:info@zancada.org', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    await webpush.sendNotification(sub.subscription, JSON.stringify({ title: message.title, body: message.body, tag }));
    return true;
  } catch (err) {
    if (err && (err.statusCode === 404 || err.statusCode === 410)) {
      await fetch(`${base}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE', headers }).catch(() => {});
    }
    return false;
  }
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
    const stRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${encodeURIComponent(userId)}&select=lang:data->>lang,units:data->profile->>units`, { headers });
    const st = stRes.ok ? await stRes.json() : [];
    const lang = st && st[0] && st[0].lang, imperial = !!(st && st[0] && st[0].units === 'imperial');
    const msg = buildMessage(added, source, lang, imperial);
    // misma "etiqueta" para todo entreno nuevo del usuario: si llega por dos marcas a la vez (Suunto y Strava), la segunda reemplaza
    // a la primera en vez de apilarse
    await pushToUser(base, headers, userId, msg, 'zancada-run-import');
  })().catch(e => console.error('notify-new-run:', e && e.message));
  await Promise.race([notify, new Promise(r => setTimeout(r, budgetMs || 3000))]);
  return result;
}

module.exports = { mergeAndNotify, buildMessage, fmtPace, fmtTime, fmtDist };
