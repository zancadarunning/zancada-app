// api/_lib/wahoo-activity-helpers.js
//
// Equivalente a strava-activity-helpers.js / polar-activity-helpers.js para
// Wahoo. Los datos reales de una sesión (distancia, duración, FC) vienen en
// el objeto anidado "workout_summary" del workout, no en el workout mismo --
// ver GET /v1/workouts en la referencia de la API de Wahoo.
//
// UPDATE: ahora también se traen splits/series/potencia, a partir del archivo FIT que
// Wahoo deja en workout_summary.file.url -- confirmado en la documentación del Cloud
// API (workout_summary trae un campo "file" con la url del FIT de esa sesión). A
// diferencia de Strava/Polar, Wahoo no tiene NINGÚN endpoint de resumen con laps/splits
// ya calculados -- el archivo FIT binario es la única fuente de detalle punto a punto.
// Ver fetchFitSplits() más abajo y el comentario grande de
// api/_lib/fit-activity-helpers.js para cómo se decodifica.

const { sanitizeActivityNumbers } = require('./activity-sanity.js');
const { fetchWithTimeout } = require('./fetch-with-timeout');

// IDs de workout_type_id relacionados a running, según la tabla de tipos de
// la API de Wahoo (cloud-api.wahooligan.com): 1 = running (outdoor), 5 =
// running en cinta, 67 = carrera de running, 71 = running indoor virtual.
const RUNNING_WORKOUT_TYPE_IDS = new Set([1, 5, 67, 71]);

function isRunningWorkoutType(workoutTypeId){
  return RUNNING_WORKOUT_TYPE_IDS.has(Number(workoutTypeId));
}

// BUG SOSPECHADO, ahora arreglado igual que Strava/Polar/COROS: getUTCDay() a partir de
// workout.starts le daba el día de la semana en UTC, no el local -- una corrida de noche
// (pasadas las ~21hs en Argentina, UTC-3) se cargaba con la fecha del día SIGUIENTE.
//
// Seguía sin tocarse acá porque no hay confirmación de si workout.starts de Wahoo viene
// en UTC puro o ya en la hora local del dispositivo -- pero da lo mismo para elegir el
// arreglo: localDatePartFromIso() (mismo helper que ya usa polar-activity-helpers.js)
// toma los primeros 10 caracteres del string ISO tal cual. Si Wahoo manda la hora local
// con su offset real (como Polar) o el reloj de pared re-etiquetado como UTC (como
// Strava), esos primeros 10 caracteres YA son la fecha local correcta. Si en cambio
// starts fuera un instante UTC puro sin ninguna codificación de hora local (el único
// caso donde este arreglo no ayuda), el resultado es idéntico al comportamiento actual
// -- este cambio nunca puede empeorar las cosas, en el peor caso no cambia nada.
function localDatePartFromIso(iso) {
  return String(iso || '').slice(0, 10);
}

function getMondayISO(d){
  const dt = new Date(d);
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

const { decodeFitRecords, buildSplitsAndSeriesFromFitRecords, buildPointsFromFitRecords, emptyFitResult } = require('./fit-activity-helpers');

// Baja y decodifica el archivo FIT de un workout puntual para sacarle
// splits/series/potencia. fitUrl es workout.workout_summary.file.url -- no hay
// confirmación de si esa url ya viene pre-autorizada (ej. un link firmado de S3, que no
// necesitaría el Bearer) o si hace falta el access_token de Wahoo para poder bajarla; se
// manda igual por las dudas (no debería romper una url ya firmada) y, sea cual sea el
// motivo, cualquier error acá se degrada a "sin datos" sin tocar el resto del workout --
// misma filosofía que el resto de los fetches de este archivo.
async function fetchFitSplits(fitUrl, accessToken){
  if (!fitUrl) return emptyFitResult();
  try {
    const res = await fetchWithTimeout(fitUrl, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
    if (!res.ok) return emptyFitResult();
    const buf = Buffer.from(await res.arrayBuffer());
    const records = await decodeFitRecords(buf);
    const result = buildSplitsAndSeriesFromFitRecords(records);
    result.points = buildPointsFromFitRecords(records); // ruta GPS para el mapa
    return result;
  } catch (e) {
    console.error('wahoo fetchFitSplits: no se pudo leer el FIT de', fitUrl, e && e.message);
    return emptyFitResult();
  }
}

// workout: un objeto tal cual lo devuelve GET /v1/workouts, con su
// workout_summary anidado. Los campos numéricos de workout_summary vienen
// como STRING (ej. "24909.71"), hay que parsearlos. accessToken es opcional
// (null/undefined = no busca el FIT, más rápido -- mismo criterio que Strava/Polar: el
// botón "Sincronizar ahora" lo omite, el cron periódico lo pasa).
async function workoutToRun(workout, accessToken){
  const summary = workout.workout_summary || {};
  const fit = accessToken ? await fetchFitSplits(summary.file && summary.file.url, accessToken) : emptyFitResult();
  const localDate = localDatePartFromIso(workout.starts);
  const startDate = new Date(localDate + 'T00:00:00Z');
  const num = (v) => (v != null ? parseFloat(v) : null);
  return sanitizeActivityNumbers({
    id: 'wahoo_' + workout.id,
    wahooId: workout.id,
    date: workout.starts,
    name: workout.name || null,
    distanceKm: (num(summary.distance_accum) || 0) / 1000,
    durationSec: Math.round((num(summary.duration_active_accum) || workout.minutes * 60 || 0)),
    // Preferimos el ascenso/descenso calculado de la curva de altitud real del FIT
    // (coherente entre sí) y caemos al ascent_accum del resumen si no hubo FIT
    // disponible -- mismo criterio que ya usa Strava en activityToRun. elevationLoss
    // antes quedaba siempre null porque el resumen de Wahoo no lo da -- ahora sale del
    // FIT cuando está disponible.
    elevationGain: fit.elevationGain != null ? fit.elevationGain : Math.round(num(summary.ascent_accum) || 0),
    elevationLoss: fit.elevationLoss,
    // OJO: chequear la STRING cruda (summary.heart_rate_avg ? ...) antes de parsearla es
    // el bug que ya tenían estas tres líneas -- un string no vacío como "0.0" (Wahoo lo
    // manda así cuando no hubo banda de FC/podómetro pareado, en vez de omitir la clave)
    // es truthy en JS, así que ese chequeo pasaba igual y guardaba avgHr/avgCadence/
    // calories en 0 en vez de null -- una sesión sin sensor terminaba mostrando "0 bpm"/
    // "0 spm" en el detalle de la carrera, como si el reloj hubiera medido cero de
    // verdad. Acá se parsea PRIMERO con num() y se chequea el NÚMERO ya parseado (0 es
    // falsy de verdad ahí), mismo criterio que ya usa activityToRun de Strava para esto.
    avgHr: num(summary.heart_rate_avg) ? Math.round(num(summary.heart_rate_avg)) : null,
    // El resumen de Wahoo no trae el máximo: sale del FIT cuando está disponible.
    maxHr: fit.maxHr != null ? fit.maxHr : null,
    avgCadence: num(summary.cadence_avg) ? Math.round(num(summary.cadence_avg)) : null,
    calories: num(summary.calories_accum) ? Math.round(num(summary.calories_accum)) : null,
    hrLog: [],
    points: fit.points || [],
    splits: fit.splits,
    // splitsV:3 significa "ya se buscaron los splits reales de verdad" (ver
    // api/wahoo-sync.js, que usa esto para saber qué carreras todavía necesitan
    // completarse) -- antes se ponía siempre, aunque accessToken fuera null y fit
    // viniera vacío (emptyFitResult), así que una carrera cargada por "Sincronizar
    // ahora" (que omite el FIT a propósito, ver el comentario de accessToken arriba)
    // quedaba marcada como "ya completa" para siempre y ningún backfill la volvía a
    // mirar. Ahora solo se marca cuando de verdad se intentó buscar el FIT.
    splitsV: accessToken ? 3 : undefined,
    series: fit.series,
    // avgPower/maxPower: del propio FIT (campo "power" del mensaje record, watts) en vez
    // de un campo de workout_summary -- la doc pública de workout_summary namespacea sus
    // campos de potencia como "power_bike_*" (ej. power_bike_np_last), lo que sugiere que
    // son específicos de ciclismo y no confiables para una carrera a pie; el FIT en
    // cambio trae "power" genérico, que si el dispositivo no tiene sensor de running
    // power (ej. Stryd) simplemente no aparece -- ver buildSplitsAndSeriesFromFitRecords.
    avgPower: fit.avgPower,
    maxPower: fit.maxPower,
    shoeId: null,
    source: 'wahoo',
    planMonday: getMondayISO(localDate),
    planDayIndex: (startDate.getUTCDay() + 6) % 7
  });
}

async function mergeWahooRuns(base, headers, userId, newRuns, mode){
  if (!newRuns || !newRuns.length) return { merged: false };
  const res = await fetch(`${base}/rest/v1/rpc/merge_wahoo_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_user_id: userId, p_new_runs: newRuns, p_mode: mode || 'skip' })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`merge_wahoo_runs rpc failed: ${res.status} ${text}`);
  }
  return { merged: true };
}

// Llama a purge_provider_runs (ver /sql/purge_provider_runs.sql), que hace el
// filtrado y el recálculo de zapatillas en una sola transacción con la fila
// bloqueada -- antes esto era un GET app_state -> mergear en memoria -> PATCH
// app_state que le podía pisar a un usuario un guardado normal hecho justo
// en el medio (mismo problema que ya se había arreglado para mergeWahooRuns).
async function purgeWahooRunsForUser(base, headers, userId){
  const res = await fetch(`${base}/rest/v1/rpc/purge_provider_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_user_id: userId, p_source: 'wahoo' })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`purge_provider_runs rpc failed: ${res.status} ${text}`);
  }
}

// Renueva el access_token con el refresh_token guardado -- los tokens de
// Wahoo vencen a las 2 horas (a diferencia de Polar, que no vencen nunca).
// Devuelve el token nuevo (y lo guarda en wahoo_connections) o null si el
// refresh_token también quedó inválido (el usuario revocó el acceso del
// lado de Wahoo, por ejemplo).
async function refreshWahooToken(base, headers, userId, refreshToken){
  const tokenRes = await fetchWithTimeout('https://api.wahooligan.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.WAHOO_CLIENT_ID,
      client_secret: process.env.WAHOO_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + (tokenData.expires_in || 7200);
  await fetch(`${base}/rest/v1/wahoo_connections?user_id=eq.${userId}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, expires_at: expiresAt })
  });
  return { accessToken: tokenData.access_token, expiresAt };
}

module.exports = { isRunningWorkoutType, workoutToRun, mergeWahooRuns, purgeWahooRunsForUser, refreshWahooToken, fetchFitSplits };
