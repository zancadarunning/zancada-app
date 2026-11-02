// Una actividad con datos rotos de Strava/Polar/Wahoo/Suunto/COROS se salta en vez de cortar la sincronización de la persona (y volver a cortarla en cada pasada del cron).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { safeConvert, safeConvertSync } = require('../api/_lib/safe-convert');

const suunto = require('../api/_lib/suunto-activity-helpers');
const wahoo = require('../api/_lib/wahoo-activity-helpers');
const polar = require('../api/_lib/polar-activity-helpers');
const coros = require('../api/_lib/coros-activity-helpers');
const strava = require('../api/_lib/strava-activity-helpers');

const quiet = async fn => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

test('safeConvert devuelve el resultado normal, y null (sin tirar) cuando el conversor falla', async () => {
  assert.equal(await safeConvert(async () => 5), 5);
  assert.equal(safeConvertSync(() => 7), 7);
  assert.equal(await quiet(() => safeConvert(async () => { throw new Error('boom'); }, 'x')), null);
  assert.equal(await quiet(() => safeConvert(() => { throw new Error('boom'); }, 'x')), null);
  assert.equal(await quiet(async () => safeConvertSync(() => { throw new Error('boom'); }, 'x')), null);
});

test('con una fecha de inicio absurda cada conversor tira (por eso hace falta la guarda) y con la guarda se salta', async () => {
  const cases = [
    ['suunto', () => suunto.workoutToRun({ workoutKey: 'k', startTime: 1e30, totalTime: 100, totalDistance: 1000 }), 'sync'],
    ['wahoo', () => wahoo.workoutToRun({ id: 1, starts: 'abc', workout_summary: { distance_accum: 1000, duration_active_accum: 600 } }, null), 'async'],
    ['polar', () => polar.exerciseToRun({ id: 'x', start_time: 'abc', distance: 1000, duration: 'PT10M' }, null), 'async'],
    ['coros', () => coros.activityToRun({ labelId: 'a', dateStr: 'abc', startTimestamp: 1790000000, distance: 1000 }), 'sync'],
    ['strava', () => strava.activityToRun({ id: 1, start_date: 'abc', start_date_local: 'abc', distance: 1000, moving_time: 600, type: 'Run' }, null), 'async']
  ];
  for (const [name, fn] of cases) {
    let threw = false;
    try { await fn(); } catch (e) { threw = true; }
    assert.ok(threw, name + ': este test existe porque el conversor tira con una fecha rota; si dejó de tirar, la guarda sigue siendo inofensiva');
    assert.equal(await quiet(() => safeConvert(fn, name)), null, name + ' se salta');
  }
});

test('todos los puntos donde se convierte una actividad de proveedor usan la guarda', () => {
  const dir = path.join(__dirname, '..', 'api');
  const sites = {
    'coros-auth.js': 'activityToRun', 'coros-sync-now.js': 'activityToRun', 'coros-sync.js': 'activityToRun',
    'polar-auth.js': 'exerciseToRun', 'polar-sync-now.js': 'exerciseToRun', 'polar-sync.js': 'exerciseToRun',
    'strava-auth.js': 'activityToRun', 'strava-sync-now.js': 'activityToRun', 'sync-strava.js': 'activityToRun',
    'suunto-sync-now.js': 'workoutToRun', 'suunto-sync.js': 'workoutToRun',
    'wahoo-auth.js': 'workoutToRun', 'wahoo-sync-now.js': 'workoutToRun', 'wahoo-sync.js': 'workoutToRun'
  };
  for (const [file, fn] of Object.entries(sites)) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.ok(src.includes("require('./_lib/safe-convert')"), file + ': importa la guarda');
    assert.ok(/safeConvert(Sync)?\(\(\) => /.test(src), file + ': usa la guarda');
    // ninguna llamada "pelada" al conversor dentro de un push o map
    assert.ok(!new RegExp('(push\\(await |push\\(|map\\([^)]*=> )' + fn + '\\(').test(src), file + ': queda una llamada sin guarda a ' + fn);
  }
});
