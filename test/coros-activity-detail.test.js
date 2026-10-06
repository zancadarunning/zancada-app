const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = 'http://sb';
process.env.SUPABASE_SERVICE_KEY = 'svc';

const { parseCorosActivityDetailText, activityToRun, getCorosRunRecords } = require('../api/_lib/coros-activity-helpers');

// Misma forma que devolvió getActivityDetail en producción (valores de ejemplo).
const DETAIL = `🏃 Outdoor Run Activity Details
========================================

Workout Time: 40:54
Distance: 3.08 km
Total Time: 41:10
Average Pace: 13:18 /km
Moving Average Pace: 13:10 /km
Adjusted Pace: 13:05 /km
Average Heart Rate: 125 bpm
Average Cadence: 158 spm
Average Stride Length: 0.85 m
Average Power: 142 W
Elevation Gain / Loss: 31 m / 29 m
Calories: 374 kcal
Training Load: 52
Aerobic TE: 2.1
Anaerobic TE: 0.0
Performance: -3`;

test('getActivityDetail: saca cadencia, potencia, zancada, desnivel y pulso', () => {
  const d = parseCorosActivityDetailText(DETAIL);
  assert.strictEqual(d.avgCadence, 158);
  assert.strictEqual(d.avgPower, 142);
  assert.strictEqual(d.avgStrideM, 0.85);
  assert.strictEqual(d.avgHr, 125);
  assert.strictEqual(d.elevationGain, 31);
  assert.strictEqual(d.elevationLoss, 29);
});

test('getActivityDetail: datos ausentes quedan en null y no rompen', () => {
  const d = parseCorosActivityDetailText('Average Cadence: -- spm\nElevation Gain / Loss: -- m / -- m');
  assert.strictEqual(d.avgCadence, null);
  assert.strictEqual(d.elevationGain, null);
  assert.strictEqual(parseCorosActivityDetailText(undefined).avgPower, null);
});

test('querySportRecords: guarda el SportType y activityToRun usa el detalle ya mezclado', () => {
  const report = `Sport Records — 2026-08-18 to 2026-09-17 (1 records)
========================

1. Trail Run — 2026-09-06
   Location: Trail
   Time Window: startTimestamp=1788732961 | endTimestamp=1788735434
   Duration: 40:54 | Distance: 3.08 km
   Average Pace: 13:18 /km | Avg HR: 125 bpm | Calories: 374 kcal
   LabelId: 480160020539933272 | SportType: 102`;
  const [rec] = getCorosRunRecords(report);
  assert.strictEqual(rec.sportType, 102);
  Object.assign(rec, parseCorosActivityDetailText(DETAIL));
  const run = activityToRun(rec);
  assert.strictEqual(run.avgCadence, 158);
  assert.strictEqual(run.elevationGain, 31);
  assert.strictEqual(run.elevationLoss, 29);
  assert.strictEqual(run.avgPower, 142);
  assert.strictEqual(run.source, 'coros');
});

test('queryActivityLapData: las vueltas por km (grupo type 2, distancia en cm) pasan a parciales', () => {
  const { parseCorosLapSplits } = require('../api/_lib/coros-activity-helpers');
  const laps = {
    lapGroups: [
      { type: 2, lapDistance: 100000, laps: [
        { lapIndex: 1, distance: 100000, time: 330, avgPace: 330, avgHr: 140, avgCadence: 169 },
        { lapIndex: 2, distance: 100000, time: 318, avgPace: 318, avgHr: 148, avgCadence: 171 },
        { lapIndex: 3, distance: 20000, time: 60, avgPace: 300, avgHr: 0, avgCadence: 0 }
      ] },
      { type: -1, lapDistance: 220000, laps: [{ lapIndex: 1, distance: 220000, time: 708 }] }
    ]
  };
  const s = parseCorosLapSplits(laps);
  assert.equal(s.length, 3);
  assert.deepEqual({ km: s[0].km, paceMin: s[0].paceMin, avgHr: s[0].avgHr, avgCadence: s[0].avgCadence }, { km: 1, paceMin: 5.5, avgHr: 140, avgCadence: 169 });
  assert.equal(s[1].km, 2);
  assert.equal(s[2].km, 0.2);            // el tramo final parcial lleva su distancia
  assert.equal(s[2].avgHr, null);        // sin pulso no se inventa un 0
  assert.deepEqual(parseCorosLapSplits({ lapGroups: [] }), []);
});

test('activityToRun usa el FIT de COROS (mapa, parciales, desnivel y pulso máximo) cuando está', () => {
  const rec = {
    labelId: '1', dateStr: '2026-09-06', startTimestamp: 1788732961, durationSec: 2454, distanceKm: 3.08, avgHr: 125, title: 'Trail Run', sportType: 102,
    fit: { points: [{ lat: 1, lon: 2, t: 0 }], splits: [{ km: 1, paceMin: 5.5 }], series: { t: [0], hr: [120], paceMin: [5.5] }, elevationGain: 40, elevationLoss: 38, maxHr: 171, avgPower: 150, maxPower: 300 }
  };
  const run = activityToRun(rec);
  assert.equal(run.points.length, 1);
  assert.equal(run.splits[0].km, 1);
  assert.equal(run.elevationGain, 40);
  assert.equal(run.maxHr, 171);
  assert.equal(run.maxPower, 300);
  assert.ok(run.series && run.series.hr[0] === 120);
});

test('applyCorosEnrichmentToRun: completa una carrera guardada con FIT, o con vueltas, y limita los reintentos', () => {
  const { applyCorosEnrichmentToRun } = require('../api/_lib/coros-activity-helpers');
  const run = { id: 'coros_1', corosId: '1', source: 'coros', points: [], splits: [], maxHr: null };
  const ok = applyCorosEnrichmentToRun(run, { avgCadence: 160.4, elevationGain: 12, fit: { points: [{ lat: 1, lon: 1 }, { lat: 1.1, lon: 1.1 }], splits: [{ km: 1 }], series: null, maxHr: 170 } });
  assert.equal(ok, true);
  assert.equal(run.points.length, 2);
  assert.equal(run.avgCadence, 160);
  assert.equal(run.maxHr, 170);
  assert.equal(run.splitsV, 3);
  assert.equal(run.corosBackfillTries, 1);
  // FIT sin GPS (cinta): se marca noGps para no volver a intentar
  const treadmill = { id: 'coros_2', corosId: '2', points: [] };
  applyCorosEnrichmentToRun(treadmill, { fit: { points: [], splits: [] } });
  assert.equal(treadmill.noGps, true);
  // sin nada nuevo: devuelve false pero igual cuenta el intento
  const none = { id: 'coros_3', corosId: '3' };
  assert.equal(applyCorosEnrichmentToRun(none, {}), false);
  assert.equal(none.corosBackfillTries, 1);
});
