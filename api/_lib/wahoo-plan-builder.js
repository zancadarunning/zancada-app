// api/_lib/wahoo-plan-builder.js
//
// Convierte una sesión del plan de Zancada en un "plan.json" de Wahoo (formato público 1.0.0:
// https://cloud-api.wahooligan.com/docs/plan-json-format.pdf). Es la contraparte de
// suunto-guide-builder.js: misma sesión de entrada (el cliente ya la armó), distinto formato.
//
// Formato (resumen de la especificación):
//   header: { name, version:"1.0.0", description?, workout_type_family (1 = running),
//             workout_type_location (1 = outdoor), duration_s?, distance_m? }
//   intervals: [{ name?, exit_trigger_type: "time"|"distance"|"repeat", exit_trigger_value,
//                 intensity_type?: "wu"|"active"|"recover"|"cd"|..., targets?: [{type,low,high}],
//                 intervals?: [...]  (solo cuando el trigger es "repeat") }]
//   - "repeat": exit_trigger_value = cuántas veces se repite DESPUÉS de la primera (3 reps -> 2).
//   - targets de pulso absolutos: { type:"hr", low, high } en latidos por minuto.
//   - "time" en segundos, "distance" en metros.

const crypto = require('crypto');

function posInt(n, min, max, fallback) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function hrTarget(zones, zone) {
  const z = zones && zones[zone];
  if (!z) return null;
  const low = posInt(z.min, 30, 250, null), high = posInt(z.max, 30, 250, null);
  if (low == null || high == null || high < low) return null;
  return { type: 'hr', low, high };
}

function interval(name, trigger, value, intensity, target) {
  const iv = { name: String(name || '').slice(0, 60), exit_trigger_type: trigger, exit_trigger_value: value, intensity_type: intensity };
  if (target) iv.targets = [target];
  return iv;
}

// day: { date, name, typeKey, zone, distKm, desc, durMin, interval:{reps,repMeters,recoveryMin,workMin,restMin}, repSec, warmupMin, cooldownMin }
function buildWahooPlan(day, zones, labels) {
  labels = labels || {};
  const L = (k, fb) => labels[k] || fb;
  const zone = posInt(day.zone, 1, 5, null);
  const warmMin = posInt(day.warmupMin, 0, 30, 10);
  const coolMin = posInt(day.cooldownMin, 0, 30, 10);
  const easy = hrTarget(zones, 2);
  const work = zone ? hrTarget(zones, zone) : null;
  const rest = hrTarget(zones, 1);

  const intervals = [];
  const iv = day.interval && Number(day.interval.reps) > 0 ? day.interval : null;
  const isRepeatType = iv && (day.typeKey === 'intervals' || day.typeKey === 'hills' || day.typeKey === 'fartlek' || iv.workMin);

  if (isRepeatType) {
    const reps = posInt(iv.reps, 1, 100, 1);
    if (warmMin > 0) intervals.push(interval(L('warmup', 'Warm up'), 'time', warmMin * 60, 'wu', easy));

    let workIv, restIv;
    if (day.typeKey === 'fartlek' || (iv.workMin && !iv.repMeters)) {
      const workSec = Math.round((Number(iv.workMin) || 1) * 60), restSec = Math.round((Number(iv.restMin) || 1) * 60);
      workIv = interval(L('work', 'Hard'), 'time', workSec, 'active', work);
      restIv = interval(L('rest', 'Easy'), 'time', restSec, 'recover', rest);
    } else {
      const repMeters = posInt(iv.repMeters, 20, 20000, 400);
      const useTime = Number(day.repSec) > 0;
      workIv = useTime ? interval(L('work', 'Hard'), 'time', Math.round(day.repSec), 'active', work) : interval(L('work', 'Hard'), 'distance', repMeters, 'active', work);
      if (day.typeKey === 'hills') {
        restIv = useTime ? interval(L('rest', 'Easy'), 'time', Math.round(day.repSec), 'recover', rest) : interval(L('rest', 'Easy'), 'distance', repMeters, 'recover', rest);
      } else {
        restIv = interval(L('rest', 'Easy'), 'time', Math.round((Number(iv.recoveryMin) || 1) * 60), 'recover', rest);
      }
    }
    // El grupo de repeticiones: exit_trigger_value = repeticiones DESPUÉS de la primera.
    intervals.push({ name: String(day.name || 'Series').slice(0, 60), exit_trigger_type: 'repeat', exit_trigger_value: reps - 1, intervals: [workIv, restIv] });
    if (coolMin > 0) intervals.push(interval(L('cooldown', 'Cool down'), 'time', coolMin * 60, 'cd', easy));
  } else {
    const distM = Math.round((Number(day.distKm) || 0) * 1000);
    if (distM > 0) intervals.push(interval(L('main', day.name || 'Run'), 'distance', distM, 'active', work));
    else intervals.push(interval(L('main', day.name || 'Run'), 'time', Math.max(300, posInt(day.durMin, 5, 600, 30) * 60), 'active', work));
  }

  const header = {
    name: String(`Zancada - ${day.name || 'Run'}`).slice(0, 100),
    version: '1.0.0',
    description: String(day.desc || '').slice(0, 5000) || undefined,
    workout_type_family: 1,   // running
    workout_type_location: 1  // outdoor
  };
  return { header, intervals };
}

// Data URI base64 que pide `plan[file]`.
function planToDataUri(plan) {
  return 'data:application/json;base64,' + Buffer.from(JSON.stringify(plan), 'utf8').toString('base64');
}

// Hash corto del contenido: forma parte del external_id del plan para que un plan cambiado sea
// un plan NUEVO (Wahoo exige external_id único y no permite leer los planes sin el permiso
// plans_read, así que no se puede "buscar y actualizar" uno cuyo id no conocemos).
function planHash(plan) {
  return crypto.createHash('sha1').update(JSON.stringify(plan)).digest('hex').slice(0, 8);
}

// Hora de inicio del entreno: 7:00 am LOCAL del usuario (tzOffsetMin = Date.getTimezoneOffset()
// del navegador, o sea minutos que el huso está "detrás" de UTC: Argentina = 180).
function workoutStartsISO(date, tzOffsetMin) {
  const [y, m, d] = String(date).split('-').map(Number);
  const off = Number.isFinite(Number(tzOffsetMin)) ? Number(tzOffsetMin) : 0;
  return new Date(Date.UTC(y, m - 1, d, 7, 0, 0) + off * 60000).toISOString();
}

module.exports = { buildWahooPlan, planToDataUri, planHash, workoutStartsISO };
