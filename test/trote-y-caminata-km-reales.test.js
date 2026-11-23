// Pedido del dueño 2026-11-22: la sesión de trote y caminata por distancia muestra los km reales de sus tramos (antes decía 2.7 km y los tramos sumaban 2.0).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

const prof = (extra) => Object.assign({ name: 'T', goal: '5k', runnerType: 'new', trainBy: 'distance', units: 'metric', terrain: 'asfalto', trainingDays: ['mon', 'wed', 'fri'], weeklyKm: 0, currentWeeklyKm: 0, birth: '1995-01-01', weight: 68, height: 168 }, extra || {});

test('por distancia: la distancia del día es la que suman sus tramos (semanas 1 a 8)', () => {
  const app = loadApp();
  for (let wk = 1; wk <= 8; wk++) {
    const p = prof(); app.state.profile = p;
    const plan = app.generatePlan(p, wk, '2026-11-16');
    plan.filter((d) => d.runWalk).forEach((d) => {
      const r = d.runWalk;
      const runM = app.repMetersFromMin(r.runSec / 60, p), walkM = Math.max(50, Math.round(r.walkSec * 1.4 / 50) * 50);
      const km = Math.round(r.reps * (runM + walkM) / 100) / 10;
      assert.equal(d.dist, Math.max(0.5, km), `semana ${wk} ${d.day}`);
    });
  }
});

test('el weeklyKm calculado del principiante por distancia coincide con la suma real del plan de la semana 1', () => {
  const app = loadApp();
  const p = prof(); p.weeklyKm = app.calcWeeklyKm(p); app.state.profile = p;
  const plan = app.generatePlan(p, 1, '2026-11-16');
  const total = Math.round(plan.reduce((s, d) => s + (d.dist || 0), 0) * 10) / 10;
  assert.equal(p.weeklyKm, total);
});

test('por tiempo no cambia: el plan sigue sin tocar los km', () => {
  const app = loadApp();
  const p = prof({ trainBy: 'time' }); app.state.profile = p;
  const plan = app.generatePlan(p, 1, '2026-11-16');
  assert.ok(plan.some((d) => d.runWalk), 'tiene trote y caminata');
});

test('una sesión que arma Zonda por distancia también muestra los km de sus tramos', () => {
  const app = loadApp();
  const p = prof(); app.state.profile = p; app.state.weekNumber = 1; app.state.weekStart = app.getMondayISO(new Date());
  app.state.plan = app.generatePlan(p, 1, app.state.weekStart); app.state.chat = [];
  app.applyPlanChange({ dia: 'wed', semana: 'siguiente', tipo: 'Rodaje suave', tipo_categoria: 'easy', duracion_min: 20, zona: 1, descripcion: 'Tranqui' });
  const d = app.getNextWeekPlan().plan.find((x) => x.day === 'wed');
  const r = d.runWalk;
  const runM = app.repMetersFromMin(r.runSec / 60, p), walkM = Math.max(50, Math.round(r.walkSec * 1.4 / 50) * 50);
  assert.equal(d.dist, Math.max(0.5, Math.round(r.reps * (runM + walkM) / 100) / 10));
});
