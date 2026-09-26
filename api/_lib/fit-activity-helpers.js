// api/_lib/fit-activity-helpers.js
//
// Lógica compartida por Polar y Wahoo para bajar y decodificar el archivo FIT de una
// actividad puntual y sacarle splits/series/potencia -- mismo objetivo que fetchStreams()
// en strava-activity-helpers.js (funcionalidad equivalente, no el mismo código: Strava
// expone streams ya separados en JSON vía su propia API REST; Polar (API "sin
// transacción", GET /v3/exercises/{id}/fit -- ver ExercisesApi en la doc oficial de
// AccessLink) y Wahoo (workout_summary.file.url -- ver la doc del Cloud API) en cambio
// solo dan, para el detalle punto a punto de una actividad, un archivo FIT binario.
//
// FIT (Flexible and Interoperable Data Transfer) es el formato binario que usan
// prácticamente todos los relojes/ciclocomputadoras deportivas -- especificación pública
// de Garmin en https://developer.garmin.com/fit/overview/. Para decodificarlo se usa
// @garmin/fitsdk, el SDK oficial publicado por Garmin en npm (ver package.json --
// "dependencies"): cero dependencias propias, mantenido activamente (versión con fecha
// de esta misma semana al momento de agregarlo). Es la alternativa elegida en vez de
// escribir un parser de FIT a mano (formato binario con mensajes definidos
// dinámicamente -- reimplementarlo mal es fácil y el costo de un bug ahí es silencioso:
// splits mal calculados en vez de un error visible) o de paquetes de terceros sin
// mantenimiento claro.
//
// OJO -- es un paquete ESM puro ("type": "module" en su package.json), por eso PARA
// CARGARLO se usa `await import(...)` en vez de `require(...)` como el resto de este
// archivo (y de todo api/_lib) -- import() dinámico funciona sin problema desde un
// módulo CommonJS común y corriente, no hace falta convertir nada más del proyecto a
// ESM.
//
// A diferencia de fetchStreams() de Strava (confirmado contra actividades reales, ver
// ese comentario), esto todavía NO se probó contra un archivo FIT real bajado de una
// cuenta de Polar o Wahoo conectada de verdad -- no hay ninguna cuenta así disponible
// para probar en este entorno. Lo que SÍ está verificado es que los nombres de campo que
// se leen más abajo (heartRate/distance/altitude/enhancedAltitude/cadence/speed/
// enhancedSpeed/power, todos del mensaje "record" del perfil FIT global) son los que el
// propio SDK trae definidos en su profile.js (generado por Garmin a partir de su
// Profile.xlsx público) -- y se hizo un round-trip real de prueba (encodear un FIT de
// juguete con el propio Encoder del SDK y decodificarlo de vuelta) para confirmar que la
// lectura funciona como se espera. Si el primer archivo FIT real de una cuenta conectada
// da algo inesperado, va a fallar acá adentro sin romper nada (fetchFitSplits atrapa
// cualquier error) -- revisar los logs de Vercel ("fit: no se pudo leer...") como primer
// paso, mismo criterio que ya se usó para depurar el formato real de COROS.

let fitSdkPromise = null;
function loadFitSdk() {
  if (!fitSdkPromise) fitSdkPromise = import('@garmin/fitsdk');
  return fitSdkPromise;
}

// Estado "sin datos" -- se devuelve una copia nueva en cada llamada (en vez de una
// constante compartida) para que a nadie se le ocurra mutar el objeto que le devolvimos.
function emptyFitResult() {
  return { splits: [], series: null, elevationGain: null, elevationLoss: null, avgCadence: null, avgPower: null, maxPower: null };
}

// buffer: un Buffer con el contenido crudo del archivo .fit. Devuelve el array de
// mensajes "record" (una muestra por punto grabado) tal cual los decodifica el SDK
// (con applyScaleAndOffset/convertDateTimesToDates, que vienen prendidos por default),
// o [] si el archivo no tiene ninguno.
async function decodeFitRecords(buffer) {
  const { Decoder, Stream } = await loadFitSdk();
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const stream = Stream.fromBuffer(buf);
  const decoder = new Decoder(stream);
  // decoder.read() nunca tira -- si el archivo viene truncado (descarga cortada a mitad,
  // un glitch del lado del proveedor) atrapa el RangeError de la lectura de buffer que sea
  // y devuelve, en `errors`, lo que salió mal, junto con los mensajes que sí llegó a
  // decodificar ANTES del corte en `messages`. Antes se descartaba `errors` sin mirarlo --
  // el resultado parcial (ej. una carrera de 10km cortada a los 6km) se devolvía como si
  // fuera la actividad completa, sin ningún rastro en los logs de Vercel a pesar de que el
  // comentario grande de arriba de este archivo asume justo eso como primer paso para
  // depurar un FIT real inesperado.
  const { messages, errors } = decoder.read();
  if (errors && errors.length) {
    console.error('fit: decoder.read() devolvió errores (datos parciales, ver mensaje):', errors.map(e => e && e.message));
  }
  return (messages && messages.recordMesgs) || [];
}

// Algunos dispositivos solo llenan la variante "enhanced" (más rango/precisión) de
// altitude/speed en vez de la básica -- confirmado con el round-trip de prueba mencionado
// arriba, el propio SDK completa ambas automáticamente a partir de los componentes del
// mensaje. Preferimos la enhanced cuando está.
function altitudeOf(r) { return r.enhancedAltitude != null ? r.enhancedAltitude : r.altitude; }
function speedOf(r) { return r.enhancedSpeed != null ? r.enhancedSpeed : r.speed; }

// Misma idea que el bucketeo de fetchStreams() en strava-activity-helpers.js (buildSegment
// + reducción a `series` de como máximo ~120 puntos), pero a partir de mensajes "record"
// de FIT en vez de streams de Strava. records: array tal cual lo devuelve
// decodeFitRecords -- timestamp (Date), distance (metros acumulados), heartRate (bpm),
// cadence (rpm), altitude/enhancedAltitude (metros), speed/enhancedSpeed (m/s), power
// (watts) -- todos opcionales: un reloj sin sensor de potencia simplemente no va a traer
// `power` en ninguna muestra, y ahí avgPower/maxPower quedan en null (no en 0, para no
// confundir "no tiene sensor" con "midió cero watts").
function buildSplitsAndSeriesFromFitRecords(records) {
  const valid = (records || []).filter(r => r && r.timestamp instanceof Date && r.distance != null);
  if (valid.length < 2) return emptyFitResult();

  const t0 = valid[0].timestamp.getTime();
  const timeArr = valid.map(r => (r.timestamp.getTime() - t0) / 1000);
  const distArr = valid.map(r => r.distance);
  const hrArr = valid.some(r => r.heartRate != null) ? valid.map(r => (r.heartRate != null ? r.heartRate : null)) : null;
  const cadArr = valid.some(r => r.cadence != null) ? valid.map(r => (r.cadence != null ? r.cadence : null)) : null;
  const altArr = valid.some(r => altitudeOf(r) != null) ? valid.map(altitudeOf) : null;
  const velArr = valid.some(r => speedOf(r) != null) ? valid.map(r => { const v = speedOf(r); return v != null ? v : 0; }) : null;
  const powerArr = valid.some(r => r.power != null) ? valid.map(r => (r.power != null ? r.power : null)) : null;

  const totalDistM = distArr[distArr.length - 1];
  const numFullKm = Math.floor(totalDistM / 1000);

  function buildSegment(fromIdx, toIdx, fromTime, label) {
    const segDistKm = (distArr[toIdx] - distArr[fromIdx]) / 1000;
    const segTime = timeArr[toIdx] - fromTime;
    const paceMin = segDistKm > 0 ? (segTime / 60) / segDistKm : 0;
    let elevGain = 0;
    if (altArr) {
      for (let j = fromIdx + 1; j <= toIdx; j++) {
        if (altArr[j] == null || altArr[j - 1] == null) continue;
        const d = altArr[j] - altArr[j - 1];
        if (d > 0) elevGain += d;
      }
    }
    let avgHr = null;
    if (hrArr) {
      const slice = hrArr.slice(fromIdx, toIdx + 1).filter(v => v != null);
      if (slice.length) avgHr = Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    let avgCadence = null;
    if (cadArr) {
      // A diferencia de Strava (que reporta la cadencia de UNA pierna y hay que
      // duplicarla, ver el comentario en fetchStreams de strava-activity-helpers.js),
      // acá NO se aplica ningún *2: no hay ninguna confirmación de que el campo
      // "cadence" del perfil FIT global venga partido por pierna en los relojes que usan
      // Wahoo/Polar, y el resto de este código ya toma avgCadence de Wahoo tal cual
      // viene del resumen (summary.cadence_avg en workoutToRun) sin multiplicar --
      // mantenemos el mismo criterio en vez de inventar una conversión sin verificar.
      const slice = cadArr.slice(fromIdx, toIdx + 1).filter(v => v != null);
      if (slice.length) avgCadence = Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    return { km: label, paceMin: Math.round(paceMin * 100) / 100, elevGain: Math.round(elevGain), avgHr, avgCadence };
  }

  const splits = [];
  if (numFullKm >= 1 || totalDistM >= 50) {
    let startIdx = 0, startTime = 0;
    for (let km = 1; km <= numFullKm; km++) {
      const targetDist = km * 1000;
      // Si el punto donde ya estamos parados (startIdx, el final del split anterior) quedó
      // MÁS ALLÁ de este km entero, es porque un solo salto de distancia (reconexión de GPS
      // después de un túnel/arboleda, o un stream de pocos Hz) se comió este km sin ningún
      // punto real adentro -- antes esto generaba un split fantasma (fromIdx===toIdx,
      // segDistKm=0, paceMin=0) para CADA km saltado, mostrando varias filas de "0:00/km"
      // imposibles en la tabla. No hay ningún dato real de "acá pasó este km" para mostrar,
      // así que no se genera fila para él -- el próximo km que sí tenga un punto real que lo
      // cruce va a mostrar, honestamente, el tramo completo (incluyendo lo saltado) en una
      // sola fila con su ritmo promedio real, en vez de inventar varias filas imposibles.
      if (distArr[startIdx] >= targetDist) continue;
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
      // remainderM siempre es < 1000 acá (startIdx ya cruzó el último km entero), pero
      // redondeado a 2 decimales un remainder de 995-999m da exactamente "1.00" -- un
      // número entero igual que la etiqueta del split anterior. app.js (renderRDSegmentos)
      // usa Number.isInteger(s.km) para saber si una fila es un km entero de verdad, así
      // que ese "1.00" quedaba mal clasificado como si fuera 1km completo (con la duración
      // calculada contra 1.000km en vez de los ~0.996km reales) Y duplicaba la etiqueta
      // del split anterior en la tabla. Con el tope en 0.99 el remainder nunca puede caer
      // sobre un número entero.
      const remainderKmLabel = Math.min(Math.round((remainderM / 1000) * 100) / 100, 0.99);
      splits.push(buildSegment(startIdx, lastIdx, startTime, remainderKmLabel));
    }
  }

  let elevationGain = null, elevationLoss = null;
  if (altArr) {
    const cleanAlt = altArr.filter(v => v != null);
    if (cleanAlt.length > 1) {
      elevationGain = 0; elevationLoss = 0;
      for (let j = 1; j < altArr.length; j++) {
        if (altArr[j] == null || altArr[j - 1] == null) continue;
        const d = altArr[j] - altArr[j - 1];
        if (d > 0) elevationGain += d; else elevationLoss += -d;
      }
      elevationGain = Math.round(elevationGain); elevationLoss = Math.round(elevationLoss);
    }
  }

  const n = timeArr.length;
  const maxPoints = 120;
  const bucketSize = Math.max(1, Math.ceil(n / maxPoints));
  const series = { t: [], hr: hrArr ? [] : null, paceMin: velArr ? [] : null };
  for (let i = 0; i < n; i += bucketSize) {
    const end = Math.min(i + bucketSize, n);
    series.t.push(timeArr[Math.floor((i + end - 1) / 2)]);
    if (hrArr) {
      const slice = hrArr.slice(i, end).filter(v => v != null);
      series.hr.push(slice.length ? Math.round(slice.reduce((a, b) => a + b, 0) / slice.length) : null);
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

  // avgCadence: mismo criterio que avgHr/avgPower más abajo -- un solo valor para toda la
  // actividad, a partir de las muestras crudas (no de `series`, que ya viene reducida a
  // ~120 puntos). Antes esto no se calculaba acá, así que polar-activity-helpers.js dejaba
  // avgCadence en null siempre, aunque el propio FIT sí trae la cadencia muestra a muestra
  // (se ve bien en cada fila de `splits`, solo faltaba el total).
  let avgCadence = null;
  if (cadArr) {
    const cleanCad = cadArr.filter(v => v != null);
    if (cleanCad.length) avgCadence = Math.round(cleanCad.reduce((a, b) => a + b, 0) / cleanCad.length);
  }

  let avgPower = null, maxPower = null;
  if (powerArr) {
    const clean = powerArr.filter(v => v != null);
    if (clean.length) {
      avgPower = Math.round(clean.reduce((a, b) => a + b, 0) / clean.length);
      // Math.max(...clean) rompía (RangeError: Maximum call stack size exceeded) en
      // actividades muy largas grabadas a 1Hz -- clean no está reducido como `series`
      // (que sí se limita a ~120 puntos más abajo), así que puede tener decenas de miles
      // de muestras para una actividad de muchas horas, por encima del límite de
      // argumentos de un spread call. reduce no tiene ese límite.
      maxPower = Math.round(clean.reduce((a, b) => Math.max(a, b), -Infinity));
    }
  }

  return { splits, series, elevationGain, elevationLoss, avgCadence, avgPower, maxPower };
}

module.exports = { decodeFitRecords, buildSplitsAndSeriesFromFitRecords, emptyFitResult };
