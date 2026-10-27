// api/_lib/coros-workout-builder.js
//
// Convierte una sesión del plan de Zancada en el `course` (entrenamiento) que reciben las herramientas de escritura del MCP de COROS (createScheduledWorkout / updateScheduledWorkout).
// Contraparte de wahoo-plan-builder.js y suunto-guide-builder.js: misma sesión de entrada (el cliente ya la armó, ver cleanDay en watch-plan-clean.js).
//
// FORMATO (esquema real publicado por el MCP de COROS, leído con tools/list el 2026-10-26):
//   course = { courseName (<=100), courseDescription (no vacío), sportType (1 = correr), sections: [...] }   -- sin dayNo (la fecha va aparte)
//   sección simple:  { sectionType: 1 calentamiento | 2 entrenamiento | 3 recuperación | 4 vuelta a la calma,
//                      targetType: 1 distancia (metros) | 2 tiempo (segundos), targetValue: entero positivo,
//                      intensityType: 1 (pulso), y EXACTAMENTE un formato de intensidad:
//                        intensityValueStart/End (rango absoluto en ppm, 30-240)  |  sectionIntensity (zona 1-6 de COROS) | intensityPercentStart/End }
//   grupo de repeticiones: { intervalGroup: true, repeats: 1-20, sets: [secciones simples con sectionType 2 o 3] }  (sin objetivo ni intensidad en el contenedor; no se anidan)
// Las secciones no tienen nombre propio; el nombre y la descripción van en el course.
// Se usa el pulso (intensityType 1) con el rango en ppm de las zonas del corredor; si no hay zonas, la zona equivalente de COROS (sectionIntensity).

function posInt(n, min, max, fallback) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

// Intensidad de pulso para una zona: rango absoluto en ppm si lo tenemos, si no la zona de COROS (1-6).
function hrIntensity(zones, zone) {
  const z = zones && zones[zone];
  if (z) {
    const lo = posInt(z.min, 30, 240, null), hi = posInt(z.max, 30, 240, null);
    if (lo != null && hi != null && hi >= lo) return { intensityType: 1, intensityValueStart: lo, intensityValueEnd: hi };
  }
  return { intensityType: 1, sectionIntensity: posInt(zone, 1, 6, 2) };
}

function plain(sectionType, targetType, targetValue, intensity) {
  return Object.assign({ sectionType, targetType, targetValue: Math.max(1, Math.round(targetValue)) }, intensity || {});
}

// day: { date, name, typeKey, zone, distKm, durMin, desc, interval:{reps,repMeters,recoveryMin,workMin,restMin}, repSec, restSec, timeBased }
function buildCorosCourse(day, zones, labels) {
  const zone = posInt(day.zone, 1, 5, null);
  const warmMin = day.warmupMin != null ? posInt(day.warmupMin, 0, 30, 10) : 10;
  const coolMin = day.cooldownMin != null ? posInt(day.cooldownMin, 0, 30, 5) : 5;
  const easy = hrIntensity(zones, 2);
  const work = zone ? hrIntensity(zones, zone) : hrIntensity(zones, 2);
  const rest = hrIntensity(zones, 1);
  const sections = [];
  const iv = day.interval && Number(day.interval.reps) > 0 ? day.interval : null;
  const isRepeatType = iv && (day.typeKey === 'intervals' || day.typeKey === 'hills' || day.typeKey === 'fartlek' || iv.workMin);

  if (isRepeatType) {
    const reps = posInt(iv.reps, 1, 20, 1);   // COROS admite 1-20 repeticiones por grupo
    if (warmMin > 0) sections.push(plain(1, 2, warmMin * 60, easy));
    let workSec, restSec;
    if (day.typeKey === 'fartlek' || (iv.workMin && !iv.repMeters)) {
      workSec = plain(2, 2, (Number(iv.workMin) || 1) * 60, work);
      restSec = plain(3, 2, (Number(iv.restMin) || 1) * 60, rest);
    } else {
      const repMeters = posInt(iv.repMeters, 20, 20000, 400);
      const useTime = Number(day.repSec) > 0;
      workSec = useTime ? plain(2, 2, day.repSec, work) : plain(2, 1, repMeters, work);
      const restSecV = Number(day.restSec) > 0 ? day.restSec : day.repSec;
      if (day.typeKey === 'hills') restSec = useTime ? plain(3, 2, restSecV, rest) : plain(3, 1, repMeters, rest);
      else restSec = plain(3, 2, (Number(iv.recoveryMin) || 1) * 60, rest);
    }
    sections.push({ intervalGroup: true, repeats: reps, sets: [workSec, restSec] });
    if (coolMin > 0) sections.push(plain(4, 2, coolMin * 60, easy));
  } else {
    // sesión continua: la entrada en calor y la vuelta a la calma van como secciones propias si la app las mandó (así el tiempo total del entrenamiento las incluye)
    const withWarm = day.warmupMin != null;
    if (withWarm && warmMin > 0) sections.push(plain(1, 2, warmMin * 60, easy));
    const distM = Math.round((Number(day.distKm) || 0) * 1000);
    if (distM > 0 && !(day.timeBased && Number(day.durMin) > 0)) sections.push(plain(2, 1, distM, work));
    else sections.push(plain(2, 2, Math.max(300, posInt(day.durMin, 5, 600, 30) * 60), work));
    if (withWarm && coolMin > 0) sections.push(plain(4, 2, coolMin * 60, easy));
  }

  const name = String(`Zancada - ${day.name || 'Run'}`).slice(0, 100);
  const description = String(day.desc || '').trim().slice(0, 800) || name;
  return { courseName: name, courseDescription: description, sportType: 1, sections };
}

// Entrenamiento que reemplaza a una sesión que el plan quitó o movió de día. COROS no deja borrar ni mover un entrenamiento agendado desde afuera, así que en vez de dejar una copia COMPLETA
// (que alguien podría correr dos veces) se la reescribe como una sesión mínima, marcada "movida: podés borrarla".
function buildCorosMovedCourse(moved, zones) {
  const name = String((moved && moved.name) || 'Zancada - Moved session (you can delete it)').slice(0, 100);
  const desc = String((moved && moved.desc) || "This session was moved to another day in Zancada and is no longer needed. COROS doesn't let other apps delete it: remove it in the COROS app.").slice(0, 400);
  return { courseName: name, courseDescription: desc, sportType: 1, sections: [plain(2, 2, 300, hrIntensity(zones, 1))] };
}

// 'YYYY-MM-DD' -> 'yyyyMMdd' (formato de fecha de COROS)
function corosDate(iso) { return String(iso).replace(/-/g, ''); }

// Busca el idInPlan en la respuesta de una herramienta de escritura (puede venir como objeto o como texto).
function extractIdInPlan(res) {
  const seen = new Set();
  function walk(v, depth) {
    if (v == null || depth > 6) return null;
    if (typeof v === 'object') {
      if (seen.has(v)) return null; seen.add(v);
      if (v.idInPlan != null && /^\d{1,30}$/.test(String(v.idInPlan))) return String(v.idInPlan);
      for (const k of Object.keys(v)) { const r = walk(v[k], depth + 1); if (r) return r; }
      return null;
    }
    if (typeof v === 'string') { const m = v.match(/idInPlan["'\s:=]+(\d{1,30})/i); return m ? m[1] : null; }
    return null;
  }
  return walk(res, 0);
}

module.exports = { buildCorosCourse, buildCorosMovedCourse, corosDate, extractIdInPlan, hrIntensity };
