// api/_lib/polar-activity-helpers.js
//
// Equivalente a strava-activity-helpers.js pero para Polar AccessLink.
// A diferencia de Strava, para el MVP no traemos streams/splits/series por
// sesión (la API de Polar expone eso vía /samples con un formato bien
// distinto) -- se guardan solo los datos de resumen que ya trae el propio
// endpoint de ejercicios (distancia, duración, FC promedio/máxima,
// calorías). Alcanza para que la carrera aparezca sola en Historial sin que
// el usuario la cargue a mano; el detalle de ruta/splits queda para más
// adelante si hace falta.

function isRunningSport(sport) {
  if (!sport) return false;
  const s = String(sport).toUpperCase();
  return s.includes('RUN');
}

// Convierte "PT2H44M45S" (ISO 8601 duration) a segundos. Polar solo usa
// horas/minutos/segundos en este campo (nunca días/meses/años), así que no
// hace falta un parser genérico de ISO 8601 completo.
function parseIsoDurationToSeconds(iso) {
  if (!iso) return 0;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(iso);
  if (!m) return 0;
  const hours = Number(m[1] || 0), minutes = Number(m[2] || 0), seconds = Number(m[3] || 0);
  return Math.round(hours * 3600 + minutes * 60 + seconds);
}

function getMondayISO(d) {
  const dt = new Date(d);
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

// exercise: un objeto tal cual lo devuelve GET /v3/exercises (ver schema
// exerciseHashId). "id" acá es el hashed id de Polar -- estable por
// ejercicio, sirve como clave de dedupe (polarId).
function exerciseToRun(exercise) {
  const startDate = new Date(exercise.start_time);
  return {
    id: 'polar_' + exercise.id,
    polarId: exercise.id,
    date: exercise.start_time,
    name: null,
    distanceKm: (exercise.distance || 0) / 1000,
    durationSec: parseIsoDurationToSeconds(exercise.duration),
    elevationGain: 0,
    elevationLoss: null,
    avgHr: exercise.heart_rate && exercise.heart_rate.average ? Math.round(exercise.heart_rate.average) : null,
    maxHr: exercise.heart_rate && exercise.heart_rate.maximum ? Math.round(exercise.heart_rate.maximum) : null,
    avgCadence: null,
    calories: exercise.calories || null,
    hrLog: [],
    points: [],
    splits: [],
    splitsV: 3,
    series: null,
    shoeId: null,
    source: 'polar',
    planMonday: getMondayISO(exercise.start_time),
    planDayIndex: (startDate.getUTCDay() + 6) % 7
  };
}

async function mergePolarRuns(base, headers, userId, newRuns, mode) {
  if (!newRuns || !newRuns.length) return { merged: false };
  const res = await fetch(`${base}/rest/v1/rpc/merge_polar_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_user_id: userId, p_new_runs: newRuns, p_mode: mode || 'skip' })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`merge_polar_runs rpc failed: ${res.status} ${text}`);
  }
  return { merged: true };
}

// Mismo rol que purgeStravaRunsForUser -- se llama al desconectar, para no
// dejar guardados datos de Polar que ya no estamos autorizados a conservar.
async function purgePolarRunsForUser(base, headers, userId) {
  const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers });
  const stateRows = await stateRes.json();
  const data = stateRows && stateRows[0] && stateRows[0].data;
  const hasPolarRuns = data && Array.isArray(data.runs) && data.runs.some(r => r.source === 'polar');
  if (!data || !hasPolarRuns) return;

  data.runs = data.runs.filter(r => r.source !== 'polar');
  if (Array.isArray(data.shoes)) {
    data.shoes = data.shoes.map(shoe => ({
      ...shoe,
      km: data.runs.filter(r => String(r.shoeId) === String(shoe.id)).reduce((a, r) => a + (r.distanceKm || 0), 0)
    }));
  }
  const patchRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ data, updated_at: new Date().toISOString() })
  });
  if (!patchRes.ok) throw new Error(`purgePolarRunsForUser: PATCH failed: ${patchRes.status} ${await patchRes.text().catch(() => '')}`);
}

module.exports = { isRunningSport, parseIsoDurationToSeconds, exerciseToRun, mergePolarRuns, purgePolarRunsForUser };
