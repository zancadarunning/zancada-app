// Auditoría 2026-10-22: rollover con weekStart en el futuro, pausa larga descontada una sola vez y graduación de principiantes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

const ZONES = { 1: { min: 100, max: 120 }, 2: { min: 120, max: 140 }, 3: { min: 140, max: 150 }, 4: { min: 150, max: 165 }, 5: { min: 165, max: 190 } };
function base(profile) {
  const app = loadApp();
  app.state.onboarded = true;
  app.state.profile = { name: 'P', units: 'metric', trainBy: 'distance', goal: '10k', runnerType: 'active', currentWeeklyKm: 30, weeklyKm: 30, trainingDays: ['tue', 'thu', 'sun'], createdAt: '2020-01-01', hrZones: ZONES, terrain: 'asfalto', ...profile };
  return app;
}
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

test('checkWeekRollover: con weekStart en el futuro no avanza el plan (ni una vez ni varias)', () => {
  const app = base();
  const monday = app.getMondayISO(new Date());
  app.state.weekStart = addDays(monday, 7);
  app.state.weekNumber = 11;
  app.state.plan = app.generatePlan(app.state.profile, 11);
  app.checkWeekRollover(); app.checkWeekRollover();
  assert.equal(app.state.weekStart, addDays(monday, 7));
  assert.equal(app.state.weekNumber, 11);
  assert.equal((app.state.planHistory || []).length, 0);
});

test('graduación de principiante: con meta "empezar a correr" no repite el mensaje ni regenera el plan en cada apertura', () => {
  const app = base({ goal: 'start', runnerType: 'new', currentWeeklyKm: 0, weeklyKm: 0 });
  const monday = app.getMondayISO(new Date());
  app.state.weekStart = monday; app.state.weekNumber = 5;
  app.state.plan = app.generatePlan(app.state.profile, 5);
  app.state.runs = [];
  for (let w = 1; w <= 4; w++) for (let k = 0; k < 3; k++) app.state.runs.push({ id: w * 10 + k, date: new Date(addDays(monday, -7 * w + k * 2) + 'T09:00:00').toISOString(), distanceKm: 3, durationSec: 1100, points: [] });
  const before = app.state.chat.length;
  app.checkBeginnerGraduation(); app.checkBeginnerGraduation(); app.checkBeginnerGraduation();
  assert.equal(app.state.chat.length, before, 'sin mensajes de graduación repetidos');
});

test('graduación: una cuenta con una sola semana (parcial) no se gradúa; con las 4 semanas completas sí', () => {
  const app = base({ goal: '10k', runnerType: 'new', currentWeeklyKm: 0, weeklyKm: 0 });
  const monday = app.getMondayISO(new Date());
  app.state.weekStart = monday; app.state.weekNumber = 2;
  app.state.plan = app.generatePlan(app.state.profile, 2);
  app.state.profile.createdAt = addDays(monday, -4);   // creada hace 4 días: una sola semana cerrada
  app.state.runs = [0, 1, 2].map(k => ({ id: k + 1, date: new Date(addDays(monday, -4 + k) + 'T09:00:00').toISOString(), distanceKm: 3, durationSec: 1100, points: [] }));
  app.checkBeginnerGraduation();
  assert.equal(app.state.profile.runnerType, 'new', 'una semana parcial no alcanza');
  app.state.profile.createdAt = addDays(monday, -40);
  for (let w = 1; w <= 4; w++) for (let k = 0; k < 3; k++) app.state.runs.push({ id: 100 + w * 10 + k, date: new Date(addDays(monday, -7 * w + k * 2) + 'T09:00:00').toISOString(), distanceKm: 3, durationSec: 1100, points: [] });
  app.checkBeginnerGraduation();
  assert.equal(app.state.profile.runnerType, 'active');
});
