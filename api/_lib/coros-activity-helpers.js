// api/_lib/coros-activity-helpers.js
//
// Equivalente a strava/polar/wahoo-activity-helpers.js para COROS, pero la forma de
// pedir los datos es totalmente distinta: COROS no expone un REST clásico (GET
// /activities), expone un servidor MCP (Model Context Protocol) -- se le habla en
// JSON-RPC 2.0, pidiendo "herramientas" (tools) en vez de endpoints. callCorosMcpTool()
// de acá abajo es el único lugar que sabe hablar ese protocolo; todo lo demás en
// coros-auth.js/coros-sync-now.js le pide cosas por nombre de tool
// (querySportRecords, getActivityDetail) sin saber los detalles de JSON-RPC.
//
// OJO -- esto se escribió a partir de la documentación pública de COROS
// (support.coros.com, y el endpoint de descubrimiento OAuth en vivo), que describe
// las tools en palabras ("distancia, duración, ritmo...") pero NO publica el JSON
// exacto de entrada/salida de cada una. callCorosMcpTool() y activityToRun() están
// escritas para tolerar variantes razonables de nombres de campo, pero es muy
// probable que haga falta un ajuste puntual la primera vez que se conecte una
// cuenta de COROS real y se puedan ver las respuestas reales en los logs de Vercel
// (buscar "coros: respuesta inesperada" en los logs).

const MCP_ENDPOINT = 'https://mcp.coros.com/mcp';

// Llama una tool del servidor MCP de COROS vía JSON-RPC 2.0. El propio FAQ de COROS
// aclara que su MCP es "stateless" (no hace falta mantener un Mcp-Session-Id entre
// pedidos), así que no hacemos el handshake initialize/initialized que pide el
// protocolo MCP para conexiones con estado -- si en la práctica hiciera falta,
// va a fallar acá con un error de protocolo visible en los logs.
async function callCorosMcpTool(accessToken, toolName, args) {
  const res = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args || {} }
    })
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`coros mcp ${toolName}: HTTP ${res.status} -- ${text.slice(0, 500)}`);
  }

  let body;
  try { body = JSON.parse(text); } catch (e) {
    throw new Error(`coros mcp ${toolName}: respuesta no es JSON -- ${text.slice(0, 500)}`);
  }

  if (body.error) {
    throw new Error(`coros mcp ${toolName}: JSON-RPC error ${body.error.code} -- ${body.error.message}`);
  }

  const result = body.result;
  if (result && result.isError) {
    const msg = (result.content || []).map(c => c.text || '').join(' ');
    throw new Error(`coros mcp ${toolName}: tool error -- ${msg}`);
  }

  // La convención de MCP para tool results es content: [{type:'text', text:'...'}, ...] --
  // muchos servidores (COROS incluido, a juzgar por su propia doc) devuelven ahí un
  // string con JSON adentro en vez de campos estructurados sueltos. Probamos parsearlo;
  // si no es JSON, devolvemos el texto tal cual (por si algún día alguna tool devuelve
  // texto plano de verdad, ej. un resumen).
  const textBlock = result && Array.isArray(result.content)
    ? result.content.find(c => c.type === 'text')
    : null;
  if (!textBlock) return result;
  try { return JSON.parse(textBlock.text); } catch (e) { return textBlock.text; }
}

function isRunningSportCode(sportType) {
  if (sportType == null) return false;
  const s = String(sportType).toLowerCase();
  return s.includes('run');
}

function getMondayISO(d) {
  const dt = new Date(d);
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

// record: un elemento de lo que devuelva querySportRecords (resumen). detail: lo que
// devuelva getActivityDetail para ese mismo id (puede ser null si esa llamada falla --
// preferimos guardar la carrera con menos detalle antes que no guardarla).
// Los nombres de campo (startTime/start_time, distance/totalDistance, etc.) son la
// parte más incierta de este archivo -- ver el comentario grande arriba del todo.
function activityToRun(record, detail) {
  const d = detail || {};
  const startTime = record.startTime || record.start_time || record.date || d.startTime || d.start_time;
  const startDate = new Date(startTime);
  const distanceM = record.distance ?? record.totalDistance ?? d.distance ?? d.totalDistance ?? 0;
  const durationSec = record.duration ?? record.totalDuration ?? record.movingDuration ?? d.duration ?? d.totalDuration ?? 0;
  const id = record.id ?? record.activityId ?? record.labelId;
  return {
    id: 'coros_' + id,
    corosId: id,
    date: startTime,
    name: record.name || record.workoutName || null,
    distanceKm: Number(distanceM) / 1000,
    durationSec: Math.round(Number(durationSec)),
    elevationGain: Math.round(Number(record.elevationGain ?? d.elevationGain ?? d.totalAscent ?? 0)),
    elevationLoss: null,
    avgHr: (record.avgHeartRate ?? d.avgHeartRate) ? Math.round(Number(record.avgHeartRate ?? d.avgHeartRate)) : null,
    maxHr: (record.maxHeartRate ?? d.maxHeartRate) ? Math.round(Number(record.maxHeartRate ?? d.maxHeartRate)) : null,
    avgCadence: (record.avgCadence ?? d.avgCadence) ? Math.round(Number(record.avgCadence ?? d.avgCadence)) : null,
    calories: (record.calories ?? d.calories) ? Math.round(Number(record.calories ?? d.calories)) : null,
    hrLog: [],
    points: [],
    splits: [],
    splitsV: 3,
    series: null,
    shoeId: null,
    source: 'coros',
    planMonday: getMondayISO(startTime),
    planDayIndex: (startDate.getUTCDay() + 6) % 7
  };
}

async function mergeCorosRuns(base, headers, userId, newRuns, mode) {
  if (!newRuns || !newRuns.length) return { merged: false };
  const res = await fetch(`${base}/rest/v1/rpc/merge_coros_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_user_id: userId, p_new_runs: newRuns, p_mode: mode || 'skip' })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`merge_coros_runs rpc failed: ${res.status} ${text}`);
  }
  return { merged: true };
}

// Mismo rol que purgeStravaRunsForUser/purgePolarRunsForUser/purgeWahooRunsForUser --
// se llama al desconectar, para no dejar guardados datos que ya no estamos
// autorizados a conservar.
async function purgeCorosRunsForUser(base, headers, userId) {
  const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers });
  const stateRows = await stateRes.json();
  const data = stateRows && stateRows[0] && stateRows[0].data;
  const hasCorosRuns = data && Array.isArray(data.runs) && data.runs.some(r => r.source === 'coros');
  if (!data || !hasCorosRuns) return;

  data.runs = data.runs.filter(r => r.source !== 'coros');
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
  if (!patchRes.ok) throw new Error(`purgeCorosRunsForUser: PATCH failed: ${patchRes.status} ${await patchRes.text().catch(() => '')}`);
}

// Renueva el access_token con el refresh_token guardado. A diferencia de
// Strava/Wahoo (client_id + client_secret), COROS registró a Zancada como
// cliente público sin secreto (PKCE en vez de secreto) -- ver
// api/coros-init.js -- así que acá no hace falta ni existe un
// COROS_CLIENT_SECRET.
async function refreshCorosToken(base, headers, userId, refreshToken) {
  const tokenRes = await fetch('https://mcpus.coros.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.COROS_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600);
  await fetch(`${base}/rest/v1/coros_connections?user_id=eq.${userId}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || refreshToken,
      expires_at: expiresAt
    })
  });
  return { accessToken: tokenData.access_token, expiresAt };
}

module.exports = {
  callCorosMcpTool,
  isRunningSportCode,
  activityToRun,
  mergeCorosRuns,
  purgeCorosRunsForUser,
  refreshCorosToken
};
