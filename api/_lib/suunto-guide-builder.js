// api/_lib/suunto-guide-builder.js
//
// Convierte una sesión del plan de Zancada en una "SuuntoPlus Guide" (el formato con el que
// Suunto muestra entrenamientos estructurados en el reloj: pasos, repeticiones, objetivos de
// pulso). Formato según apizone.suunto.com/suuntoplus-guide-description (octubre 2026):
//   - un ZIP con guide.json + icon.png (300x300);
//   - type "sequence", usage "workout", steps de tipo "fields" o "repeat" (sin repeats
//     anidados);
//   - los pasos terminan por "transitions" (stepDuration en segundos, stepDistance en metros);
//   - targetHeartRate usa bpm enteros.
//
// Límites que se respetan acá (truncado, no error): name 1-60, description 1-256,
// shortDescription 1-23, owner 1-64, url 1-256, externalId 1-64, título de paso 1-13, título
// de campo <9, text 1-54, notification.title 1-13 / text 1-54, repeat.times 1-100, steps 1-1000.
// El reloj solo garantiza ASCII + "°": los textos que se ven EN EL RELOJ se pasan a ASCII sin
// tildes (los que se ven en la app -- name, description, richText -- conservan los acentos).

const { createZip } = require('./zip-store');
const ICON_PNG = require('./suunto-guide-icon');

const RUNNING_ACTIVITY = 1;

function clip(s, max) { return String(s == null ? '' : s).slice(0, max); }

// Sin tildes ni caracteres fuera de ASCII imprimible (el reloj los ignoraría o mostraría un
// ícono). "ñ" -> "n", "ü" -> "u", etc.
function watchText(s, max) {
  const ascii = String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return ascii.slice(0, max);
}

function posInt(n, min, max, fallback) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function hrTarget(zones, zone) {
  const z = zones && zones[zone];
  if (!z) return null;
  const min = posInt(z.min, 30, 250, null), max = posInt(z.max, 30, 250, null);
  if (min == null || max == null || max < min) return null;
  return { type: 'targetHeartRate', min, max, title: 'tgt HR' };
}

function fieldsStep(title, fields, transitions, notificationText) {
  const step = { type: 'fields', title: watchText(title, 13) || 'Step', fields: fields.filter(Boolean) };
  if (transitions && transitions.length) step.transitions = transitions;
  if (notificationText) step.notification = { title: watchText(title, 13) || 'Step', text: watchText(notificationText, 54) };
  return step;
}

const T = {
  duration: (sec) => ({ condition: { type: 'stepDuration', value: Math.max(1, Math.round(sec)) } }),
  distance: (m) => ({ condition: { type: 'stepDistance', value: Math.max(1, Math.round(m)) } })
};

// day: { date, name, typeKey, zone, distKm, desc, interval:{reps,repMeters,recoveryMin,workMin,restMin},
//        repSec (si entrena por tiempo), warmupMin, cooldownMin }
// zones: { 1:{min,max}, ... } en bpm (los del perfil del usuario)
// labels: textos ya traducidos por el cliente { warmup, cooldown, work, rest, main, ... }
function buildGuide(day, zones, labels) {
  labels = labels || {};
  const L = (k, fb) => labels[k] || fb;
  const zone = posInt(day.zone, 1, 5, null);
  const warmMin = posInt(day.warmupMin, 0, 30, 10);
  const coolMin = posInt(day.cooldownMin, 0, 30, 10);
  const easyTarget = hrTarget(zones, 2);
  const workTarget = zone ? hrTarget(zones, zone) : null;
  const hr = { type: 'heartRate', title: 'HR' };
  const pace = { type: 'pace', title: 'pace' };

  const steps = [];
  const iv = day.interval && Number(day.interval.reps) > 0 ? day.interval : null;
  const isRepeatType = iv && (day.typeKey === 'intervals' || day.typeKey === 'hills' || day.typeKey === 'fartlek' || iv.workMin);

  if (isRepeatType) {
    const reps = posInt(iv.reps, 1, 100, 1);
    if (warmMin > 0) steps.push(fieldsStep(L('warmup', 'Warm up'), [{ type: 'stepDurationCountdown', value: warmMin * 60, title: 'time' }, hr, easyTarget], [T.duration(warmMin * 60)], L('warmup', 'Warm up')));

    let workStep, restStep;
    if (day.typeKey === 'fartlek' || (iv.workMin && !iv.repMeters)) {
      const workSec = Math.round((Number(iv.workMin) || 1) * 60), restSec = Math.round((Number(iv.restMin) || 1) * 60);
      workStep = fieldsStep(L('work', 'Hard'), [{ type: 'stepDurationCountdown', value: workSec, title: 'time' }, hr, pace, workTarget], [T.duration(workSec)], L('work', 'Hard'));
      restStep = fieldsStep(L('rest', 'Easy'), [{ type: 'stepDurationCountdown', value: restSec, title: 'time' }, hr, hrTarget(zones, 1)], [T.duration(restSec)], L('rest', 'Easy'));
    } else {
      const repMeters = posInt(iv.repMeters, 20, 20000, 400);
      const useTime = Number(day.repSec) > 0; // el corredor entrena por tiempo
      const workCountdown = useTime ? { type: 'stepDurationCountdown', value: Math.round(day.repSec), title: 'time' } : { type: 'stepDistanceCountdown', value: repMeters, title: 'dist' };
      workStep = fieldsStep(L('work', 'Hard'), [workCountdown, hr, pace, workTarget], [useTime ? T.duration(day.repSec) : T.distance(repMeters)], L('work', 'Hard'));
      const restSecV = Number(day.restSec) > 0 ? day.restSec : day.repSec; // plan por tiempo: la bajada dura lo que dice el plan
      if (day.typeKey === 'hills') {
        // bajar trotando suave cubre más o menos el mismo tramo que se subió fuerte
        restStep = fieldsStep(L('rest', 'Easy'), [useTime ? { type: 'stepDurationCountdown', value: Math.round(restSecV), title: 'time' } : { type: 'stepDistanceCountdown', value: repMeters, title: 'dist' }, hr, hrTarget(zones, 1)], [useTime ? T.duration(restSecV) : T.distance(repMeters)], L('rest', 'Easy'));
      } else {
        const restSec = Math.round((Number(iv.recoveryMin) || 1) * 60);
        restStep = fieldsStep(L('rest', 'Easy'), [{ type: 'stepDurationCountdown', value: restSec, title: 'time' }, hr, hrTarget(zones, 1)], [T.duration(restSec)], L('rest', 'Easy'));
      }
    }
    steps.push({ type: 'repeat', times: reps, steps: [workStep, restStep] });
    if (coolMin > 0) steps.push(fieldsStep(L('cooldown', 'Cool down'), [{ type: 'stepDurationCountdown', value: coolMin * 60, title: 'time' }, hr, easyTarget], [T.duration(coolMin * 60)], L('cooldown', 'Cool down')));
  } else {
    // Sesión continua (rodaje, tirada larga, tempo, progresivo...): un solo paso con
    // distancia/tiempo acumulados, pulso, ritmo y -- si el plan indica zona -- el objetivo de pulso.
    const distM = Math.round((Number(day.distKm) || 0) * 1000);
    const fields = [
      distM > 0 && !(day.timeBased && Number(day.durMin) > 0) ? { type: 'stepDistanceCountdown', value: distM, title: 'to go' } : { type: 'duration', window: 'workout', title: 'time' },
      { type: 'distance', window: 'workout', title: 'dist' },
      hr, pace, workTarget
    ];
    steps.push(fieldsStep(L('main', day.name || 'Run'), fields, null, L('main', day.name || 'Run')));
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(day.date || '') ? day.date : null;
  const guide = {
    type: 'sequence',
    name: watchText(`Zancada - ${day.name || 'Run'}`, 60) || 'Zancada',
    description: clip(String(day.desc || day.name || 'Zancada').replace(/\s+/g, ' ').trim(), 256) || 'Zancada',
    richText: clip(String(day.desc || '').trim(), 100000) || undefined,
    shortDescription: watchText(day.name || 'Zancada', 23) || 'Zancada',
    owner: 'Zancada',
    url: 'https://zancada.org',
    activities: [RUNNING_ACTIVITY],
    usage: 'workout',
    externalId: clip(date ? `zancada-${date}` : `zancada-${Date.now()}`, 64),
    steps: steps.slice(0, 1000)
  };
  if (date) guide.localDate = date;
  if (!guide.richText) delete guide.richText;
  return guide;
}

function buildGuideZip(guide) {
  return createZip([
    { name: 'guide.json', data: Buffer.from(JSON.stringify(guide), 'utf8') },
    { name: 'icon.png', data: ICON_PNG }
  ]);
}

module.exports = { buildGuide, buildGuideZip, watchText };
