// El día de la carrera cargada en "Próximos eventos" no se manda al reloj como sesión (la app lo muestra como la carrera, pero por debajo queda guardada la sesión normal de ese día).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

function setup(app, eventOffset) {
  app.state.profile = { weeklyKm: 20, currentWeeklyKm: 20, goal: '21k', runnerType: 'active', trainingDays: ['tue', 'thu', 'sun'], terrain: 'asfalto', units: 'metric', trainBy: 'distance',
    hrZones: { 1: { min: 100, max: 125 }, 2: { min: 125, max: 140 }, 3: { min: 140, max: 155 }, 4: { min: 155, max: 170 }, 5: { min: 170, max: 190 } } };
  // una semana que todavía no empezó: todos sus días cuentan como "desde hoy"
  const monday = app.getMondayISO(new Date(Date.now() + 7 * 864e5));
  app.state.weekStart = monday;
  const rest = { typeKey: 'rest', dist: 0 };
  app.state.plan = [rest, { typeKey: 'progression', zone: 3, dist: 5, day: 'tue' }, rest, { typeKey: 'easy', zone: 2, dist: 4, day: 'thu' }, rest, rest, { typeKey: 'long', zone: 2, dist: 8, day: 'sun' }];
  app.state.event = eventOffset == null ? null : { name: '21k', type: 'ruta', distanceKm: 21, date: app.addDaysToIsoLocal(monday, eventOffset) };
  return monday;
}
const datesOf = (app, monday) => [...app.buildWatchPlanDays().filter(d => d.date >= monday && d.date <= app.addDaysToIsoLocal(monday, 6)).map(d => d.date)];

test('sin carrera cargada, las tres sesiones de la semana van al reloj', () => {
  const app = loadApp();
  const monday = setup(app, null);
  assert.equal(datesOf(app, monday).length, 3);
});

test('el día de la carrera cargada no va al reloj; las demás sesiones sí', () => {
  const app = loadApp();
  const monday = setup(app, 6);   // la carrera cae el domingo, donde estaba la tirada
  const dates = datesOf(app, monday);
  assert.equal(dates.length, 2);
  assert.ok(!dates.includes(app.addDaysToIsoLocal(monday, 6)), 'el domingo de la carrera no se manda');
  const mid = setup(app, 3);
  assert.ok(!datesOf(app, mid).includes(app.addDaysToIsoLocal(mid, 3)), 'vale para cualquier día de la semana');
});
