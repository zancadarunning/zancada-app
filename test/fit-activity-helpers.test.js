// test/fit-activity-helpers.test.js
//
// Pruebas de buildSplitsAndSeriesFromFitRecords (api/_lib/fit-activity-helpers.js) --
// la función pura que le da a Wahoo y Polar el mismo bucketeo por km + serie reducida
// que Strava ya tiene en fetchStreams() (ver strava-activity-helpers.js), pero a partir
// de mensajes "record" de un archivo FIT decodificado en vez de streams de Strava. Es la
// única parte de todo el trabajo de FIT que se puede probar sin necesitar un archivo FIT
// real (decodeFitRecords sí necesita un binario real y el SDK de Garmin -- eso no se
// prueba acá, ver el comentario grande de fit-activity-helpers.js sobre qué está
// confirmado y qué no).

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSplitsAndSeriesFromFitRecords, decodeFitRecords } = require('../api/_lib/fit-activity-helpers');

// Arma una lista de mensajes "record" sintética: `n` muestras, una por segundo, a
// `speedMs` m/s constante, con FC/cadencia/altitud/potencia opcionales que suben de a 1
// unidad por muestra si se piden (para poder verificar que el promedio da lo esperado).
function buildRecords(n, { speedMs = 4, withHr = false, withCadence = false, withAltitude = false, withPower = false } = {}) {
  const t0 = Date.parse('2026-09-01T10:00:00.000Z');
  const records = [];
  let dist = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) dist += speedMs; // 1 muestra por segundo => avanza speedMs metros
    records.push({
      timestamp: new Date(t0 + i * 1000),
      distance: dist,
      heartRate: withHr ? 140 + i : undefined,
      cadence: withCadence ? 80 + i : undefined,
      altitude: withAltitude ? 100 + i * 0.5 : undefined,
      speed: speedMs,
      power: withPower ? 200 + i : undefined,
    });
  }
  return records;
}

test('buildSplitsAndSeriesFromFitRecords: con menos de 2 muestras válidas, devuelve el estado vacío', () => {
  const result = buildSplitsAndSeriesFromFitRecords([{ timestamp: new Date(), distance: 0 }]);
  assert.deepEqual(result, { splits: [], series: null, elevationGain: null, elevationLoss: null, avgCadence: null, avgPower: null, maxPower: null });
});

test('buildSplitsAndSeriesFromFitRecords: ignora registros sin timestamp Date o sin distancia', () => {
  const records = [{ timestamp: null, distance: 5 }, { distance: 10 }];
  const result = buildSplitsAndSeriesFromFitRecords(records);
  assert.equal(result.splits.length, 0);
  assert.equal(result.series, null);
});

test('buildSplitsAndSeriesFromFitRecords: bucketea en splits de 1km + el tramo restante', () => {
  // 2.5km a 5m/s => 500 muestras (una por segundo), corte en km 1, km 2 y un resto de 0.5km.
  const records = buildRecords(500, { speedMs: 5 });
  const { splits } = buildSplitsAndSeriesFromFitRecords(records);
  assert.equal(splits.length, 3);
  assert.equal(splits[0].km, 1);
  assert.equal(splits[1].km, 2);
  assert.equal(splits[2].km, 0.5);
  // a 5 m/s, 1km tarda 200s = 3.33min/km
  assert.equal(splits[0].paceMin, 3.33);
});

test('buildSplitsAndSeriesFromFitRecords: promedia FC y cadencia por split, sin duplicar la cadencia (a diferencia de Strava)', () => {
  // 200 muestras a 5m/s => exactamente 1km (200s), heartRate/cadence suben de 140/80 a
  // 339/279 -- el promedio de una progresión lineal 0..199 es 99.5.
  const records = buildRecords(200, { speedMs: 5, withHr: true, withCadence: true });
  const { splits } = buildSplitsAndSeriesFromFitRecords(records);
  assert.equal(splits.length, 1);
  assert.equal(splits[0].avgHr, Math.round(140 + 99.5));
  assert.equal(splits[0].avgCadence, Math.round(80 + 99.5));
});

test('buildSplitsAndSeriesFromFitRecords: calcula elevationGain/elevationLoss reales cuando hay altitud', () => {
  // altitud sube 0.5m por muestra en buildRecords -- sobre un tramo entero, todo es ascenso.
  const records = buildRecords(200, { speedMs: 5, withAltitude: true });
  const { elevationGain, elevationLoss } = buildSplitsAndSeriesFromFitRecords(records);
  assert.ok(elevationGain > 0);
  assert.equal(elevationLoss, 0);
});

test('buildSplitsAndSeriesFromFitRecords: sin stream de altitud, elevationGain/elevationLoss quedan null (no en 0)', () => {
  const records = buildRecords(200, { speedMs: 5 });
  const { elevationGain, elevationLoss } = buildSplitsAndSeriesFromFitRecords(records);
  assert.equal(elevationGain, null);
  assert.equal(elevationLoss, null);
});

test('buildSplitsAndSeriesFromFitRecords: sin sensor de potencia, avgPower/maxPower quedan null (no en 0)', () => {
  const records = buildRecords(200, { speedMs: 5 });
  const { avgPower, maxPower } = buildSplitsAndSeriesFromFitRecords(records);
  assert.equal(avgPower, null);
  assert.equal(maxPower, null);
});

test('buildSplitsAndSeriesFromFitRecords: con sensor de potencia, calcula avgPower/maxPower reales', () => {
  const records = buildRecords(200, { speedMs: 5, withPower: true }); // power: 200..399
  const { avgPower, maxPower } = buildSplitsAndSeriesFromFitRecords(records);
  assert.equal(maxPower, 399);
  assert.ok(avgPower > 200 && avgPower < 399);
});

test('buildSplitsAndSeriesFromFitRecords: la serie reducida no supera ~120 puntos y el primer punto es el del medio del primer bucket', () => {
  const n = 5000;
  const records = buildRecords(n, { speedMs: 3, withHr: true });
  const { series } = buildSplitsAndSeriesFromFitRecords(records);
  assert.ok(series.t.length <= 121, `demasiados puntos en la serie: ${series.t.length}`);
  // Mismo bucketeo que fetchStreams() en strava-activity-helpers.js: cada punto de la
  // serie es el del medio de su bucket, no el del arranque -- con 5000 muestras (1 por
  // segundo) y como máximo 120 puntos, el bucket mide ceil(5000/120)=42 muestras, y el
  // primer punto cae en floor((42-1)/2)=20 segundos.
  const bucketSize = Math.ceil(n / 120);
  assert.equal(series.t[0], Math.floor((bucketSize - 1) / 2));
  assert.equal(series.hr.length, series.t.length);
});

test('buildSplitsAndSeriesFromFitRecords: una carrera corta (menos de 1km) no genera splits de km pero sí puede generar el tramo suelto', () => {
  // 600m a 5m/s => distancia final 600m > 50m de umbral, sin ningún km completo.
  const records = buildRecords(120, { speedMs: 5 });
  const { splits } = buildSplitsAndSeriesFromFitRecords(records);
  assert.equal(splits.length, 1);
  assert.equal(splits[0].km, 0.6);
});

test('buildSplitsAndSeriesFromFitRecords: un tramo restante de 995-999m no se etiqueta como "1" (colisiona con un split entero real)', () => {
  // 1996m a 4m/s => 1km completo (km=1) + un resto de 996m, que redondeado a 2 decimales
  // (996/1000=0.996) da exactamente 1.00 sin el tope -- renderRDSegmentos en app.js usa
  // Number.isInteger(s.km) para distinguir un split entero de un resto, así que un resto
  // etiquetado "1" se mostraba como un segundo km completo duplicado.
  const records = buildRecords(500, { speedMs: 4 }); // dist final = 499*4 = 1996m
  const { splits } = buildSplitsAndSeriesFromFitRecords(records);
  assert.equal(splits.length, 2);
  assert.equal(splits[0].km, 1);
  assert.ok(splits[1].km < 1, `el resto no debería etiquetarse como un km entero: ${splits[1].km}`);
  assert.ok(!Number.isInteger(splits[1].km));
});

test('buildSplitsAndSeriesFromFitRecords: con sensor de cadencia, calcula avgCadence de toda la actividad (no solo por split)', () => {
  // 200 muestras a 5m/s => 1km exacto, cadence sube de 80 a 279 -- promedio de 0..199 es 99.5.
  const records = buildRecords(200, { speedMs: 5, withCadence: true });
  const { avgCadence } = buildSplitsAndSeriesFromFitRecords(records);
  assert.equal(avgCadence, Math.round(80 + 99.5));
});

test('buildSplitsAndSeriesFromFitRecords: sin sensor de cadencia, avgCadence queda null', () => {
  const records = buildRecords(200, { speedMs: 5 });
  const { avgCadence } = buildSplitsAndSeriesFromFitRecords(records);
  assert.equal(avgCadence, null);
});

test('buildSplitsAndSeriesFromFitRecords: calcula maxPower sin RangeError en una actividad muy larga (decenas de miles de muestras)', () => {
  // Math.max(...array) rompe por encima del límite de argumentos de un spread call
  // (~125000-131000 en este motor) -- 200000 muestras (~55hs a 1 muestra/seg, un caso
  // real para un reloj olvidado grabando) confirma que el cálculo por reduce no tiene
  // ese techo.
  const n = 200000;
  const records = buildRecords(n, { speedMs: 3, withPower: true }); // power: 200..200199
  const { maxPower, avgPower } = buildSplitsAndSeriesFromFitRecords(records);
  assert.equal(maxPower, 200 + n - 1);
  assert.ok(avgPower > 200 && avgPower < maxPower);
});

// Prueba de punta a punta contra el propio @garmin/fitsdk (no solo el bucketeo puro de
// arriba): arma un archivo FIT real de juguete con el Encoder del SDK, lo decodifica con
// decodeFitRecords() -- la misma función que usan fetchFitSplits() de
// polar-activity-helpers.js/wahoo-activity-helpers.js contra un archivo real bajado de
// la API -- y confirma que los campos salen con los nombres que se esperan
// (heartRate/distance/altitude/cadence/speed/power, todos del mensaje "record" del
// perfil FIT global). No reemplaza probarlo contra un archivo FIT real de una cuenta
// conectada (ver el comentario grande de fit-activity-helpers.js) pero sí confirma que
// la integración con el SDK decodifica lo que dice decodificar.
test('decodeFitRecords: decodifica un archivo FIT real (armado con el propio Encoder del SDK) y lo deja listo para bucketear', async () => {
  const { Encoder } = await import('@garmin/fitsdk');
  const enc = new Encoder();
  enc.writeMesg({ mesgNum: 0, type: 'activity', manufacturer: 1, timeCreated: new Date('2026-09-01T10:00:00Z') }); // file_id
  const t0 = Date.parse('2026-09-01T10:00:00Z');
  for (let i = 0; i < 250; i++) {
    enc.writeMesg({
      mesgNum: 20, // record
      timestamp: new Date(t0 + i * 1000),
      distance: i * 5, // 5 m/s
      heartRate: 150,
      cadence: 85,
      altitude: 100,
      speed: 5,
      power: 220,
    });
  }
  const bytes = enc.close();
  const records = await decodeFitRecords(Buffer.from(bytes));
  assert.equal(records.length, 250);
  assert.ok(records[0].timestamp instanceof Date);
  assert.equal(records[0].distance, 0);
  assert.equal(records[249].distance, 249 * 5);
  assert.equal(records[0].heartRate, 150);
  assert.equal(records[0].power, 220);

  const { splits, avgPower } = buildSplitsAndSeriesFromFitRecords(records);
  assert.equal(splits.length, 2); // 1245m => 1km completo + 0.245km de resto
  assert.equal(avgPower, 220);
});
