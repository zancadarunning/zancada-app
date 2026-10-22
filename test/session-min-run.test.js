// test/session-min-run.test.js
//
// Una carrera solo da por hecha la sesión planeada del día si llega al 30% de la distancia O del tiempo planeado.
// Antes cualquier carrera del día valía: arrancar y frenar sin querer (400 m) marcaba como hecha una tirada larga o el Test de nivel.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

function setup(planDay) {
  const app = loadApp();
  const now = new Date();
  const idx = (now.getDay() + 6) % 7;
  app.state.onboarded = true;
  app.state.profile = { units: 'metric', trainBy: 'distance', createdAt: '2020-01-01' };
  app.state.weekStart = app.getMondayISO(now);
  app.state.plan = Array.from({ length: 7 }, (_, i) => (i === idx ? { day: 'x', ...planDay } : { day: 'x', typeKey: 'rest', dist: 0 }));
  app.state.runs = [];
  return { app, idx, iso: now.toISOString() };
}
const addRun = (app, iso, run) => { app.state.runs.push({ id: 1, date: iso, points: [], ...run }); };

test('400 m no marcan como hecha una tirada larga de 20 km; 7 km sí (más del 30%)', () => {
  const { app, idx, iso } = setup({ typeKey: 'long', dist: 20 });
  addRun(app, iso, { distanceKm: 0.4, durationSec: 79 });
  app.autoMarkSessionDone(iso, 1);
  assert.equal(app.state.plan[idx].status, undefined);
  app.state.runs[0] = { id: 1, date: iso, points: [], distanceKm: 7, durationSec: 2400 };
  app.autoMarkSessionDone(iso, 1);
  assert.equal(app.state.plan[idx].status, 'done');
  assert.equal(app.state.plan[idx].linkedRunId, 1);
});

test('también vale por tiempo: poca distancia pero más del 30% de los minutos planeados', () => {
  const { app, idx, iso } = setup({ typeKey: 'easy', dist: 10, durMin: 60 });
  addRun(app, iso, { distanceKm: 1, durationSec: 20 * 60 });
  app.autoMarkSessionDone(iso, 1);
  assert.equal(app.state.plan[idx].status, 'done');
});

test('el Test de nivel de 12 minutos no se da por hecho con una carrera de 79 segundos', () => {
  const { app, idx, iso } = setup({ typeKey: 'test', dist: 2, durMin: 12 });
  addRun(app, iso, { distanceKm: 0.41, durationSec: 79 });
  app.autoMarkSessionDone(iso, 1);
  assert.equal(app.state.plan[idx].status, undefined);
  app.state.runs[0] = { id: 1, date: iso, points: [], distanceKm: 2.4, durationSec: 12 * 60 };
  app.autoMarkSessionDone(iso, 1);
  assert.equal(app.state.plan[idx].status, 'done');
});

test('un día sin sesión planeada no exige nada, y relinkTodayRun / el repaso de días salteados respetan el mismo mínimo', () => {
  const { app, idx, iso } = setup({ typeKey: 'long', dist: 20 });
  addRun(app, iso, { distanceKm: 0.4, durationSec: 79 });
  assert.equal(app.relinkTodayRun(), false);
  assert.equal(app.state.plan[idx].status, undefined);
  app.state.plan[idx].status = 'skipped';
  app.repairSkippedDaysWithMatchingRuns();
  assert.equal(app.state.plan[idx].status, 'skipped', 'una carrera mínima no rescata un día salteado');
  assert.equal(app.runCountsForSession({ distanceKm: 0.1, durationSec: 30 }, { typeKey: 'rest', dist: 0 }), true);
});
