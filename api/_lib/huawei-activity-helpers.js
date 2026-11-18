// api/_lib/huawei-activity-helpers.js
//
// Conexión con Huawei Health Kit (API REST en la nube, "Server-to-Server"). Equivalente a
// wahoo-activity-helpers.js / polar-activity-helpers.js. Va por el servidor: sirve para cualquier
// celular (Android, iPhone o la web), porque Zancada le pide los datos a la nube de Huawei con el
// permiso que dio la persona con su cuenta de Huawei.
//
// FUENTES (documentación oficial de Huawei, leída el 2026-11-18):
//  - Autorización y renovación del token:
//      https://developer.huawei.com/consumer/en/doc/HMSCore-Guides/auth-example-0000001054581058
//  - Listar carreras:  GET /healthkit/v2/activityRecords?startTime=&endTime=  (ms, máximo 31 días)
//      https://developer.huawei.com/consumer/en/doc/HMSCore-References/activityrecords_list-0000001050114862
//  - Tipos de ejercicio: correr = 56, cinta = 57, running en interior = 128, trail = 130
//      https://developer.huawei.com/consumer/en/doc/HMSCore-Guides/introduction-fitness-record-data-0000001131831088
//  - Cancelar la autorización: DELETE /healthkit/v2/consents/{appId}
//      https://developer.huawei.com/consumer/en/doc/HMSCore-References/cancel-scopes-0000001059462192
//
// SIN VERIFICAR TODAVÍA (se confirma con la primera cuenta de prueba cuando Huawei apruebe la solicitud):
//  - Los nombres de campo de la frecuencia cardíaca y de las calorías dentro de "dataSummary": se leen de
//    forma defensiva (ver pick()) y, si no aparecen, la carrera se importa igual sin ese dato.
//  - La ruta GPS y los parciales: esta primera versión NO los trae (solo el resumen de cada carrera).
//
// PRIVACIDAD: las carreras de Huawei NO se mandan a Zonda ni a ninguna IA (ver AI_RESTRICTED_SOURCES en
// app.js, RESTRICTED_SOURCES en notify-new-run.js y la sección 4 de la política de privacidad).

const { encToken } = require('./token-crypto');
const { safeId } = require('./safe-id');
const { sanitizeActivityNumbers } = require('./activity-sanity.js');
const { fetchWithTimeout } = require('./fetch-with-timeout');

const OAUTH_TOKEN_URL = 'https://oauth-login.cloud.huawei.com/oauth2/v3/token';
const HEALTH_API = 'https://health-api.cloud.huawei.com/healthkit/v2';
const RUNNING_ACTIVITY_TYPES = new Set([56, 57, 128, 130]);
const MAX_RANGE_MS = 31 * 24 * 3600 * 1000;   // Huawei no acepta rangos de más de 31 días

const T = {
  distance: 'com.huawei.continuous.distance.total',
  hr: 'com.huawei.continuous.exercise_heart_rate.statistics',
  calories: 'com.huawei.continuous.calories.burnt.total'
};

function isRunningActivityType(t) { return RUNNING_ACTIVITY_TYPES.has(Number(t)); }

// "+0800" o "-0300" -> minutos de diferencia con UTC (0 si no se entiende)
function tzOffsetMinutes(tz) {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(String(tz || '').trim());
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

// ISO con el desfase real (2026-11-18T10:30:00+08:00): los primeros 10 caracteres son la fecha LOCAL de la carrera
// (igual que Polar) y, al mismo tiempo, el instante sigue siendo correcto para detectar duplicados contra otras fuentes.
function localIsoWithOffset(startMs, tz) {
  const off = tzOffsetMinutes(tz);
  const wall = new Date(startMs + off * 60000).toISOString().slice(0, 19);
  const sign = off < 0 ? '-' : '+', abs = Math.abs(off);
  return `${wall}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function getMondayISO(dateStr) {
  const dt = new Date(dateStr + 'T00:00:00Z');
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return dt.toISOString().slice(0, 10);
}

// Busca en activitySummary.dataSummary el dato de un tipo y devuelve el valor numérico del campo pedido
// (o del primero si el campo no aparece). Devuelve null si no hay nada utilizable.
function pick(record, typeName, fieldName) {
  const list = record && record.activitySummary && Array.isArray(record.activitySummary.dataSummary) ? record.activitySummary.dataSummary : [];
  const item = list.find(d => d && d.dataTypeName === typeName);
  if (!item || !Array.isArray(item.value)) return null;
  const f = item.value.find(v => v && v.fieldName === fieldName) || item.value[0];
  if (!f) return null;
  for (const k of ['floatValue', 'intValue', 'doubleValue']) {
    const n = Number(f[k]);
    if (f[k] != null && Number.isFinite(n)) return n;
  }
  return null;
}

// ¿Es una carrera que se hizo de verdad? (tipo de correr, con duración o distancia reales)
function isImportableRecord(r) {
  if (!r || !isRunningActivityType(r.activityType)) return false;
  const start = Number(r.startTime), end = Number(r.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  const dist = pick(r, T.distance, 'distance');
  return (dist != null && dist > 0) || (Number(r.activeTime) > 0);
}

function recordToRun(r) {
  const startMs = Number(r.startTime), endMs = Number(r.endTime);
  const iso = localIsoWithOffset(startMs, r.timeZone);
  const localDate = iso.slice(0, 10);
  const distM = pick(r, T.distance, 'distance');
  const activeMs = Number(r.activeTime) > 0 ? Number(r.activeTime) : (endMs - startMs);
  const avgHr = pick(r, T.hr, 'avg'), maxHr = pick(r, T.hr, 'max');
  const cal = pick(r, T.calories, 'calories');
  return sanitizeActivityNumbers({
    id: 'huawei_' + safeId(r.id),
    huaweiId: String(r.id),
    date: iso,
    name: r.name ? String(r.name).slice(0, 80) : null,
    distanceKm: (distM || 0) / 1000,
    durationSec: Math.round(activeMs / 1000),
    elevationGain: 0,
    elevationLoss: null,
    avgHr: avgHr ? Math.round(avgHr) : null,
    maxHr: maxHr ? Math.round(maxHr) : null,
    avgCadence: null,
    calories: cal ? Math.round(cal) : null,
    hrLog: [],
    points: [],
    splits: [],
    shoeId: null,
    source: 'huawei',
    planMonday: getMondayISO(localDate),
    planDayIndex: (new Date(localDate + 'T00:00:00Z').getUTCDay() + 6) % 7
  });
}

function healthHeaders(accessToken) {
  const h = { 'Content-Type': 'application/json; charset=UTF-8', Authorization: `Bearer ${accessToken}` };
  if (process.env.HUAWEI_CLIENT_ID) h['x-client-id'] = process.env.HUAWEI_CLIENT_ID;
  return h;
}

// Carreras entre dos instantes (ms). Sigue el cursor si hay más datos (tope de páginas para no colgar la función).
// Devuelve { ok, status, privacy, records } -- privacy viene del encabezado x-health-app-privacy
// (1 = autorizado, 2 = sin autorizar en Huawei Health, 3 = no es usuario de Huawei Health).
async function fetchRunRecords(accessToken, startMs, endMs) {
  const start = Math.max(startMs, endMs - MAX_RANGE_MS);
  const records = [];
  let privacy = null;
  let url = `${HEALTH_API}/activityRecords?startTime=${Math.floor(start)}&endTime=${Math.floor(endMs)}`;   // sin filtrar por tipo en el pedido (la doc no aclara cómo se manda una lista): se filtra acá, con isImportableRecord
  for (let page = 0; page < 5 && url; page++) {
    const res = await fetchWithTimeout(url, { headers: healthHeaders(accessToken) });
    if (page === 0) privacy = Number(res.headers && res.headers.get && res.headers.get('x-health-app-privacy')) || null;
    if (!res.ok) return { ok: false, status: res.status, privacy, records };
    const data = await res.json().catch(() => ({}));
    for (const r of (data && data.activityRecord) || []) records.push(r);
    url = (data && data.hasMoreData && data.cursor) ? `${HEALTH_API}/activityRecords?cursor=${encodeURIComponent(data.cursor)}` : null;
  }
  return { ok: true, status: 200, privacy, records };
}

async function mergeHuaweiRuns(base, headers, userId, newRuns, mode) {
  if (!newRuns || !newRuns.length) return { merged: false };
  const res = await fetch(`${base}/rest/v1/rpc/merge_huawei_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_user_id: userId, p_new_runs: newRuns, p_mode: mode || 'skip' })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`merge_huawei_runs rpc failed: ${res.status} ${text}`);
  }
  return { merged: true };
}

async function purgeHuaweiRunsForUser(base, headers, userId) {
  const res = await fetch(`${base}/rest/v1/rpc/purge_provider_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_user_id: userId, p_source: 'huawei' })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`purge_provider_runs rpc failed: ${res.status} ${text}`);
  }
}

// El access_token de Huawei dura 1 hora (expires_in = 3600); el refresh_token, 180 días por defecto. La renovación NO devuelve un
// refresh_token nuevo: se sigue usando el que ya se tiene. Devuelve { accessToken, expiresAt } o null si el permiso ya no vale
// (cambió la contraseña, la persona quitó el acceso, etc.: hay que volver a conectar).
async function refreshHuaweiToken(base, headers, userId, refreshToken) {
  const tokenRes = await fetchWithTimeout(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.HUAWEI_CLIENT_ID,
      client_secret: process.env.HUAWEI_CLIENT_SECRET
    })
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenData.access_token) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + (Number(tokenData.expires_in) || 3600);
  await fetch(`${base}/rest/v1/huawei_connections?user_id=eq.${userId}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ access_token: encToken(tokenData.access_token), expires_at: expiresAt })
  });
  return { accessToken: tokenData.access_token, expiresAt };
}

// Revoca el permiso del lado de Huawei (best-effort). Sin deleteData: lo que Zancada creó en Huawei Health, si algo, lo borra Huawei a los 3 días.
async function cancelHuaweiConsent(accessToken) {
  const appId = process.env.HUAWEI_CLIENT_ID;
  if (!appId || !accessToken) return false;
  const res = await fetchWithTimeout(`${HEALTH_API}/consents/${encodeURIComponent(appId)}?deleteData=false`, { method: 'DELETE', headers: healthHeaders(accessToken) });
  return res.ok;
}

module.exports = {
  OAUTH_TOKEN_URL, HEALTH_API, RUNNING_ACTIVITY_TYPES, MAX_RANGE_MS,
  isRunningActivityType, isImportableRecord, recordToRun, tzOffsetMinutes, localIsoWithOffset,
  fetchRunRecords, mergeHuaweiRuns, purgeHuaweiRunsForUser, refreshHuaweiToken, cancelHuaweiConsent
};
