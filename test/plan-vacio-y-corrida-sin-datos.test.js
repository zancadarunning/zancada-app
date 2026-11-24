// Hallado en una prueba con datos dañados (2026-11-24): una cuenta ya configurada con el plan vacío rompía Inicio, y una corrida guardada sin distancia o sin duración rompía el Historial.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

const PROFILE = { name: 'T', level: 'intermediate', runnerType: 'regular', trainBy: 'distance', units: 'metric', weeklyKm: 20, currentWeeklyKm: 20, daysPerWeek: 4, availableDays: ['mon', 'wed', 'fri', 'sat'], goal: '10k', age: 30, weight: 70, height: 170, birth: '1990-01-01', gender: 'm' };

test('cuenta configurada con el plan vacío: al abrir se arma el plan de la semana y Inicio dibuja', () => {
  const app = loadApp();
  app.setLangValue('es');
  app.state.onboarded = true;
  app.state.profile = Object.assign({}, PROFILE);
  app.state.plan = [];
  app.checkWeekRollover();
  assert.equal(app.state.plan.length, 7);
  assert.doesNotThrow(() => app.renderHome());
});

test('una cuenta sin configurar no inventa un plan', () => {
  const app = loadApp();
  app.state.onboarded = false;
  app.state.profile = {};
  app.state.plan = [];
  app.checkWeekRollover();
  assert.equal(app.state.plan.length, 0);
});

test('corridas sin distancia o sin duración quedan en 0 y el Historial dibuja', () => {
  const app = loadApp();
  app.setLangValue('es');
  app.state.profile = Object.assign({}, PROFILE);
  app.state.plan = app.generatePlan(app.state.profile, 3, new Date(2026, 10, 23));
  const s = app.normalizeLoadedState({ profile: app.state.profile, plan: app.state.plan, runs: [{ date: '2026-11-20' }, { date: '2026-11-21', durationSec: 600 }, { date: '2026-11-22', distanceKm: 2 }] });
  assert.ok(s.runs.every((r) => Number.isFinite(r.distanceKm) && Number.isFinite(r.durationSec)));
  app.state.runs = s.runs;
  assert.doesNotThrow(() => app.renderHistory());
});
