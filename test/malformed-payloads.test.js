// Avisos mal formados o raros (de Garmin, Suunto, Wahoo...): un solo dato roto no puede tirar el procesamiento ni, peor, hacer que el proveedor reintente para siempre.
// Estos tests tiran valores absurdos a las funciones que convierten lo que llega de afuera en una carrera.
const test = require('node:test');
const assert = require('node:assert/strict');

const garmin = require('../api/_lib/garmin-activity-helpers');

// valores que sí pueden llegar en un JSON (un objeto con métodos que tiran no existe en JSON, así que no se prueba)
const WEIRD = [null, 0, -1, 1e30, -1e30, 1e308, '', 'abc', '9'.repeat(40), '2026-13-45', {}, [], [[]], true, false, { a: 1 }, [1, 2]];

test('garmin activityToRun: ningún campo raro tira un error', () => {
  const base = { activityId: 12345, summaryId: 's1', userId: 'u1', activityType: 'RUNNING', startTimeInSeconds: 1790000000, startTimeOffsetInSeconds: -10800, durationInSeconds: 1800, distanceInMeters: 5000, averageHeartRateInBeatsPerMinute: 150, activityName: 'Rodaje', deviceName: 'Forerunner 255' };
  const failures = [];
  assert.ok(garmin.activityToRun(base));
  for (const key of Object.keys(base)) {
    for (const w of WEIRD) {
      const input = Object.assign({}, base, { [key]: w });
      try {
        const r = garmin.activityToRun(input);
        // lo que sale tiene que ser seguro de guardar: sin NaN ni Infinity en los números
        if (r && typeof r === 'object') for (const [k, v] of Object.entries(r)) if (typeof v === 'number' && !Number.isFinite(v)) failures.push(`${key}=${String(typeof w === 'object' ? JSON.stringify(w) : w).slice(0, 20)} → ${k}=${v}`);
      } catch (e) { failures.push(`${key}=${typeof w === 'object' ? 'objeto' : String(w).slice(0, 20)} tiró: ${e && e.message}`); }
    }
  }
  assert.deepEqual(failures, [], 'campos que rompen:\n' + failures.slice(0, 12).join('\n'));
});

test('garmin activityToRun: el resumen entero roto (null, texto, lista, objeto vacío) no tira', () => {
  for (const w of [null, undefined, 'x', 5, [], {}, { activityType: null }, { distanceInMeters: 'mucho' }]) {
    assert.doesNotThrow(() => garmin.activityToRun(w), 'resumen = ' + JSON.stringify(w));
  }
});

test('garmin activityToRun: el detalle (muestras) roto no tira', () => {
  const summary = { activityId: 1, activityType: 'RUNNING', startTimeInSeconds: 1790000000, durationInSeconds: 600, distanceInMeters: 2000 };
  const samples = [
    null, [], [null], [{}], [{ startTimeInSeconds: 'x', latitudeInDegree: 'y' }],
    [{ startTimeInSeconds: 1790000000, latitudeInDegree: 999, longitudeInDegree: -999, heartRate: -5 }],
    [{ startTimeInSeconds: 1790000000, latitudeInDegree: -34.6, longitudeInDegree: -58.4 }, { startTimeInSeconds: 1790000000, latitudeInDegree: -34.6, longitudeInDegree: -58.4 }],
    Array.from({ length: 50000 }, (_, i) => ({ startTimeInSeconds: 1790000000 + i, latitudeInDegree: -34.6 + i / 1e5, longitudeInDegree: -58.4, heartRate: 140 }))
  ];
  for (const s of samples) {
    assert.doesNotThrow(() => garmin.activityToRun(summary, { samples: s, laps: [null, {}, { startTimeInSeconds: 'x' }] }), 'muestras = ' + JSON.stringify(s).slice(0, 60));
    assert.doesNotThrow(() => garmin.activityToRun(summary, { samples: s }), 'sin vueltas');
  }
  for (const d of [null, 'x', 5, [], { samples: 'nope' }, { samples: { length: 5 } }, { laps: 'nope' }]) assert.doesNotThrow(() => garmin.activityToRun(summary, d), 'detalle = ' + JSON.stringify(d));
});

test('garmin isRunningActivity: tipos raros no tiran', () => {
  for (const w of WEIRD) assert.doesNotThrow(() => garmin.isRunningActivity(w));
});
