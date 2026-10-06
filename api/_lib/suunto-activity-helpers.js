// api/_lib/suunto-activity-helpers.js
//
// Equivalente a wahoo-activity-helpers.js para Suunto (Cloud API).
//
// Lo que está confirmado en la documentación pública de apizone.suunto.com (octubre 2026):
//   - OAuth: https://cloudapi-oauth.suunto.com (authorize / token), el canje de código y
//     el refresh se autentican con HTTP Basic client_id:client_secret.
//   - API de datos: https://cloudapi.suunto.com. TODOS los pedidos llevan dos headers:
//     Authorization: Bearer <access_token> y Ocp-Apim-Subscription-Key: <clave de suscripción>.
//   - El access_token es un JWT con el claim "user" (usuario de la app Suunto), que es lo
//     que manda el webhook de entrenos nuevos para identificar a la persona.
//   - Los tokens duran 24 hs (expires_in 86400) y vienen con refresh_token.

const { fetchWithTimeout } = require('./fetch-with-timeout');
const { sanitizeActivityNumbers } = require('./activity-sanity.js');
const { decodeFitRecords, buildSplitsAndSeriesFromFitRecords, buildPointsFromFitRecords, emptyFitResult } = require('./fit-activity-helpers');

const SUUNTO_OAUTH_BASE = 'https://cloudapi-oauth.suunto.com';
const SUUNTO_API_BASE = 'https://cloudapi.suunto.com';

// IDs de actividad de Suunto que son correr, según Activities.pdf de API Zone (octubre 2026):
// 1 Running, 22 Trail running, 53 Treadmill, 59 Track and field, 103 Track running,
// 115 Vertical running. Orienteering (60) y Swimrun (92) quedan afuera a propósito.
const RUNNING_ACTIVITY_IDS = new Set([1, 22, 53, 59, 103, 115]);

function isRunningActivity(activityId) {
  return RUNNING_ACTIVITY_IDS.has(Number(activityId));
}

function basicAuthHeader() {
  const raw = `${process.env.SUUNTO_CLIENT_ID}:${process.env.SUUNTO_CLIENT_SECRET}`;
  return 'Basic ' + Buffer.from(raw).toString('base64');
}

// Headers para cualquier pedido a la API de datos de Suunto.
function suuntoApiHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Ocp-Apim-Subscription-Key': process.env.SUUNTO_SUBSCRIPTION_KEY || ''
  };
}

// Lee el claim "user" del JWT sin verificar la firma (acabamos de recibir el token
// directo de Suunto por HTTPS, no hay nada que verificar acá -- solo necesitamos el dato).
function suuntoUsernameFromToken(accessToken) {
  try {
    const payload = String(accessToken || '').split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return json && json.user ? String(json.user) : null;
  } catch (e) {
    return null;
  }
}

function getMondayISO(d) {
  const dt = new Date(d);
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

// Baja y decodifica el FIT de un entreno (GET /v3/workouts/{workoutKey}/fit) para sacarle
// splits/series/potencia. Cualquier error se degrada a "sin datos" sin tocar el resto del
// entreno -- mismo criterio que fetchFitSplits de Wahoo/Polar.
async function fetchSuuntoFit(workoutKey, accessToken) {
  if (!workoutKey || !accessToken) return emptyFitResult();
  try {
    const res = await fetchWithTimeout(`${SUUNTO_API_BASE}/v3/workouts/${encodeURIComponent(workoutKey)}/fit`, {
      headers: suuntoApiHeaders(accessToken)
    });
    // _failed distingue "el pedido falló (red, 5xx, token) -> reintentar más tarde" de "el FIT
    // llegó pero no traía datos útiles -> no vale la pena reintentar", para el backfill del cron.
    if (!res.ok) return Object.assign(emptyFitResult(), { _failed: true });
    const buf = Buffer.from(await res.arrayBuffer());
    const records = await decodeFitRecords(buf);
    const result = buildSplitsAndSeriesFromFitRecords(records);
    // La ruta GPS (para el mapa) también sale del FIT: el resumen del entreno que manda Suunto no la trae.
    result.points = buildPointsFromFitRecords(records);
    return result;
  } catch (e) {
    console.error('suunto fetchSuuntoFit: no se pudo leer el FIT de', workoutKey, e && e.message);
    return Object.assign(emptyFitResult(), { _failed: true });
  }
}

// Si el access_token venció, lo renueva (y lo guarda). Devuelve el token vigente o null si
// la renovación falló (el usuario revocó el acceso, por ejemplo).
async function ensureFreshSuuntoToken(base, headers, conn) {
  if (conn.expires_at > Math.floor(Date.now() / 1000) + 60) return conn.access_token;
  const refreshed = await refreshSuuntoToken(base, headers, conn.user_id, conn.refresh_token);
  return refreshed ? refreshed.accessToken : null;
}

// GET /v3/workouts?since=<epoch ms>&limit=<n> -- devuelve el array de entrenos (puede venir
// vacío) o lanza si el pedido falla. La respuesta es { error, metadata, payload: [...] }.
async function listSuuntoWorkouts(accessToken, sinceMs, limit) {
  const url = `${SUUNTO_API_BASE}/v3/workouts?since=${Math.max(0, Math.floor(sinceMs))}&limit=${limit || 50}`;
  const res = await fetchWithTimeout(url, { headers: suuntoApiHeaders(accessToken) });
  if (!res.ok) throw new Error(`suunto list workouts failed: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json().catch(() => null);
  const payload = data && (data.payload || data.workouts);
  return Array.isArray(payload) ? payload : [];
}

// workout: el objeto "workout" tal cual lo manda el webhook (type WORKOUT_CREATED) o lo
// devuelve GET /v3/workouts. Unidades según la documentación de API Zone: startTime en
// epoch ms, totalTime en segundos, totalDistance en metros, totalAscent/Descent en metros,
// energyConsumption en kcal, hrdata.workoutAvgHR/MaxHR en bpm, timeOffsetInMinutes = huso
// del entreno (para calcular la fecha LOCAL: una corrida de noche no cae en el día siguiente).
// fit es opcional (resultado de fetchSuuntoFit): sin él, la carrera queda sin splits y
// sin splitsV, y el backfill del cron (suunto-sync.js) la completa después.
function workoutToRun(workout, fit) {
  fit = fit || emptyFitResult();
  const startMs = Number(workout.startTime);
  const offsetMin = Number(workout.timeOffsetInMinutes) || 0;
  const localDate = new Date(startMs + offsetMin * 60000).toISOString().slice(0, 10);
  const startDate = new Date(localDate + 'T00:00:00Z');
  const durationSec = Math.round(Number(workout.totalTime) || 0);
  const steps = Number(workout.stepCount) || 0;
  const hr = workout.hrdata || {};
  const key = String(workout.workoutKey || workout.key || '');
  return sanitizeActivityNumbers({
    id: 'suunto_' + key,
    suuntoId: key,
    date: new Date(startMs).toISOString(),
    name: workout.workoutName || null,
    distanceKm: (Number(workout.totalDistance) || 0) / 1000,
    durationSec,
    elevationGain: fit.elevationGain != null ? fit.elevationGain : Math.round(Number(workout.totalAscent) || 0),
    elevationLoss: fit.elevationLoss != null ? fit.elevationLoss : (workout.totalDescent != null ? Math.round(Number(workout.totalDescent) || 0) : null),
    avgHr: Number(hr.workoutAvgHR) > 0 ? Math.round(Number(hr.workoutAvgHR)) : null,
    maxHr: Number(hr.workoutMaxHR) > 0 ? Math.round(Number(hr.workoutMaxHR)) : null,
    // Cadencia en pasos por minuto: del FIT si hay; si no, pasos totales / minutos.
    avgCadence: fit.avgCadence != null ? fit.avgCadence : (steps > 0 && durationSec > 0 ? Math.round(steps / (durationSec / 60)) : null),
    calories: Number(workout.energyConsumption) > 0 ? Math.round(Number(workout.energyConsumption)) : null,
    hrLog: [],
    points: fit.points || [],
    splits: fit.splits,
    splitsV: fit.splits && fit.splits.length ? 3 : undefined,
    series: fit.series,
    avgPower: fit.avgPower,
    maxPower: fit.maxPower,
    shoeId: null,
    source: 'suunto',
    planMonday: getMondayISO(localDate),
    planDayIndex: (startDate.getUTCDay() + 6) % 7
  });
}

async function mergeSuuntoRuns(base, headers, userId, newRuns, mode) {
  if (!newRuns || !newRuns.length) return { merged: false };
  const res = await fetch(`${base}/rest/v1/rpc/merge_suunto_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_user_id: userId, p_new_runs: newRuns, p_mode: mode || 'skip' })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`merge_suunto_runs rpc failed: ${res.status} ${text}`);
  }
  return { merged: true };
}

// Mismo mecanismo atómico que el resto de las marcas (ver sql/purge_provider_runs.sql).
async function purgeSuuntoRunsForUser(base, headers, userId) {
  const res = await fetch(`${base}/rest/v1/rpc/purge_provider_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_user_id: userId, p_source: 'suunto' })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`purge_provider_runs rpc failed: ${res.status} ${text}`);
  }
}

// Renueva el access_token con el refresh_token guardado. Devuelve el token nuevo (y lo
// guarda en suunto_connections) o null si el refresh_token también quedó inválido (el
// usuario revocó el acceso del lado de Suunto, por ejemplo).
//
// OJO: la documentación pública que se pudo leer no describe el pedido de refresh; se usa
// el estándar OAuth 2 (grant_type=refresh_token, mismo Basic auth que el canje de código).
// Si la primera renovación real falla, revisar la página de la Authorization API en API Zone.
async function refreshSuuntoToken(base, headers, userId, refreshToken) {
  const tokenRes = await fetchWithTimeout(`${SUUNTO_OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuthHeader() },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenData.access_token) {
    console.error('suunto refreshSuuntoToken: refresh failed', tokenRes.status, JSON.stringify(tokenData).slice(0, 200));
    return null;
  }
  const expiresAt = Math.floor(Date.now() / 1000) + (tokenData.expires_in || 86400);
  await fetch(`${base}/rest/v1/suunto_connections?user_id=eq.${userId}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({
      access_token: tokenData.access_token,
      // Algunos proveedores no rotan el refresh_token en cada renovación: si no viene uno
      // nuevo, conservamos el que ya teníamos en vez de pisarlo con undefined.
      refresh_token: tokenData.refresh_token || refreshToken,
      expires_at: expiresAt
    })
  });
  return { accessToken: tokenData.access_token, expiresAt };
}

module.exports = {
  SUUNTO_OAUTH_BASE,
  SUUNTO_API_BASE,
  isRunningActivity,
  basicAuthHeader,
  suuntoApiHeaders,
  suuntoUsernameFromToken,
  fetchSuuntoFit,
  ensureFreshSuuntoToken,
  listSuuntoWorkouts,
  workoutToRun,
  mergeSuuntoRuns,
  purgeSuuntoRunsForUser,
  refreshSuuntoToken
};
