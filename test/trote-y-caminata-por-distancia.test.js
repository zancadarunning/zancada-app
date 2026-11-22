// Reportado por el dueño 2026-11-22: a un perfil que entrena por km se le mostraba el trote y caminata en minutos ("3 min de trote"). Ahora, por distancia, los tramos son en metros (como las series) y la guía avanza por metros.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TODAY = (new Date().getDay() + 6) % 7;
const RW = { typeKey: 'easy', dist: 2.0, durMin: 20, zone: 1, runWalk: { reps: 5, runSec: 120, walkSec: 120 } };

function setup(trainBy) {
  const app = loadApp();
  app.setLangValue('es');
  const said = [];
  app.speak = (txt) => said.push(txt);
  app.haptic = () => {};
  const plan = DAYS.map((day) => ({ day, typeKey: 'rest', dist: 0 }));
  plan[TODAY] = Object.assign({ day: DAYS[TODAY] }, RW);
  app.state.profile = Object.assign(app.state.profile || {}, { trainBy, units: 'metric', name: 'T', level: 'beginner', runnerType: 'new', weeklyKm: 0, currentWeeklyKm: 0 });
  app.state.plan = plan;
  app.state.voiceEnabled = true; app.state.voiceMode = 'on';
  const tr = app.getTracker();
  tr.running = true; tr.autoPaused = false; tr.elapsedSec = 0; tr.distanceKm = 0; tr.points = []; tr.lastAnnouncedKm = 0; tr.ms = null;
  app.setupWorkoutGuide();
  return { app, tr, said };
}

test('por distancia: la estructura trae metros de trote y de caminata (múltiplos de 50)', () => {
  const { tr } = setup('distance');
  const s = tr.workout.structure;
  assert.equal(s.typeKey, 'runwalk');
  assert.ok(s.runMeters >= 100 && s.runMeters % 50 === 0, 'trote en metros: ' + s.runMeters);
  assert.ok(s.walkMeters >= 50 && s.walkMeters % 50 === 0, 'caminata en metros: ' + s.walkMeters);
});

test('por distancia: el objetivo de cada tramo es en metros y la fase avanza al recorrerlos', () => {
  const { app, tr } = setup('distance');
  app.beginWorkoutReps();
  assert.equal(tr.workout.phase, 'effort');
  assert.equal(app.getWorkoutPhaseTarget(tr.workout).meters, tr.workout.structure.runMeters);
  tr.distanceKm += tr.workout.structure.runMeters / 1000 + 0.001;
  tr.elapsedSec += 1;
  app.tickWorkoutGuide();
  assert.equal(tr.workout.phase, 'recovery', 'pasa a caminata al completar los metros de trote');
  assert.equal(app.getWorkoutPhaseTarget(tr.workout).meters, tr.workout.structure.walkMeters);
});

test('por distancia: la voz dice metros, no minutos', () => {
  const { app, tr, said } = setup('distance');
  app.beginWorkoutReps();
  const run = said.filter((x) => /Trot/.test(x)).join(' | ');
  assert.match(run, /\d+ metros/, run);
  assert.ok(!/minuto/i.test(run), 'el tramo no habla de minutos: ' + run);
});

test('por distancia: la descripción del plan está en metros', () => {
  const app = loadApp();
  app.setLangValue('es');
  app.state.profile = Object.assign(app.state.profile || {}, { trainBy: 'distance', units: 'metric', name: 'T', runnerType: 'new', weeklyKm: 0, currentWeeklyKm: 0 });
  const txt = app.planLabelBody(Object.assign({ day: 'wed', beginner: true }, RW)).desc;
  assert.match(txt, /\d+ m de trote/, txt);
  assert.ok(!/min de trote/.test(txt), txt);
});

test('por tiempo sigue igual: tramos en segundos y descripción en minutos', () => {
  const { app, tr } = setup('time');
  const s = tr.workout.structure;
  assert.equal(s.runMeters, null);
  app.beginWorkoutReps();
  assert.equal(app.getWorkoutPhaseTarget(tr.workout).sec, 120);
  app.state.profile.trainBy = 'time';
  assert.match(app.planLabelBody(Object.assign({ day: 'wed', beginner: true }, RW)).desc, /2 min de trote/);
});
