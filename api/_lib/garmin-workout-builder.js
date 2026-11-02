// api/_lib/garmin-workout-builder.js
//
// Convierte una sesión del plan de Zancada en un entrenamiento de la Training API V2 de Garmin Connect (el que luego se programa en el calendario y llega al reloj).
// Contraparte de coros-workout-builder.js / wahoo-plan-builder.js / suunto-guide-builder.js: misma sesión de entrada (el cliente ya la armó, ver cleanDay en watch-plan-clean.js).
//
// Formato (Training API V2): { workoutName, description (<=1024), sport:'RUNNING', workoutProvider/workoutSourceId (<=20), segments:[{ segmentOrder, sport, steps:[...] }] }.
// Pasos: WorkoutStep { stepOrder, intensity: WARMUP|ACTIVE|INTERVAL|RECOVERY|REST|COOLDOWN, durationType: TIME (segundos) | DISTANCE (metros) | OPEN, targetType: HEART_RATE|OPEN... }
// y WorkoutRepeatStep { repeatType:'REPEAT_UNTIL_STEPS_CMPLT', repeatValue, steps:[...] }. Máximo 100 pasos en un deporte. El objetivo de intensidad es un rango de pulso (ppm)
// con las zonas de la persona; sin zonas, sin objetivo (OPEN).

const PROVIDER = 'Zancada';

function posInt(n, min, max, fallback) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

// Plantilla de un paso con todos los campos del ejemplo de Garmin (los que no se usan van en null).
function step(order, fields) {
  return Object.assign({
    type: 'WorkoutStep', stepOrder: order, intensity: 'ACTIVE', description: null,
    durationType: 'OPEN', durationValue: null, durationValueType: null,
    targetType: 'OPEN', targetValue: null, targetValueLow: null, targetValueHigh: null, targetValueType: null,
    secondaryTargetType: null, secondaryTargetValue: null, secondaryTargetValueLow: null, secondaryTargetValueHigh: null, secondaryTargetValueType: null,
    strokeType: null, drillType: null, equipmentType: null, exerciseCategory: null, exerciseName: null, weightValue: null, weightDisplayUnit: null
  }, fields);
}

// Objetivo de pulso para una zona (rango absoluto en ppm) o sin objetivo si no tenemos las zonas.
function hrTarget(zones, zone) {
  const z = zones && zones[zone];
  if (z) {
    const lo = posInt(z.min, 30, 240, null), hi = posInt(z.max, 30, 240, null);
    if (lo != null && hi != null && hi >= lo) return { targetType: 'HEART_RATE', targetValueLow: lo, targetValueHigh: hi };
  }
  return { targetType: 'OPEN' };
}

// El calentamiento de la app son 3 min de movilidad articular + trote suave (warmMin en total). En el reloj van como dos pasos: la movilidad no lleva objetivo de pulso (parado el pulso está bajo y el reloj avisaría "demasiado bajo") y el trote sí.
const MOBILITY_MIN = 3;
function warmupSteps(next, warmMin, easy, labels) {
  const out = [];
  const mobility = warmMin > MOBILITY_MIN + 1 ? MOBILITY_MIN : 0;
  if (mobility) out.push(timeStep(next(), 'WARMUP', mobility * 60, { targetType: 'OPEN' }, (labels && labels.mobility) || 'Movilidad articular'));
  out.push(timeStep(next(), 'WARMUP', (warmMin - mobility) * 60, easy, (labels && labels.jog) || 'Trote suave'));
  return out;
}

const timeStep = (order, intensity, seconds, target, description) => step(order, Object.assign({ intensity, durationType: 'TIME', durationValue: Math.max(1, Math.round(seconds)), description: description || null }, target));
const distStep = (order, intensity, meters, target, description) => step(order, Object.assign({ intensity, durationType: 'DISTANCE', durationValue: Math.max(1, Math.round(meters)), durationValueType: 'METER', description: description || null }, target));

// day: { date, name, typeKey, zone, distKm, durMin, desc, interval:{reps,repMeters,recoveryMin,workMin,restMin}, repSec, restSec, timeBased, warmupMin, cooldownMin }
function buildGarminWorkout(day, zones, labels) {
  const zone = posInt(day.zone, 1, 5, null);
  const warmMin = day.warmupMin != null ? posInt(day.warmupMin, 0, 30, 10) : 10;
  const coolMin = day.cooldownMin != null ? posInt(day.cooldownMin, 0, 30, 5) : 5;
  const easy = hrTarget(zones, 2);
  const work = zone ? hrTarget(zones, zone) : hrTarget(zones, 2);
  const rest = hrTarget(zones, 1);
  const steps = [];
  let order = 0;
  const next = () => ++order;
  const iv = day.interval && Number(day.interval.reps) > 0 ? day.interval : null;
  const isRepeatType = iv && (day.typeKey === 'intervals' || day.typeKey === 'hills' || day.typeKey === 'fartlek' || iv.workMin);

  if (isRepeatType) {
    const reps = posInt(iv.reps, 1, 50, 1);
    if (warmMin > 0) steps.push(...warmupSteps(next, warmMin, easy, labels));
    const repeatOrder = next();
    const inner = [];
    if (day.typeKey === 'fartlek' || (iv.workMin && !iv.repMeters)) {
      inner.push(timeStep(next(), 'INTERVAL', (Number(iv.workMin) || 1) * 60, work));
      inner.push(timeStep(next(), 'RECOVERY', (Number(iv.restMin) || 1) * 60, rest));
    } else {
      const repMeters = posInt(iv.repMeters, 20, 20000, 400);
      const useTime = Number(day.repSec) > 0;
      inner.push(useTime ? timeStep(next(), 'INTERVAL', day.repSec, work) : distStep(next(), 'INTERVAL', repMeters, work));
      const restSecV = Number(day.restSec) > 0 ? day.restSec : day.repSec;
      if (day.typeKey === 'hills') inner.push(useTime ? timeStep(next(), 'RECOVERY', restSecV, rest) : distStep(next(), 'RECOVERY', repMeters, rest));
      else inner.push(timeStep(next(), 'RECOVERY', (Number(iv.recoveryMin) || 1) * 60, rest));
    }
    steps.push({ type: 'WorkoutRepeatStep', stepOrder: repeatOrder, repeatType: 'REPEAT_UNTIL_STEPS_CMPLT', repeatValue: reps, skipLastRestStep: false, steps: inner });
    if (coolMin > 0) steps.push(timeStep(next(), 'COOLDOWN', coolMin * 60, easy));
  } else {
    // sesión continua: calentamiento y vuelta a la calma como pasos propios si la app los mandó (así entran en el tiempo total)
    const withWarm = day.warmupMin != null;
    if (withWarm && warmMin > 0) steps.push(...warmupSteps(next, warmMin, easy, labels));
    const distM = Math.round((Number(day.distKm) || 0) * 1000);
    if (distM > 0 && !(day.timeBased && Number(day.durMin) > 0)) steps.push(distStep(next(), 'ACTIVE', distM, work));
    else steps.push(timeStep(next(), 'ACTIVE', Math.max(300, posInt(day.durMin, 5, 600, 30) * 60), work));
    if (withWarm && coolMin > 0) steps.push(timeStep(next(), 'COOLDOWN', coolMin * 60, easy));
  }

  const name = String(`Zancada - ${day.name || 'Run'}`).slice(0, 80);
  const description = String(day.desc || '').trim().slice(0, 1000) || name;
  return {
    workoutName: name,
    description,
    sport: 'RUNNING',
    workoutProvider: PROVIDER,
    workoutSourceId: PROVIDER,
    isSessionTransitionEnabled: false,
    segments: [{ segmentOrder: 1, sport: 'RUNNING', steps }]
  };
}

// Cantidad de pasos (incluidos los de adentro de las repeticiones): Garmin acepta hasta 100 en un deporte.
function countSteps(workout) {
  const walk = list => list.reduce((n, s) => n + 1 + (s.steps ? walk(s.steps) : 0), 0);
  return (workout.segments || []).reduce((n, seg) => n + walk(seg.steps || []), 0);
}

module.exports = { buildGarminWorkout, countSteps, hrTarget };
