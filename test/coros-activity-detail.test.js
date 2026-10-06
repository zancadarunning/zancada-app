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
