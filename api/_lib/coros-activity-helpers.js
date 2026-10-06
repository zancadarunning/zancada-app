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
//
// Splits/series/potencia por km (evaluado, descartado por ahora): el servidor MCP de
// COROS lista tools llamadas queryActivityLapData y getActivityDetail que en teoría
// darían justo esto (ver github.com/coroslab/COROS-MCP), pero al igual que
// callCorosMcpTool/querySportRecords, NINGUNA fuente pública documenta el JSON exacto
// que devuelven -- y ya hay un caso confirmado en producción (ver el comentario grande
// de parseCorosSportRecordsText más abajo) de una tool de este mismo servidor que, pese
// a "sonar" estructurada, en la práctica devuelve un reporte de texto para humanos, no
// JSON. Escribir un parser para queryActivityLapData/getActivityDetail hoy sería
// adivinar su formato sin poder confirmarlo contra una respuesta real -- exactamente el
// patrón "adivinado, nunca confirmado" que este archivo viene arrastrando y que conviene
// no repetir. Para Wahoo/Polar sí se pudo resolver splits/series/potencia (ver
// wahoo-activity-helpers.js/polar-activity-helpers.js) porque ahí la fuente es un
// archivo FIT, un formato binario público y estable con especificación oficial -- COROS
// no tiene un equivalente entre las tools que expone su MCP. Queda pendiente para
// cuando se pueda capturar una respuesta real de queryActivityLapData en los logs de
// Vercel de una cuenta conectada (mismo camino que ya se usó para confirmar el formato
// de querySportRecords).

const { sanitizeActivityNumbers } = require('./activity-sanity.js');
const { fetchWithTimeout } = require('./fetch-with-timeout');

const MCP_ENDPOINT = 'https://mcp.coros.com/mcp';

// Llama una tool del servidor MCP de COROS vía JSON-RPC 2.0. El propio FAQ de COROS
// aclara que su MCP es "stateless" (no hace falta mantener un Mcp-Session-Id entre
// pedidos), así que no hacemos el handshake initialize/initialized que pide el
// protocolo MCP para conexiones con estado -- si en la práctica hiciera falta,
// va a fallar acá con un error de protocolo visible en los logs.
async function callCorosMcpTool(accessToken, toolName, args) {
  const res = await fetchWithTimeout(MCP_ENDPOINT, {
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

  // Mandamos "Accept: text/event-stream" (lo pide el transporte "Streamable HTTP" de MCP
  // para pedidos que puedan tardar), pero el servidor decide solo con qué formato contesta
  // -- puede ser JSON plano de una, o un stream de eventos SSE ("event: message\ndata:
  // {...}\n\n"). Antes acá se asumía siempre JSON plano y se rompía apenas COROS mandara
  // SSE en cualquier respuesta (nunca probado contra una cuenta real, ver el comentario
  // grande al principio del archivo). Si el content-type dice event-stream, primero
  // sacamos el JSON de adentro de las líneas "data: ".
  let jsonText = text;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    const dataLines = text.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
    if (!dataLines.length) {
      throw new Error(`coros mcp ${toolName}: stream SSE sin ninguna línea "data:" -- ${text.slice(0, 500)}`);
    }
    jsonText = dataLines.join('');
  }

  let body;
  try { body = JSON.parse(jsonText); } catch (e) {
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

// CONFIRMADO en producción (2026-09-17, logs de Vercel): querySportRecords NO devuelve JSON
// cuando SÍ hay actividades -- devuelve un reporte de texto para humanos con esta forma:
//
//   Sport Records — 2026-08-18 to 2026-09-17 (1 records)
//   ========================
//
//   1. Trail Run — 2026-09-06
//      Location: Trail
//      Time Window: startTimestamp=1788732961 | endTimestamp=1788735434
//      Duration: 40:54 | Distance: 3.08 km
//      Average Pace: 13:18 /km | Avg HR: 125 bpm | Calories: 374 kcal
//      LabelId: 480160020539933272 | SportType: 102
//
// callCorosMcpTool() ya intenta JSON.parse() y, si falla (como acá), devuelve el texto tal
// cual -- este parser saca de ahí una lista de actividades. El "SportType" numérico (102) NO
// coincide con ninguna tabla mode/subMode de la API REST oficial de COROS (esta herramienta
// "MCP" tiene su propia numeración interna, sin documentar) -- por eso para decidir si es una
// corrida usamos el título ("Trail Run"), que alcanza con que contenga "run".
function parseCorosSportRecordsText(text) {
  const chunks = String(text).split(/\n(?=\d+\.\s)/).filter(c => /^\d+\.\s/.test(c.trim()));
  const toSeconds = (mmss) => String(mmss).split(':').map(Number).reduce((acc, v) => acc * 60 + v, 0);
  return chunks.map(chunk => {
    const header = chunk.match(/^\d+\.\s+(.+?)\s+—\s+(\d{4}-\d{2}-\d{2})/);
    const time = chunk.match(/startTimestamp=(\d+)\s*\|\s*endTimestamp=(\d+)/);
    const durDist = chunk.match(/Duration:\s*([\d:]+)\s*\|\s*Distance:\s*([\d.]+)\s*km/);
    const hr = chunk.match(/Avg HR:\s*(\d+)\s*bpm/);
    const cal = chunk.match(/Calories:\s*(\d+)\s*kcal/);
    const id = chunk.match(/LabelId:\s*(\d+)/);
    const sport = chunk.match(/SportType:\s*(\d+)/);
    if (!header || !time || !id) return null;
    return {
      title: header[1].trim(),
      dateStr: header[2],
      startTimestamp: Number(time[1]),
      endTimestamp: Number(time[2]),
      durationSec: durDist ? toSeconds(durDist[1]) : (Number(time[2]) - Number(time[1])),
      distanceKm: durDist ? Number(durDist[2]) : 0,
      avgHr: hr ? Number(hr[1]) : null,
      calories: cal ? Number(cal[1]) : null,
      labelId: id[1],
      sportType: sport ? Number(sport[1]) : undefined
    };
  }).filter(Boolean);
}
function isRunningTitle(title) {
  return /run/i.test(String(title || ''));
}
// Normaliza la respuesta cruda de querySportRecords (el reporte de texto real de arriba, o
// por si algún día cambia a JSON estructurado) a una lista de actividades de running -- así
// coros-auth.js/coros-sync-now.js/coros-sync.js no repiten la misma lógica de filtrado 3 veces.
function getCorosRunRecords(rawResponse) {
  if (typeof rawResponse === 'string') {
    return parseCorosSportRecordsText(rawResponse).filter(r => isRunningTitle(r.title));
  }
  const list = Array.isArray(rawResponse) ? rawResponse : (rawResponse && rawResponse.records) || [];
  return list.filter(r => {
    const sport = r.sportType ?? r.sport_type ?? r.sportName ?? '';
    return String(sport).toLowerCase().includes('run');
  });
}
function getCorosRecordId(record) {
  return record.labelId ?? record.id ?? record.activityId;
}

// El PDF oficial "COROS API Reference" (sección 4.2) confirma que querySportRecords espera
// startDate/endDate en formato YYYYMMDD (entero), con un rango máximo de 30 días por pedido --
// antes se mandaba {limit:10}, un parámetro que la herramienta ignoraba en silencio, cayendo
// en su propio default (una semana hacia atrás desde hoy). Un usuario que corrió hace más de
// una semana nunca iba a aparecer con eso, aunque la corrida ya estuviera sincronizada en la
// nube de COROS. Pedir siempre los últimos 30 días (el máximo permitido por pedido) es la
// ventana más ancha posible sin necesitar paginar.
function corosDateRangeArgs(days) {
  const fmt = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const end = new Date();
  const start = new Date(end.getTime() - (days || 30) * 86400000);
  return { startDate: Number(fmt(start)), endDate: Number(fmt(end)) };
}

function getMondayISO(d) {
  const dt = new Date(d);
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

// CONFIRMADO en producción (2026-10-06, sonda de Sentry): getActivityDetail (con labelId + sportType, ambos
// obligatorios) devuelve OTRO reporte de texto, con esta forma (acá con los valores enmascarados):
//
//   🏃 Outdoor Run Activity Details
//   Workout Time: #:##   Distance: #.## km   Total Time: #:##
//   Average Pace: #:## /km   Moving Average Pace: #:## /km   Adjusted Pace: #:## /km
//   Average Heart Rate: ### bpm   Average Cadence: ### spm   Average Stride Length: #.## m
//   Average Power: ### W   Elevation Gain / Loss: # m / # m   Calories: ## kcal
//   Training Load: #   Aerobic TE: #.#   Anaerobic TE: #.#   Performance: -#
//
// (una línea por dato). De ahí salen cadencia, potencia y desnivel, que el resumen de querySportRecords no trae.
function parseCorosActivityDetailText(text) {
  const t = String(text || '');
  const num = (re) => { const m = t.match(re); if (!m) return null; const v = Number(m[1]); return Number.isFinite(v) && v > 0 ? v : null; };
  const eg = t.match(/Elevation Gain\s*\/\s*Loss:\s*(-?\d+(?:\.\d+)?)\s*m\s*\/\s*(-?\d+(?:\.\d+)?)\s*m/i);
  return {
    avgCadence: num(/Average Cadence:\s*(\d+(?:\.\d+)?)\s*spm/i),
    avgPower: num(/Average Power:\s*(\d+(?:\.\d+)?)\s*W/i),
    avgStrideM: num(/Average Stride Length:\s*(\d+(?:\.\d+)?)\s*m/i),
    avgHr: num(/Average Heart Rate:\s*(\d+)\s*bpm/i),
    elevationGain: eg ? Math.round(Math.abs(Number(eg[1]))) : null,
    elevationLoss: eg ? Math.round(Math.abs(Number(eg[2]))) : null
  };
}
// Completa un record de querySportRecords con el detalle de la actividad. Nunca rompe el sync: si la tool falla o
// cambia de formato, el record queda como estaba.
async function enrichCorosRecord(accessToken, record) {
  if (!record || record.sportType == null || !record.labelId) return record;
  try {
    const raw = await callCorosMcpTool(accessToken, 'getActivityDetail', { labelId: record.labelId, sportType: record.sportType });
    if (typeof raw === 'string') {
      const d = parseCorosActivityDetailText(raw);
      for (const k of Object.keys(d)) if (d[k] != null) record[k] = d[k];
    }
  } catch (e) { /* sin detalle, queda el resumen */ }
  return record;
}

// record: una actividad ya normalizada por getCorosRunRecords() -- en el caso real y
// confirmado (el reporte de texto de querySportRecords, ver parseCorosSportRecordsText),
// trae dateStr/startTimestamp/endTimestamp/durationSec/distanceKm/avgHr/calories/labelId.
// dateStr ("2026-09-06") es la fecha que el propio reporte de COROS ya da como texto -- la
// usamos directo para planMonday/planDayIndex (mismo criterio que localDatePartFromIso en
// polar-activity-helpers.js: confiar en el campo de fecha ya resuelto por el proveedor en
// vez de recalcularlo nosotros con getUTCDay() sobre el timestamp crudo, que perdería
// cualquier ajuste de zona horaria que el reporte ya haya hecho). startTimestamp SÍ es un
// instante UTC genuino y sirve tal cual para el campo `date` (mismo rol que en Strava/Polar).
// Fallback: si algún día querySportRecords empieza a devolver JSON estructurado en vez del
// reporte de texto, record no va a tener dateStr -- ahí se usan los nombres de campo viejos
// (adivinados, nunca confirmados) como mejor esfuerzo.
function activityToRun(record, detail) {
  const d = detail || {};
  if (record && record.dateStr) {
    const startDate = new Date(record.dateStr + 'T00:00:00Z');
    return sanitizeActivityNumbers({
      id: 'coros_' + record.labelId,
      corosId: record.labelId,
      date: new Date(record.startTimestamp * 1000).toISOString(),
      name: record.title || null,
      distanceKm: Number(record.distanceKm) || 0,
      durationSec: Math.round(Number(record.durationSec) || 0),
      elevationGain: Math.round(Number(record.elevationGain) || 0),
      elevationLoss: record.elevationLoss != null ? Math.round(Number(record.elevationLoss)) : null,
      avgHr: record.avgHr || null,
      maxHr: null,
      avgCadence: record.avgCadence ? Math.round(Number(record.avgCadence)) : null,
      avgPower: record.avgPower ? Math.round(Number(record.avgPower)) : undefined,
      calories: record.calories || null,
      hrLog: [],
      points: [],
      splits: [],
      splitsV: 3,
      series: null,
      shoeId: null,
      source: 'coros',
      planMonday: getMondayISO(record.dateStr),
      planDayIndex: (startDate.getUTCDay() + 6) % 7
    });
  }
  const startTime = record.startTime || record.start_time || record.date || d.startTime || d.start_time;
  // localDatePart: mismo criterio que localDatePartFromIso() en polar-activity-helpers.js --
  // si startTime es un ISO con offset real (ej. "...T21:30:00-03:00"), leer el día con
  // getUTCDay() sobre el Date crudo lo convierte a UTC primero y pierde la fecha local,
  // reproduciendo el mismo bug de "corrida de noche cargada al día siguiente" ya arreglado
  // para Strava/Polar. Esta rama es best-effort (nombres de campo nunca confirmados, ver el
  // comentario grande arriba) -- no hay forma de saber si el string real vendrá con offset o
  // no, pero tomar los primeros 10 caracteres es correcto en el caso con offset y no
  // empeora el caso sin offset. Se usa para planDayIndex/planMonday, nunca para `date`
  // (que sí necesita el instante real completo).
  const localDatePart = String(startTime || '').slice(0, 10);
  const startDate = new Date(localDatePart + 'T00:00:00Z');
  const distanceM = record.distance ?? record.totalDistance ?? d.distance ?? d.totalDistance ?? 0;
  const durationSec = record.duration ?? record.totalDuration ?? record.movingDuration ?? d.duration ?? d.totalDuration ?? 0;
  const id = getCorosRecordId(record);
  return sanitizeActivityNumbers({
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
    planMonday: getMondayISO(localDatePart),
    planDayIndex: (startDate.getUTCDay() + 6) % 7
  });
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
// autorizados a conservar. Llama a purge_provider_runs (ver
// /sql/purge_provider_runs.sql), que hace el filtrado y el recálculo de
// zapatillas en una sola transacción con la fila bloqueada -- antes esto era
// un GET app_state -> mergear en memoria -> PATCH app_state que le podía
// pisar a un usuario un guardado normal hecho justo en el medio (mismo
// problema que ya se había arreglado para mergeCorosRuns).
async function purgeCorosRunsForUser(base, headers, userId) {
  const res = await fetch(`${base}/rest/v1/rpc/purge_provider_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_user_id: userId, p_source: 'coros' })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`purge_provider_runs rpc failed: ${res.status} ${text}`);
  }
}

// Renueva el access_token con el refresh_token guardado. A diferencia de
// Strava/Wahoo (client_id + client_secret), COROS registró a Zancada como
// cliente público sin secreto (PKCE en vez de secreto) -- ver
// api/coros-init.js -- así que acá no hace falta ni existe un
// COROS_CLIENT_SECRET.
async function refreshCorosToken(base, headers, userId, refreshToken) {
  const tokenRes = await fetchWithTimeout('https://mcpus.coros.com/oauth2/token', {
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

// SONDEO (temporal): describe la ESTRUCTURA -- nombres de campos y tipos, sin ningún valor -- de lo que devuelven las tools
// de detalle de COROS (getActivityDetail / queryActivityLapData), para poder escribir su parser con datos reales en vez de
// adivinar (ver el comentario grande de arriba). Nunca se manda un valor: ni coordenadas, ni pulso, ni fechas.
function describeShape(v, depth) {
  depth = depth || 0;
  if (v === null) return 'null';
  if (Array.isArray(v)) return v.length ? `array(${v.length}) de ${depth < 4 ? JSON.stringify(describeShape(v[0], depth + 1)) : '...'}` : 'array(0)';
  if (typeof v === 'object') {
    if (depth >= 4) return 'object';
    const out = {};
    for (const k of Object.keys(v).slice(0, 40)) out[k] = describeShape(v[k], depth + 1);
    return out;
  }
  if (typeof v === 'string') return v.length > 40 ? `string(${v.length})` : 'string';
  return typeof v;
}
// Si la respuesta es un reporte de texto (como querySportRecords), se manda el texto con los dígitos enmascarados: queda la
// plantilla (etiquetas, unidades) pero no los valores.
function maskText(t) { return String(t).slice(0, 700).replace(/[0-9]/g, '#'); }

async function probeCorosDetailShapes(accessToken, labelId, sportType) {
  const out = {};
  const attempts = [
    ['getActivityDetail', [{ labelId, sportType }, { labelId, sportType: String(sportType) }]],
    ['queryActivityLapData', [{ labelId, sportType }, { labelId, sportType: String(sportType) }]]
  ];
  for (const [tool, argVariants] of attempts) {
    out[tool] = { tried: [] };
    for (const args of argVariants) {
      const argNames = Object.keys(args).join(',');
      try {
        const r = await callCorosMcpTool(accessToken, tool, args);
        out[tool].ok = argNames;
        out[tool].shape = typeof r === 'string' ? { text: maskText(r) } : describeShape(r);
        if (tool === 'queryActivityLapData' && r && typeof r === 'object') {
          // Solo nombres de campos y tipos: columnas (name/label) y la forma de una vuelta de cada grupo.
          out[tool].lapDetail = {
            columns: Array.isArray(r.columns) ? r.columns.slice(0, 40).map(c => ({ name: c && c.name, label: c && c.label })) : null,
            groups: Array.isArray(r.lapGroups) ? r.lapGroups.map(g => ({
              type: g && g.type,
              nLaps: Array.isArray(g && g.laps) ? g.laps.length : 0,
              lapShape: g && Array.isArray(g.laps) && g.laps[0] ? describeShape(g.laps[0], 2) : null
            })) : null
          };
        }
        break;
      } catch (e) {
        // El mensaje de error de COROS suele decir qué argumentos espera: sirve tal cual (sin valores del usuario).
        out[tool].tried.push({ args: argNames, error: String(e && e.message).slice(0, 300).replace(/[0-9]{6,}/g, '#') });
      }
    }
  }
  return out;
}

module.exports = {
  parseCorosActivityDetailText,
  enrichCorosRecord,
  describeShape,
  probeCorosDetailShapes,
  callCorosMcpTool,
  isRunningSportCode,
  corosDateRangeArgs,
  getCorosRunRecords,
  getCorosRecordId,
  activityToRun,
  mergeCorosRuns,
  purgeCorosRunsForUser,
  refreshCorosToken
};
