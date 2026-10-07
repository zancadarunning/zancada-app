// test/perf/client-budgets.test.js
//
// Presupuestos de tiempo de las funciones del plan que la app llama en cada pantalla (renderAll las usa varias veces por
// toque). Los topes son MUY generosos (decenas de veces lo medido: ~0,04 ms con 20 carreras, ~4 ms con 3.000): no buscan
// optimizar, buscan atrapar una regresión grosa (por ejemplo, que alguien meta un recorrido de todo el historial dentro de un
// bucle por día) antes de que un corredor con años de carreras note la app lenta.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../support/load-app');

function runs(n) {
  return Array.from({ length: n }, (_, i) => ({ id: 'r' + i, date: new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString(), distanceKm: 5 + (i % 7), durationSec: 1800 + (i % 13) * 60, source: 'strava' }));
}
function ms(fn, reps) {
  fn();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) fn();
  return Number(process.hrtime.bigint() - t0) / 1e6 / reps;
}
const profile = { weeklyKm: 40, currentWeeklyKm: 40, goal: '10k', runnerType: 'active', trainingDays: ['tue', 'thu', 'sat', 'sun'], terrain: 'asfalto', units: 'metric', trainBy: 'distance', birth: '1990-01-01', createdAt: '2020-01-01' };

test('con 5.000 carreras el ritmo base y el orden por fecha siguen siendo rápidos', () => {
  const app = loadApp();
  app.state.profile = profile; app.state.event = null; app.state.plan = []; app.state.weekStart = '2026-10-05'; app.state.weekNumber = 7;
  app.state.runs = runs(5000);
  const sort = ms(() => app.runsByDateAsc(), 20);
  const pace = ms(() => app.estimateBasePaceMinPerKm(profile), 20);
  assert.ok(sort < 25, `runsByDateAsc tardó ${sort.toFixed(2)} ms (tope 25)`);
  assert.ok(pace < 25, `estimateBasePaceMinPerKm tardó ${pace.toFixed(2)} ms (tope 25)`);
});

test('generar un plan y la semana siguiente cuesta una fracción de milisegundo, aun con historial grande', () => {
  const app = loadApp();
  app.state.profile = profile; app.state.event = null; app.state.plan = []; app.state.weekStart = '2026-10-05'; app.state.weekNumber = 7;
  app.state.runs = runs(2000);
  const gen = ms(() => app.generatePlan(profile, 7, '2026-10-05'), 50);
  const next = ms(() => app.getNextWeekPlan(), 50);
  assert.ok(gen < 10, `generatePlan tardó ${gen.toFixed(2)} ms (tope 10)`);
  assert.ok(next < 10, `getNextWeekPlan tardó ${next.toFixed(2)} ms (tope 10)`);
});
