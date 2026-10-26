// api/_lib/activity-sanity.js
//
// Último filtro de sanidad numérica antes de guardar una actividad importada de
// cualquier marca (Strava/Polar/Wahoo/COROS) -- ninguno de los helpers de por marca
// valida el RANGO de los números que vienen de la API/archivo FIT de cada una antes de
// esto, solo el TIPO (Number(...) || 0, num() ? Math.round(...) : null, etc.). Un valor
// corrupto o absurdo (bug del lado de la marca, sensor fallando, o un archivo FIT mal
// armado -- ver también el tope de 1000km agregado en fit-activity-helpers.js/
// strava-activity-helpers.js contra el loop sin fin que un valor así podía disparar)
// terminaba guardado tal cual, mostrando un número claramente imposible en
// Historial/Perfil en vez de degradar con gracia. Encontrado en una auditoría de
// punta a punta.
//
// Clampeamos (no rechazamos la actividad entera) distanceKm/durationSec a un techo
// generoso -- ninguna carrera real se acerca, así que esto nunca afecta un dato
// legítimo -- y ANULAMOS (no clampeamos) avgHr/maxHr fuera de un rango humano
// plausible, porque un número de FC clampeado a un límite arbitrario sería tan
// engañoso como el original; sin dato es más honesto que un dato inventado, y ya es
// el criterio que estos mismos archivos usan para "sensor sin dato real".

const MAX_DISTANCE_KM = 500; // más que cualquier ultra real (Badwater, de las más largas del calendario, son ~217km)
const MAX_DURATION_SEC = 48 * 3600; // 48hs -- generoso incluso para un ultra de varios días con paradas
const MIN_HR = 30, MAX_HR = 250; // rango humano plausible, desde reposo hasta esfuerzo extremo

function sanitizeActivityNumbers(run) {
  if (!run) return run;
  if (!Number.isFinite(run.distanceKm) || run.distanceKm < 0) run.distanceKm = 0;
  else if (run.distanceKm > MAX_DISTANCE_KM) run.distanceKm = MAX_DISTANCE_KM;

  if (!Number.isFinite(run.durationSec) || run.durationSec < 0) run.durationSec = 0;
  else if (run.durationSec > MAX_DURATION_SEC) run.durationSec = MAX_DURATION_SEC;

  if (run.avgHr != null && (!Number.isFinite(run.avgHr) || run.avgHr < MIN_HR || run.avgHr > MAX_HR)) run.avgHr = null;
  if (run.maxHr != null && (!Number.isFinite(run.maxHr) || run.maxHr < MIN_HR || run.maxHr > MAX_HR)) run.maxHr = null;

  // el resto de los numeros y el nombre: llegaban a app_state sin acotar (1e300, "Infinity" como texto, un nombre de 5 MB...)
  const rangeOrNull = (v, max) => (v != null && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > max)) ? null : v;
  if ('elevationGain' in run && run.elevationGain != null) run.elevationGain = Number.isFinite(Number(run.elevationGain)) ? Math.min(Math.max(Number(run.elevationGain), 0), 30000) : 0;
  if ('elevationLoss' in run && run.elevationLoss != null) run.elevationLoss = Number.isFinite(Number(run.elevationLoss)) ? Math.min(Math.max(Number(run.elevationLoss), 0), 30000) : null;
  if ('avgCadence' in run) run.avgCadence = rangeOrNull(run.avgCadence, 300);
  if ('avgPower' in run) run.avgPower = rangeOrNull(run.avgPower, 3000);
  if ('maxPower' in run) run.maxPower = rangeOrNull(run.maxPower, 5000);
  if ('calories' in run) run.calories = rangeOrNull(run.calories, 50000);
  if ('name' in run && run.name != null) run.name = typeof run.name === 'string' ? run.name.slice(0, 120) : null;

  return run;
}

module.exports = { sanitizeActivityNumbers, MAX_DISTANCE_KM, MAX_DURATION_SEC, MIN_HR, MAX_HR };
