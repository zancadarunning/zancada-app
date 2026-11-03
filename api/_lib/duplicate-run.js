// api/_lib/duplicate-run.js
//
// ¿Esta actividad de un proveedor es la MISMA que una carrera que la persona ya tiene (de otra fuente)? Misma regla que isLikelyDuplicateOfExistingRun() del cliente y que los merge_*_runs.sql:
// inicio dentro de 10 min, distancia dentro del 10 % (piso 0,3 km) y, si las dos tienen duración, duración dentro del 10 % (piso 60 s).
//
// Para qué: los crons traen los últimos 30 días y deciden qué es nuevo por el id del proveedor. Una actividad que el merge descarta por duplicada nunca guarda su id, así que volvía a procesarse entera
// (rutas de Strava, archivos FIT de Polar y Wahoo) cada 15 minutos durante 30 días, gastando la cuota compartida de la marca. Con este chequeo barato (solo con los datos del listado) se salta ANTES.

function isDuplicateOfExisting(existingRuns, startMs, distanceKm, durationSec) {
  if (!Number.isFinite(startMs) || !Array.isArray(existingRuns)) return false;
  return existingRuns.some(r => {
    if (!r) return false;
    const rMs = new Date(r.date).getTime();
    if (!Number.isFinite(rMs) || Math.abs(rMs - startMs) > 10 * 60 * 1000) return false;
    const rKm = Number(r.distanceKm) || 0;
    if (Math.abs(rKm - (Number(distanceKm) || 0)) > Math.max(0.3, rKm * 0.1)) return false;
    const rDur = Number(r.durationSec) || 0, dur = Number(durationSec) || 0;
    if (dur > 0 && rDur > 0 && Math.abs(rDur - dur) > Math.max(60, rDur * 0.1)) return false;
    return true;
  });
}

module.exports = { isDuplicateOfExisting };
