// api/_lib/polar-activity-helpers.js
//
// Equivalente a strava-activity-helpers.js pero para Polar AccessLink.
//
// UPDATE: ahora sí se traen splits/series/potencia por sesión, vía el archivo FIT de
// cada ejercicio (GET /v3/exercises/{id}/fit -- confirmado en la documentación oficial
// de AccessLink, "ExercisesApi", como el único sub-recurso de detalle que expone la API
// "sin transacción" que usa este archivo; la variante vieja basada en transacciones sí
// tenía /samples y /tcx, pero es un flujo distinto -- crear transacción, listar,
// confirmar -- que no vale la pena migrar solo por esto). Ver fetchFitSplits() más abajo
// y el comentario grande de api/_lib/fit-activity-helpers.js para el detalle de cómo se
// decodifica ese archivo.

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
// Polar documenta que exercise.start_time viene en ISO 8601 con el offset REAL del
// dispositivo (ej. "2026-09-15T21:30:00-03:00" para alguien en Argentina) -- distinto
// del caso de Strava (start_date_local, sin offset real, solo el reloj de pared). Acá
// el offset SÍ está, pero justamente por eso start_time.getUTCDay() da mal: ese método
// convierte primero a UTC y ahí lee el día, perdiendo la fecha local que el offset ya
// te estaba diciendo directamente. Reportado por un usuario con el mismo síntoma en
// Strava (corrida de noche que se cargaba al día siguiente) -- incluso sin poder
// probarlo en vivo contra una cuenta de Polar real, es el mismo patrón de bug. La forma
// correcta de leer el día LOCAL de un string con offset es tomar los primeros 10
// caracteres tal cual (el año-mes-día antes de la hora ya es el calendario local,
// cualquiera sea el offset) en vez de dejar que Date lo convierta a UTC primero.
function localDatePartFromIso(iso) {
  return String(iso || '').slice(0, 10);
}

const { decodeFitRecords, buildSplitsAndSeriesFromFitRecords, emptyFitResult } = require('./fit-activity-helpers');

// Baja y decodifica el archivo FIT de un ejercicio puntual para sacarle
// splits/series/potencia -- ver el comentario grande al principio del archivo y el de
// fit-activity-helpers.js. Se degrada a "sin datos" ante CUALQUIER error (FIT vacío,
// exercise_id inválido, Polar caído, un archivo que el SDK no pueda leer) para que un
// problema acá nunca tire abajo la sincronización completa -- misma filosofía que ya
// tenía este archivo con el resto de los fetches.
async function fetchFitSplits(exerciseId, accessToken) {
  try {
    const res = await fetch(`https://www.polaraccesslink.com/v3/exercises/${exerciseId}/fit`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return emptyFitResult();
    const buf = Buffer.from(await res.arrayBuffer());
    const records = await decodeFitRecords(buf);
    return buildSplitsAndSeriesFromFitRecords(records);
  } catch (e) {
    console.error('polar fetchFitSplits: no se pudo leer el FIT de', exerciseId, e && e.message);
    return emptyFitResult();
  }
}

// exercise: un objeto tal cual lo devuelve GET /v3/exercises (ver schema
// exerciseHashId). "id" acá es el hashed id de Polar -- estable por
// ejercicio, sirve como clave de dedupe (polarId). accessToken es opcional (null/undefined
// = no busca el FIT, más rápido -- mismo criterio que accessToken en activityToRun de
// strava-activity-helpers.js: los sync "ahora" lo omiten para responder rápido, y el cron
// periódico sí lo pasa para completar splits/series/potencia).
async function exerciseToRun(exercise, accessToken) {
  const fit = accessToken ? await fetchFitSplits(exercise.id, accessToken) : emptyFitResult();
  const localDate = localDatePartFromIso(exercise.start_time);
  const startDate = new Date(localDate + 'T00:00:00Z');
  return {
    id: 'polar_' + exercise.id,
    polarId: exercise.id,
    date: exercise.start_time,
    name: null,
    distanceKm: (exercise.distance || 0) / 1000,
    durationSec: parseIsoDurationToSeconds(exercise.duration),
    // Preferimos el ascenso/descenso calculado de la curva de altitud real del FIT
    // (coherente entre sí, ver fit-activity-helpers.js) y caemos al 0 de siempre si no
    // hubo FIT disponible -- mismo criterio que ya usa Strava en activityToRun.
    elevationGain: fit.elevationGain != null ? fit.elevationGain : 0,
    elevationLoss: fit.elevationLoss,
    avgHr: exercise.heart_rate && exercise.heart_rate.average ? Math.round(exercise.heart_rate.average) : null,
    maxHr: exercise.heart_rate && exercise.heart_rate.maximum ? Math.round(exercise.heart_rate.maximum) : null,
    // Antes quedaba siempre null -- el resumen de Polar no trae cadencia, pero el FIT sí
    // (ver buildSplitsAndSeriesFromFitRecords), solo faltaba usarlo acá.
    avgCadence: fit.avgCadence,
    calories: exercise.calories || null,
    hrLog: [],
    points: [],
    splits: fit.splits,
    splitsV: 3,
    series: fit.series,
    // avgPower/maxPower: null si el reloj no tiene sensor de potencia (ej. sin Stryd
    // emparejado) -- ver buildSplitsAndSeriesFromFitRecords en fit-activity-helpers.js.
    avgPower: fit.avgPower,
    maxPower: fit.maxPower,
    shoeId: null,
    source: 'polar',
    planMonday: getMondayISO(localDate),
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
