// El día de la carrera cargada en "Próximos eventos": a los relojes va como CARRERA (una sola vuelta de distancia, sin entrada en calor propia ni objetivo de pulso), no como la sesión normal que la app deja guardada por debajo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');
const { buildGarminWorkout } = require('../api/_lib/garmin-workout-builder');
const { buildCorosCourse } = require('../api/_lib/coros-workout-builder');
const { cleanDay } = require('../api/_lib/watch-plan-clean');

const ZONES = { 1: { min: 100, max: 125 }, 2: { min: 125, max: 140 }, 3: { min: 140, max: 155 }, 4: { min: 155, max: 170 }, 5: { min: 170, max: 190 } };

function setup(app, eventOffset, distanceKm) {
  app.state.profile = { weeklyKm: 20, currentWeeklyKm: 20, goal: '21k', runnerType: 'active', trainingDays: ['tue', 'thu', 'sun'], terrain: 'asfalto', units: 'metric', trainBy: 'distance', hrZones: ZONES };
  // una semana que todavía no empezó: todos sus días cuentan como "desde hoy"
  const monday = app.getMondayISO(new Date(Date.now() + 7 * 864e5));
  app.state.weekStart = monday;
  const rest = { typeKey: 'rest', dist: 0 };
  app.state.plan = [rest, { typeKey: 'progression', zone: 3, dist: 5, day: 'tue' }, rest, { typeKey: 'easy', zone: 2, dist: 4, day: 'thu' }, rest, rest, { typeKey: 'long', zone: 2, dist: 8, day: 'sun' }];
  app.state.event = eventOffset == null ? null : { name: '21k Primavera', type: 'ruta', distanceKm: distanceKm === undefined ? 21 : distanceKm, date: app.addDaysToIsoLocal(monday, eventOffset) };
  return monday;
}
const week = (app, monday) => app.buildWatchPlanDays().filter(d => d.date >= monday && d.date <= app.addDaysToIsoLocal(monday, 6));

test('sin carrera cargada, las tres sesiones de la semana van al reloj', () => {
  const app = loadApp();
  const monday = setup(app, null);
  assert.equal(week(app, monday).length, 3);
});

test('el día de la carrera cargada va como carrera (distancia del evento, sin sesión normal debajo); las demás sesiones siguen igual', () => {
  const app = loadApp();
  const monday = setup(app, 6);   // la carrera cae el domingo, donde estaba la tirada
  const days = week(app, monday);
  assert.equal(days.length, 3);
  const race = days.find(d => d.date === app.addDaysToIsoLocal(monday, 6));
  assert.equal(race.race, true); assert.equal(race.typeKey, 'race'); assert.equal(race.distKm, 21);
  assert.equal(race.zone, null); assert.equal(race.warmupMin, 0); assert.equal(race.cooldownMin, 0);
  assert.match(race.name, /21k Primavera/);
  assert.equal(days.filter(d => d.race).length, 1);
  assert.deepEqual([...days.filter(d => !d.race).map(d => d.typeKey)], ['progression', 'easy']);
});

test('una carrera sin distancia o ya hecha no se manda; una carrera un día sin sesión también aparece', () => {
  const app = loadApp();
  let monday = setup(app, 6, 0);
  assert.equal(week(app, monday).filter(d => d.race).length, 0, 'sin distancia no hay qué mandar');
  assert.equal(week(app, monday).length, 2, 'y tampoco se manda la sesión normal de ese día');
  monday = setup(app, 6);
  app.state.plan[6].status = 'done';
  assert.equal(week(app, monday).filter(d => d.race).length, 0, 'ya hecha');
  monday = setup(app, 4);   // el viernes no tenía sesión
  assert.equal(week(app, monday).filter(d => d.race).length, 1);
});

test('Garmin: la carrera es una sola vuelta de distancia, sin entrada en calor ni objetivo de pulso', () => {
  const race = cleanDay({ date: '2026-11-08', name: 'Carrera: 21k Primavera', typeKey: 'race', race: true, zone: null, distKm: 21, desc: 'Hoy es tu carrera', warmupMin: 0, cooldownMin: 0 });
  assert.equal(race.race, true);
  const steps = buildGarminWorkout(race, ZONES).segments[0].steps;
  assert.equal(steps.length, 1);
  assert.equal(steps[0].intensity, 'ACTIVE'); assert.equal(steps[0].durationType, 'DISTANCE'); assert.equal(steps[0].durationValue, 21000);
  assert.equal(steps[0].targetType, 'OPEN');
  assert.equal(cleanDay({ date: '2026-11-08', distKm: 5 }).race, false, 'una sesión común no es carrera');
});

test('COROS: la carrera va sin intensidad de pulso', () => {
  const race = cleanDay({ date: '2026-11-08', name: 'Carrera: 21k Primavera', typeKey: 'race', race: true, zone: null, distKm: 21, warmupMin: 0, cooldownMin: 0 });
  const sections = buildCorosCourse(race, ZONES, {}).sections;
  assert.equal(sections.length, 1);
  assert.equal(sections[0].targetValue, 21000);
  assert.equal('intensityType' in sections[0], false);
});
