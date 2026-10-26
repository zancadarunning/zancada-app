// api/_lib/coros-workout-builder.js
//
// Convierte una sesión del plan de Zancada en el `course` (entrenamiento) que reciben las herramientas de escritura del MCP de COROS (createScheduledWorkout / updateScheduledWorkout).
// Contraparte de wahoo-plan-builder.js y suunto-guide-builder.js: misma sesión de entrada (el cliente ya la armó, ver cleanDay en watch-plan-clean.js).
//
// ESTADO: PRIMERA VERSIÓN, A CONFIRMAR CON EL ESQUEMA REAL. La guía pública de COROS no publica los campos del `course`; lo que se sabe (issues del GitHub oficial coroslab/COROS-MCP):
//   - course tiene `sections` (lista; cada sección puede traer `sets` anidadas), y el deporte va como código: 1 = correr, 2 = ciclismo, 5 = trail (4 = descanso en un plan).
//   - cada sección tiene `targetType`: 1 = distancia, 2 = tiempo (segundos), 3 = desnivel, 4 = libre.
//   - los trail NO aceptan tiempo; los calentamientos y vueltas a la calma deben ser por distancia en trail (no aplica acá: solo se envía correr).
// Lo que NO se sabe y se asume (revisar con la salida del botón "Leer herramientas de COROS" del panel de admin, api/coros-describe-tools.js):
//   - la unidad de la distancia (acá: metros), los nombres exactos de los campos de nombre/objetivo, y cómo se declara la intensidad. Por eso NO se manda intensidad: el pulso objetivo
//     va en la descripción de la sesión, como texto. Las repeticiones se desarman en secciones seguidas (sin `sets`) para no depender de cómo se anidan.
// Mientras no se confirme, el envío está limitado a cuentas admin (ver coros-push-plan.js).

const MAX_SECTIONS = 40;

function posInt(n, min, max, fallback) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function section(name, targetType, targetValue) {
  return { name: String(name || '').slice(0, 40), targetType, targetValue };
}

function zoneText(zones, zone, labelFallback) {
  const z = zones && zones[zone];
  if (!z) return '';
  return `${labelFallback} ${zone}: ${Math.round(z.min)}-${Math.round(z.max)} ppm`;
}

// day: { date, name, typeKey, zone, distKm, durMin, desc, interval:{reps,repMeters,recoveryMin,workMin,restMin}, repSec, restSec, timeBased }
function buildCorosCourse(day, zones, labels) {
  labels = labels || {};
  const L = (k, fb) => labels[k] || fb;
  const zone = posInt(day.zone, 1, 5, null);
  const warmMin = 10, coolMin = 5;
  const sections = [];
  const iv = day.interval && Number(day.interval.reps) > 0 ? day.interval : null;
  const isRepeatType = iv && (day.typeKey === 'intervals' || day.typeKey === 'hills' || day.typeKey === 'fartlek' || iv.workMin);

  if (isRepeatType) {
    const reps = posInt(iv.reps, 1, 100, 1);
    sections.push(section(L('warmup', 'Warm up'), 2, warmMin * 60));
    let workSection, restSection;
    if (day.typeKey === 'fartlek' || (iv.workMin && !iv.repMeters)) {
      workSection = section(L('work', 'Hard'), 2, Math.round((Number(iv.workMin) || 1) * 60));
      restSection = section(L('rest', 'Easy'), 2, Math.round((Number(iv.restMin) || 1) * 60));
    } else {
      const repMeters = posInt(iv.repMeters, 20, 20000, 400);
      const useTime = Number(day.repSec) > 0;
      workSection = useTime ? section(L('work', 'Hard'), 2, Math.round(day.repSec)) : section(L('work', 'Hard'), 1, repMeters);
      const restSecV = Number(day.restSec) > 0 ? day.restSec : day.repSec;
      if (day.typeKey === 'hills') restSection = useTime ? section(L('rest', 'Easy'), 2, Math.round(restSecV)) : section(L('rest', 'Easy'), 1, repMeters);
      else restSection = section(L('rest', 'Easy'), 2, Math.round((Number(iv.recoveryMin) || 1) * 60));
    }
    for (let i = 0; i < reps && sections.length < MAX_SECTIONS - 1; i++) { sections.push(Object.assign({}, workSection)); sections.push(Object.assign({}, restSection)); }
    sections.push(section(L('cooldown', 'Cool down'), 2, coolMin * 60));
  } else {
    const distM = Math.round((Number(day.distKm) || 0) * 1000);
    if (distM > 0 && !(day.timeBased && Number(day.durMin) > 0)) sections.push(section(L('main', day.name || 'Run'), 1, distM));
    else sections.push(section(L('main', day.name || 'Run'), 2, Math.max(300, posInt(day.durMin, 5, 600, 30) * 60)));
  }

  const hr = zone ? zoneText(zones, zone, 'Z') : '';
  const description = [String(day.desc || '').slice(0, 800), hr].filter(Boolean).join('\n').slice(0, 1000);
  return { name: String(`Zancada - ${day.name || 'Run'}`).slice(0, 60), sportType: 1, description, sections: sections.slice(0, MAX_SECTIONS) };
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

module.exports = { buildCorosCourse, corosDate, extractIdInPlan, MAX_SECTIONS };
