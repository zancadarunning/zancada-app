// api/_lib/strava-activity-helpers.js
//
// Antes esta misma lógica (decodePolyline, fetchSplits, activityToRun,
// getMondayISO) estaba copiada tal cual en 5 archivos distintos:
// strava-auth.js, strava-webhook.js, strava-resync.js, strava-sync-now.js y
// sync-strava.js. Estar duplicada en 5 lugares significa que un fix o un
// cambio de comportamiento (por ejemplo, agregar un campo nuevo a los runs
// que vienen de Strava) hay que acordarse de replicarlo 5 veces — y es
// cuestión de tiempo hasta que alguna copia quede desactualizada. Ahora
// viven acá una sola vez y los 5 archivos importan de este módulo.
//
// También agrega mergeStravaRuns(), que reemplaza el viejo patrón de
// "GET app_state -> mergear en memoria -> PATCH app_state" que tenían los
// 5 archivos. Ese patrón tiene una condición de carrera real: si dos
// sincronizaciones corren casi al mismo tiempo (el cron de cada 15 minutos
// y una sincronización manual, por ejemplo, o el cron y el guardado normal
// del cliente), la segunda puede pisar lo que acaba de guardar la primera
// sin darse cuenta, porque cada una lee el estado ANTES de que la otra
// termine de escribir. mergeStravaRuns() en cambio llama a una función SQL
// (merge_strava_runs, ver /sql/merge_strava_runs.sql) que hace todo el
// mergeo dentro de una sola transacción con el registro bloqueado
// (FOR UPDATE), así que no hay ventana para que se pisen, y además siempre
// actualiza `updated_at` — antes el PATCH mandaba solo `{ data }` y dejaba
// `updated_at` desactualizado, por lo que el aviso de "conflicto entre
// dispositivos" del cliente (ver checkForRemoteConflict en index.html)
// nunca se enteraba de que una sincronización de Strava había tocado los
// datos.

function decodePolyline(encoded) {
  if (!encoded) return [];
  let points = [], index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    points.push({ lat: lat / 1e5, lon: lng / 1e5 });
  }
  return points;
}

// Antes esto solo traía "splits" (promedios por km). Para las pestañas de
// detalle de carrera (Ruta/Ritmo/Segmentos/Gráficos) hace falta además la
// curva completa de FC y ritmo a lo largo del tiempo, así que ahora también
// devolvemos `series`: una versión reducida (como máximo ~120 puntos, no
// tiene sentido guardar miles de muestras de Strava para un gráfico que en
// pantalla no tiene más de unos cientos de píxeles de ancho) de FC y ritmo
// en el tiempo, más el ascenso/descenso total de toda la actividad (Strava
// solo da el ascenso en el resumen de la actividad, no el descenso).
async function fetchStreams(activityId, accessToken) {
  try {
    const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}/streams?keys=time,distance,altitude,heartrate,cadence,velocity_smooth&key_by_type=true`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const streams = await res.json();
    if (!streams || !streams.distance || !streams.time) return { splits: [], series: null, elevationGain: null, elevationLoss: null };
    const distArr = streams.distance.data, timeArr = streams.time.data;
    const altArr = streams.altitude ? streams.altitude.data : null;
    const hrArr = streams.heartrate ? streams.heartrate.data : null;
    const cadArr = streams.cadence ? streams.cadence.data : null;
    const velArr = streams.velocity_smooth ? streams.velocity_smooth.data : null;
    const totalDistM = distArr[distArr.length - 1];
    const numFullKm = Math.floor(totalDistM / 1000);

    function buildSegment(fromIdx, toIdx, fromTime, label) {
      const segDistKm = (distArr[toIdx] - distArr[fromIdx]) / 1000;
      const segTime = timeArr[toIdx] - fromTime;
      const paceMin = segDistKm > 0 ? (segTime / 60) / segDistKm : 0;
      let elevGain = 0;
      if (altArr) {
        for (let j = fromIdx + 1; j <= toIdx; j++) { const d = altArr[j] - altArr[j - 1]; if (d > 0) elevGain += d; }
      }
      let avgHr = null;
      if (hrArr) {
        const slice = hrArr.slice(fromIdx, toIdx + 1);
        if (slice.length) avgHr = Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
      }
      let avgCadence = null;
      if (cadArr) {
        // Strava reporta la cadencia de UNA pierna (rpm) para correr -- *2 para
        // mostrar pasos totales por minuto, igual que el resto de la app.
        const slice = cadArr.slice(fromIdx, toIdx + 1).filter(c => c != null);
        if (slice.length) avgCadence = Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 2);
      }
      return { km: label, paceMin: Math.round(paceMin * 100) / 100, elevGain: Math.round(elevGain), avgHr, avgCadence };
    }

    const splits = [];
    if (numFullKm >= 1 || totalDistM >= 50) {
      let startIdx = 0, startTime = 0;
      for (let km = 1; km <= numFullKm; km++) {
        const targetDist = km * 1000;
        let idx = startIdx;
        while (idx < distArr.length && distArr[idx] < targetDist) idx++;
        if (idx >= distArr.length) idx = distArr.length - 1;
        splits.push(buildSegment(startIdx, idx, startTime, km));
        startIdx = idx; startTime = timeArr[idx];
      }
      // último tramo suelto, si quedó algo más que unos metros sin contar
      const lastIdx = distArr.length - 1;
      const remainderM = distArr[lastIdx] - distArr[startIdx];
      if (remainderM > 50) {
        const remainderKmLabel = Math.round((remainderM / 1000) * 100) / 100;
        splits.push(buildSegment(startIdx, lastIdx, startTime, remainderKmLabel));
      }
    }

    let elevationGain = null, elevationLoss = null;
    if (altArr && altArr.length > 1) {
      elevationGain = 0; elevationLoss = 0;
      for (let j = 1; j < altArr.length; j++) {
        const d = altArr[j] - altArr[j - 1];
        if (d > 0) elevationGain += d; else elevationLoss += -d;
      }
      elevationGain = Math.round(elevationGain); elevationLoss = Math.round(elevationLoss);
    }

    const n = timeArr.length;
    const maxPoints = 120;
    const bucketSize = Math.max(1, Math.ceil(n / maxPoints));
    const series = { t: [], hr: hrArr ? [] : null, paceMin: velArr ? [] : null };
    for (let i = 0; i < n; i += bucketSize) {
      const end = Math.min(i + bucketSize, n);
      series.t.push(timeArr[Math.floor((i + end - 1) / 2)]);
      if (hrArr) {
        const slice = hrArr.slice(i, end);
        series.hr.push(Math.round(slice.reduce((a, b) => a + b, 0) / slice.length));
      }
      if (velArr) {
        // descartamos paradas (semáforos, cruces) para que no rompan la escala del gráfico
        const slice = velArr.slice(i, end).filter(v => v > 0.3);
        if (slice.length) {
          const avgVel = slice.reduce((a, b) => a + b, 0) / slice.length; // m/s
          series.paceMin.push(Math.round((1000 / avgVel / 60) * 100) / 100);
        } else {
          series.paceMin.push(null);
        }
      }
    }

    return { splits, series, elevationGain, elevationLoss };
  } catch (e) { return { splits: [], series: null, elevationGain: null, elevationLoss: null }; }
}

function getMondayISO(d) {
  const dt = new Date(d);
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

// accessToken en null/undefined = no busca parciales (más rápido, se
// completan solos en la sincronización periódica). Además de los campos
// del run, agrega dos campos "de paso" (planMonday, planDayIndex) que
// merge_strava_runs.sql usa para saber si esta carrera corresponde a un día
// del plan de esa semana, y que la función SQL descarta antes de guardar el
// run definitivo — no quedan guardados en el run final.
async function activityToRun(act, accessToken) {
  const streams = accessToken ? await fetchStreams(act.id, accessToken) : { splits: [], series: null, elevationGain: null, elevationLoss: null };
  const startDate = new Date(act.start_date);
  return {
    id: 'strava_' + act.id,
    stravaId: act.id,
    date: act.start_date,
    name: act.name || null,
    distanceKm: act.distance / 1000,
    durationSec: act.moving_time,
    // Preferimos el ascenso calculado de la propia curva de altitud (coherente
    // con elevationLoss, que Strava no da en el resumen de la actividad) y
    // caemos al total_elevation_gain del resumen si por lo que sea no hubo
    // stream de altitud disponible.
    elevationGain: streams.elevationGain != null ? streams.elevationGain : (act.total_elevation_gain || 0),
    elevationLoss: streams.elevationLoss,
    avgHr: act.average_heartrate ? Math.round(act.average_heartrate) : null,
    maxHr: act.max_heartrate ? Math.round(act.max_heartrate) : null,
    avgCadence: act.average_cadence ? Math.round(act.average_cadence * 2) : null,
    calories: act.calories ? Math.round(act.calories) : null,
    hrLog: act.average_heartrate ? [{ t: 0, bpm: Math.round(act.average_heartrate) }] : [],
    points: act.map ? decodePolyline(act.map.summary_polyline) : [],
    splits: streams.splits,
    splitsV: 3,
    series: streams.series,
    shoeId: null,
    source: 'strava',
    // campos de paso, ver comentario de arriba:
    planMonday: getMondayISO(act.start_date),
    planDayIndex: (startDate.getUTCDay() + 6) % 7
  };
}

// Llama a la función SQL merge_strava_runs (ver /sql/merge_strava_runs.sql)
// para agregar `newRuns` a app_state.data.runs de forma atómica. base y
// headers son los mismos que ya se usan para hablarle a la REST API de
// Supabase en el resto del archivo (headers debe incluir apikey y
// Authorization con la service key). No hace nada si newRuns está vacío.
// mode: 'skip' (default, no pisa carreras ya guardadas) o 'upsert' (las
// reemplaza con los datos nuevos de Strava — lo usa strava-webhook.js
// porque Strava manda el mismo evento para actividades nuevas y editadas).
async function mergeStravaRuns(base, headers, userId, newRuns, mode) {
  if (!newRuns || !newRuns.length) return { merged: false };
  const res = await fetch(`${base}/rest/v1/rpc/merge_strava_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_user_id: userId, p_new_runs: newRuns, p_mode: mode || 'skip' })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`merge_strava_runs rpc failed: ${res.status} ${text}`);
  }
  return { merged: true };
}

// Borra de app_state.data.runs las carreras importadas de Strava
// (source==='strava') para un usuario, y recalcula el km de cada zapatilla
// sumando solo las carreras que quedan (así no arrastran kilometraje de
// carreras ya borradas). La usan strava-disconnect.js (cuando el usuario
// desconecta desde la app) y strava-webhook.js (cuando Strava avisa que el
// usuario revocó el acceso desde su propia cuenta) -- en los dos casos hay
// que dejar de tener datos de Strava que ya no estamos autorizados a
// conservar. También limpia app_state.data.stravaSync (ver
// set_strava_sync_status más abajo) -- si no, alguien que desconecta y
// vuelve a conectar más adelante vería en el Historial el aviso de "la
// sincronización con Strava falló/está desactualizada" de la conexión
// VIEJA, que ya no tiene nada que ver con la nueva. No hace nada si no hay
// ni carreras de Strava ni un estado de sincronización guardado.
// buildNotifyMessage(count, lang) -- opcional. Cuando el usuario desconecta desde ADENTRO
// de Zancada (strava-disconnect.js), ya vio y eligió en el momento (ver
// confirmKeepDataBeforeDisconnect en app.js), así que no hace falta avisarle nada más. Pero
// cuando revoca el acceso desde la propia web/app de Strava, nos enteramos recién acá, por
// el webhook (deauthorizeAthlete en strava-webhook.js) -- sin ninguna pantalla de Zancada
// abierta para preguntarle nada. Como ese borrado es un requisito real del acuerdo de
// desarrollador de Strava (no se puede evitar), lo mínimo es que no sea una sorpresa: se le
// deja un mensaje del coach contándole qué pasó, para la próxima vez que abra la app.
async function purgeStravaRunsForUser(base, headers, userId, buildNotifyMessage) {
  const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers });
  const stateRows = await stateRes.json();
  const data = stateRows && stateRows[0] && stateRows[0].data;
  const hasStravaRuns = data && Array.isArray(data.runs) && data.runs.some(r => r.source === 'strava');
  const hasSyncStatus = data && data.stravaSync;
  if (!data || (!hasStravaRuns && !hasSyncStatus)) return;

  if (hasStravaRuns) {
    const removedCount = data.runs.filter(r => r.source === 'strava').length;
    data.runs = data.runs.filter(r => r.source !== 'strava');
    if (Array.isArray(data.shoes)) {
      data.shoes = data.shoes.map(shoe => ({
        ...shoe,
        km: data.runs.filter(r => String(r.shoeId) === String(shoe.id)).reduce((a, r) => a + (r.distanceKm || 0), 0)
      }));
    }
    if (buildNotifyMessage) {
      if (!Array.isArray(data.chat)) data.chat = [];
      data.chat.push({ role: 'coach', text: buildNotifyMessage(removedCount, data.lang), ts: Date.now() });
    }
  }
  if (hasSyncStatus) delete data.stravaSync;
  const patchRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ data, updated_at: new Date().toISOString() })
  });
  if (!patchRes.ok) throw new Error(`purgeStravaRunsForUser: PATCH failed: ${patchRes.status} ${await patchRes.text().catch(() => '')}`);
}

// Llama a la función SQL set_strava_sync_status (ver
// /sql/set_strava_sync_status.sql) para dejar registrado en
// app_state.data.stravaSync el resultado de este intento de sincronización --
// tanto el cron de cada 15' (sync-strava.js) como el botón "Sincronizar
// ahora" (strava-sync-now.js) lo llaman, en cada intento, sea que haya
// encontrado carreras nuevas o no (encontrar cero carreras nuevas es un
// intento EXITOSO igual, solo que sin nada para traer). Sin esto, un error
// (token de Strava revocado, la API de Strava caída, lo que sea) quedaba
// atrapado en un catch y nunca se enteraba nadie -- ni el usuario ni la app.
// No relanza si esta llamada en sí falla (mejor perder un registro de estado
// que romper la sincronización real por un problema en el reporte).
async function setStravaSyncStatus(base, headers, userId, status) {
  try {
    await fetch(`${base}/rest/v1/rpc/set_strava_sync_status`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_user_id: userId, p_status: status })
    });
  } catch (e) { /* no-op a propósito, ver comentario de arriba */ }
}

module.exports = { decodePolyline, fetchStreams, getMondayISO, activityToRun, mergeStravaRuns, purgeStravaRunsForUser, setStravaSyncStatus };
