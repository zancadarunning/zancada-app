// api/_lib/watch-plan-clean.js
//
// Validación de lo que la app (o el estado guardado de la cuenta) manda como "plan para el reloj":
// un cliente podría mandar cualquier cosa, así que cada campo se acota a lo que el armado de guías
// (Suunto) y de planes (Wahoo) esperan. Lo comparten los endpoints y los crons de las dos marcas.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanZones(zones) {
  const out = {};
  for (let n = 1; n <= 5; n++) {
    const z = zones && zones[n];
    if (z && Number.isFinite(Number(z.min)) && Number.isFinite(Number(z.max))) out[n] = { min: Number(z.min), max: Number(z.max) };
  }
  return out;
}

function cleanLabels(labels) {
  const out = {};
  for (const k of ['warmup', 'cooldown', 'work', 'rest', 'main']) {
    if (labels && typeof labels[k] === 'string') out[k] = labels[k].slice(0, 40);
  }
  return out;
}

function cleanDay(d) {
  if (!d || !DATE_RE.test(String(d.date || ''))) return null;
  const distKm = Number(d.distKm);
  if (!(distKm > 0) || distKm > 500) return null;
  const iv = d.interval && typeof d.interval === 'object' ? {
    reps: Number(d.interval.reps), repMeters: Number(d.interval.repMeters),
    recoveryMin: Number(d.interval.recoveryMin), workMin: Number(d.interval.workMin), restMin: Number(d.interval.restMin)
  } : null;
  return {
    date: d.date,
    name: String(d.name || '').slice(0, 60),
    typeKey: String(d.typeKey || '').slice(0, 30),
    zone: d.zone == null ? null : Number(d.zone),
    distKm,
    durMin: Number(d.durMin) > 0 ? Math.min(600, Number(d.durMin)) : 0,
    desc: String(d.desc || '').slice(0, 2000),
    interval: iv,
    repSec: Number(d.repSec) > 0 ? Number(d.repSec) : 0
  };
}

// { "2026-10-07": { workoutId, planId } } -> solo fechas válidas e ids numéricos/de texto cortos.
function cleanKnown(known) {
  const out = {};
  if (!known || typeof known !== 'object') return out;
  for (const date of Object.keys(known).slice(0, 30)) {
    if (!DATE_RE.test(date)) continue;
    const k = known[date] || {};
    const wid = k.workoutId == null ? null : String(k.workoutId).slice(0, 40);
    const pid = k.planId == null ? null : String(k.planId).slice(0, 40);
    if (wid && /^[A-Za-z0-9_-]+$/.test(wid)) out[date] = { workoutId: wid, planId: pid && /^[A-Za-z0-9_-]+$/.test(pid) ? pid : null };
  }
  return out;
}

module.exports = { DATE_RE, cleanZones, cleanLabels, cleanDay, cleanKnown };
