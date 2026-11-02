// Carrera cargada en "Próximos eventos" de 10 km o más: la semana ANTERIOR baja un 15 % (la de la carrera ya bajaba un 25 %), y alrededor de la carrera
// (el día anterior y los de esa semana después) no quedan sesiones fuertes. Las carreras cortas y las lejanas no cambian nada.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

const HEAVY = ['intervals', 'tempo', 'fartlek', 'hills', 'progression', 'long'];
const MON_PRE = '2026-11-02';    // la semana anterior a la de la carrera
const MON_RACE = '2026-11-09';   // la semana de la carrera (domingo 15/11)
const RACE = '2026-11-15';

function setup(app, event) {
  app.state.profile = { weeklyKm: 30, currentWeeklyKm: 30, goal: '21k', runnerType: 'active', trainingDays: ['mon', 'wed', 'fri', 'sat', 'sun'], terrain: 'asfalto', units: 'metric', trainBy: 'distance', birth: '1990-01-01', weight: 70, height: 175 };
  app.state.weekStart = MON_PRE;
  app.state.runs = [];
  app.state.event = event || null;
}
const total = plan => plan.reduce((a, d) => a + (d.dist || 0), 0);
const plan = (app, mon) => app.generatePlan(app.state.profile, 2, mon);

test('la semana anterior a una carrera de 21 km baja un 15 %; la de la carrera conserva su recorte; sin carrera no cambia', () => {
  const app = loadApp();
  setup(app, null);
  const basePre = total(plan(app, MON_PRE)), baseRace = total(plan(app, MON_RACE));
  setup(app, { name: 'Media', type: 'ruta', distanceKm: 21, date: RACE });
  const pre = total(plan(app, MON_PRE)), race = total(plan(app, MON_RACE));
  assert.ok(Math.abs(pre / basePre - 0.85) < 0.07, 'semana previa ~0,85: ' + (pre / basePre).toFixed(3));
  assert.ok(Math.abs(race / baseRace - 0.75) < 0.07, 'semana de la carrera ~0,75: ' + (race / baseRace).toFixed(3));
});

test('una carrera corta (5 km) o lejana no cambia ninguna semana', () => {
  const app = loadApp();
  setup(app, null);
  const basePre = total(plan(app, MON_PRE));
  setup(app, { name: 'Corta', type: 'ruta', distanceKm: 5, date: RACE });
  assert.equal(total(plan(app, MON_PRE)), basePre, '5 km: sin descarga previa');
  setup(app, { name: 'Lejana', type: 'ruta', distanceKm: 21, date: '2027-02-14' });
  assert.equal(total(plan(app, MON_PRE)), basePre, 'a meses: no reordena nada');
});

test('el día anterior a la carrera y los de esa semana después no llevan sesiones fuertes', () => {
  const app = loadApp();
  setup(app, { name: 'Media', type: 'ruta', distanceKm: 21, date: '2026-11-12' });   // jueves
  const days = plan(app, MON_RACE);
  const idx = 3;
  assert.ok(!HEAVY.includes(days[idx - 1].typeKey), 'miércoles (anterior): ' + days[idx - 1].typeKey);
  for (let i = idx + 1; i < 7; i++) assert.ok(!HEAVY.includes(days[i].typeKey), `día ${i} después: ${days[i].typeKey}`);
  setup(app, null);
  const base = plan(app, MON_RACE);
  assert.ok(HEAVY.includes(base[idx - 1].typeKey) || base.slice(idx + 1).some(d => HEAVY.includes(d.typeKey)), 'el plan sin carrera sí tenía sesiones fuertes ahí (el test mide algo)');
});
