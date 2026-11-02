// api/_lib/garmin-activity-helpers.js
//
// Piezas comunes de la integración con Garmin Connect (Garmin Connect Developer Program, nivel Starter): OAuth2 con PKCE, renovar el token, convertir una actividad de
// Garmin en una carrera de Zancada, sumarla al estado de la persona y borrar lo suyo al desconectar.
//
// Datos de Garmin: SOLO a la base y a la pantalla de Historial. Nunca a Zonda ni a ninguna IA (acuerdo de licencia, sección 15.11): la app los marca con source:'garmin'
// y aiVisibleRuns() los deja afuera.

const { decToken, encToken } = require('./token-crypto');
const { safeId } = require('./safe-id');
const { fetchWithTimeout } = require('./fetch-with-timeout');
const { sanitizeActivityNumbers } = require('./activity-sanity.js');
const { buildSplitsAndSeriesFromFitRecords, buildPointsFromFitRecords, emptyFitResult } = require('./fit-activity-helpers');

const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
const GARMIN_AUTHORIZE_URL = 'https://connect.garmin.com/oauth2Confirm';
const GARMIN_API = 'https://apis.garmin.com';
const REDIRECT_URI = 'https://www.zancada.org/api/garmin-callback';

// Tipos de actividad de correr de Garmin (Apéndice A de la Activity API). El resto (ciclismo, natación, etc.) se ignora.
const RUNNING_TYPES = new Set(['RUNNING', 'INDOOR_RUNNING', 'STREET_RUNNING', 'TRACK_RUNNING', 'TRAIL_RUNNING', 'TREADMILL_RUNNING', 'ULTRA_RUN', 'VIRTUAL_RUN']);
const isRunningActivity = type => RUNNING_TYPES.has(String(type || '').toUpperCase());

const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function getMondayISO(d) {
  const dt = new Date(d);
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

// El id con el que se reconoce la actividad: el detalle ("123-detail") y el resumen ("123") comparten activityId.
function garminActivityId(a) {
  const raw = a && (a.activityId != null ? a.activityId : String(a.summaryId || '').replace(/-(detail|file)$/, ''));
  return raw == null ? '' : String(raw);
}

// summary: un resumen de actividad (Activity API 6.1). detail: opcional, { samples:[...] } del Activity Details (6.3) para la ruta y los parciales.
function activityToRun(summary, detail) {
  const s = summary || {};
  const id = garminActivityId(s);
  const startSec = num(s.startTimeInSeconds) || 0;
  const offsetSec = num(s.startTimeOffsetInSeconds) || 0;
  const localDate = new Date((startSec + offsetSec) * 1000).toISOString().slice(0, 10);
  const startDate = new Date(localDate + 'T00:00:00Z');
  const durationSec = Math.round(num(s.durationInSeconds) || 0);
  const fit = detail && Array.isArray(detail.samples) && detail.samples.length ? fitFromSamples(detail.samples, startSec) : emptyFitResult();
  return sanitizeActivityNumbers({
    id: 'garmin_' + safeId(id),
    garminId: id,
    date: new Date(startSec * 1000).toISOString(),
    name: s.activityName ? String(s.activityName).slice(0, 120) : null,
    distanceKm: (num(s.distanceInMeters) || 0) / 1000,
    durationSec,
    elevationGain: fit.elevationGain != null ? fit.elevationGain : (num(s.totalElevationGainInMeters) != null ? Math.round(num(s.totalElevationGainInMeters)) : null),
    elevationLoss: fit.elevationLoss != null ? fit.elevationLoss : (num(s.totalElevationLossInMeters) != null ? Math.round(num(s.totalElevationLossInMeters)) : null),
    avgHr: num(s.averageHeartRateInBeatsPerMinute) > 0 ? Math.round(num(s.averageHeartRateInBeatsPerMinute)) : (fit.avgHr != null ? fit.avgHr : null),
    maxHr: num(s.maxHeartRateInBeatsPerMinute) > 0 ? Math.round(num(s.maxHeartRateInBeatsPerMinute)) : (fit.maxHr != null ? fit.maxHr : null),
    avgCadence: num(s.averageRunCadenceInStepsPerMinute) > 0 ? Math.round(num(s.averageRunCadenceInStepsPerMinute)) : (fit.avgCadence != null ? fit.avgCadence : null),
    calories: num(s.activeKilocalories) > 0 ? Math.round(num(s.activeKilocalories)) : null,
    hrLog: [],
    points: fit.points || [],
    splits: fit.splits,
    splitsV: fit.splits && fit.splits.length ? 3 : undefined,
    series: fit.series,
    avgPower: fit.avgPower,
    maxPower: fit.maxPower,
    shoeId: null,
    source: 'garmin',
    planMonday: getMondayISO(localDate),
    planDayIndex: (startDate.getUTCDay() + 6) % 7
  });
}

// Las muestras de Activity Details (una por segundo como mucho) -> el formato de "records" que ya entienden los armadores de parciales y de ruta.
function fitFromSamples(samples, startSec) {
  const SEMI = 2147483648 / 180;
  const records = [];
  for (const p of samples.slice(0, 40000)) {
    const t = num(p.startTimeInSeconds);
    if (t == null) continue;
    const r = { timestamp: new Date(t * 1000) };
    const dist = num(p.totalDistanceInMeters); if (dist != null) r.distance = dist;
    const hr = num(p.heartRate); if (hr != null && hr > 0) r.heartRate = hr;
    const cad = num(p.stepsPerMinute); if (cad != null && cad > 0) r.cadence = cad;
    const spd = num(p.speedMetersPerSecond); if (spd != null) r.speed = spd;
    const pw = num(p.powerInWatts); if (pw != null) r.power = pw;
    const alt = num(p.elevationInMeters); if (alt != null) r.altitude = alt;
    const lat = num(p.latitudeInDegree), lon = num(p.longitudeInDegree);
    if (lat != null && lon != null) { r.positionLat = Math.round(lat * SEMI); r.positionLong = Math.round(lon * SEMI); }
    records.push(r);
  }
  if (records.length < 2) return emptyFitResult();
  const result = buildSplitsAndSeriesFromFitRecords(records);
  result.points = buildPointsFromFitRecords(records);
  return result;
}

async function mergeGarminRuns(base, headers, userId, newRuns, mode) {
  if (!newRuns || !newRuns.length) return { merged: false };
  const res = await fetch(`${base}/rest/v1/rpc/merge_garmin_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_user_id: userId, p_new_runs: newRuns, p_mode: mode || 'skip' })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`merge_garmin_runs rpc failed: ${res.status} ${text}`);
  }
  return { merged: true };
}

async function purgeGarminRunsForUser(base, headers, userId) {
  const res = await fetch(`${base}/rest/v1/rpc/purge_provider_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_user_id: userId, p_source: 'garmin' })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`purge_provider_runs rpc failed: ${res.status} ${text}`);
  }
}

// El secreto de la app va SIEMPRE desde el servidor (Garmin no ofrece flujo sin secreto).
function tokenBody(params) {
  return new URLSearchParams(Object.assign({ client_id: process.env.GARMIN_CLIENT_ID || '', client_secret: process.env.GARMIN_CLIENT_SECRET || '' }, params));
}

async function exchangeGarminCode(code, codeVerifier) {
  const res = await fetchWithTimeout(GARMIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody({ grant_type: 'authorization_code', code, code_verifier: codeVerifier, redirect_uri: REDIRECT_URI })
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && !!data.access_token, status: res.status, data };
}

// Devuelve el access token vigente (renovándolo si le quedan menos de 10 min) o null si ya no se puede renovar.
async function ensureFreshGarminToken(base, headers, conn) {
  const now = Math.floor(Date.now() / 1000);
  if (conn.expires_at > now + 600) return decToken(conn.access_token);
  const res = await fetchWithTimeout(GARMIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody({ grant_type: 'refresh_token', refresh_token: decToken(conn.refresh_token) })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.error('garmin refresh: falló', res.status, JSON.stringify({ error: data.error, error_description: data.error_description }).slice(0, 200));
    return null;
  }
  await fetch(`${base}/rest/v1/garmin_connections?user_id=eq.${conn.user_id}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({
      access_token: encToken(data.access_token),
      refresh_token: encToken(data.refresh_token || decToken(conn.refresh_token)),
      expires_at: now + (num(data.expires_in) || 86400),
      refresh_expires_at: data.refresh_token_expires_in ? now + Number(data.refresh_token_expires_in) : conn.refresh_expires_at
    })
  });
  return data.access_token;
}

// Llamada a la API de Garmin con el token de la persona. Devuelve { ok, status, json }.
async function garminCall(accessToken, method, url, body) {
  const res = await fetchWithTimeout(url, {
    method,
    headers: Object.assign({ Authorization: `Bearer ${accessToken}` }, body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined
  }, 15000);
  let json = null;
  const text = await res.text().catch(() => '');
  if (text) { try { json = JSON.parse(text); } catch (e) { json = null; } }
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 300) };
}

// Avisa a Garmin que la persona quitó su conexión desde Zancada (obligatorio por el acuerdo: ver OAuth2 PKCE, "Delete User Registration").
async function deleteGarminRegistration(accessToken) {
  try {
    const r = await garminCall(accessToken, 'DELETE', `${GARMIN_API}/partner-gateway/rest/user/registration`);
    return r.ok || r.status === 401 || r.status === 404;   // 401/404: ya no existía
  } catch (e) { return false; }
}

module.exports = {
  GARMIN_TOKEN_URL, GARMIN_AUTHORIZE_URL, GARMIN_API, REDIRECT_URI, RUNNING_TYPES,
  isRunningActivity, garminActivityId, activityToRun, fitFromSamples, mergeGarminRuns, purgeGarminRunsForUser,
  exchangeGarminCode, ensureFreshGarminToken, garminCall, deleteGarminRegistration
};
