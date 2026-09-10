// api/_lib/wahoo-activity-helpers.js
//
// Equivalente a strava-activity-helpers.js / polar-activity-helpers.js para
// Wahoo. Los datos reales de una sesión (distancia, duración, FC) vienen en
// el objeto anidado "workout_summary" del workout, no en el workout mismo --
// ver GET /v1/workouts en la referencia de la API de Wahoo.

// IDs de workout_type_id relacionados a running, según la tabla de tipos de
// la API de Wahoo (cloud-api.wahooligan.com): 1 = running (outdoor), 5 =
// running en cinta, 67 = carrera de running, 71 = running indoor virtual.
const RUNNING_WORKOUT_TYPE_IDS = new Set([1, 5, 67, 71]);

function isRunningWorkoutType(workoutTypeId){
  return RUNNING_WORKOUT_TYPE_IDS.has(Number(workoutTypeId));
}

function getMondayISO(d){
  const dt = new Date(d);
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

// workout: un objeto tal cual lo devuelve GET /v1/workouts, con su
// workout_summary anidado. Los campos numéricos de workout_summary vienen
// como STRING (ej. "24909.71"), hay que parsearlos.
function workoutToRun(workout){
  const summary = workout.workout_summary || {};
  const startDate = new Date(workout.starts);
  const num = (v) => (v != null ? parseFloat(v) : null);
  return {
    id: 'wahoo_' + workout.id,
    wahooId: workout.id,
    date: workout.starts,
    name: workout.name || null,
    distanceKm: (num(summary.distance_accum) || 0) / 1000,
    durationSec: Math.round((num(summary.duration_active_accum) || workout.minutes * 60 || 0)),
    elevationGain: Math.round(num(summary.ascent_accum) || 0),
    elevationLoss: null,
    avgHr: summary.heart_rate_avg ? Math.round(num(summary.heart_rate_avg)) : null,
    maxHr: null,
    avgCadence: summary.cadence_avg ? Math.round(num(summary.cadence_avg)) : null,
    calories: summary.calories_accum ? Math.round(num(summary.calories_accum)) : null,
    hrLog: [],
    points: [],
    splits: [],
    splitsV: 3,
    series: null,
    shoeId: null,
    source: 'wahoo',
    planMonday: getMondayISO(workout.starts),
    planDayIndex: (startDate.getUTCDay() + 6) % 7
  };
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

async function purgeWahooRunsForUser(base, headers, userId){
  const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers });
  const stateRows = await stateRes.json();
  const data = stateRows && stateRows[0] && stateRows[0].data;
  const hasWahooRuns = data && Array.isArray(data.runs) && data.runs.some(r => r.source === 'wahoo');
  if (!data || !hasWahooRuns) return;

  data.runs = data.runs.filter(r => r.source !== 'wahoo');
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
  if (!patchRes.ok) throw new Error(`purgeWahooRunsForUser: PATCH failed: ${patchRes.status} ${await patchRes.text().catch(() => '')}`);
}

// Renueva el access_token con el refresh_token guardado -- los tokens de
// Wahoo vencen a las 2 horas (a diferencia de Polar, que no vencen nunca).
// Devuelve el token nuevo (y lo guarda en wahoo_connections) o null si el
// refresh_token también quedó inválido (el usuario revocó el acceso del
// lado de Wahoo, por ejemplo).
async function refreshWahooToken(base, headers, userId, refreshToken){
  const tokenRes = await fetch('https://api.wahooligan.com/oauth/token', {
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

module.exports = { isRunningWorkoutType, workoutToRun, mergeWahooRuns, purgeWahooRunsForUser, refreshWahooToken };
