// Pedido del dueño 2026-11-22: la sesión de trote y caminata llega a los relojes por BLOQUES, para que el reloj avise cuándo parar y cuándo seguir.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');
const { buildGarminWorkout } = require('../api/_lib/garmin-workout-builder');
const { buildCorosCourse } = require('../api/_lib/coros-workout-builder');

const prof = (extra) => Object.assign({ name: 'T', goal: '5k', runnerType: 'new', trainBy: 'distance', units: 'metric', terrain: 'asfalto', trainingDays: ['mon', 'wed', 'fri'], weeklyKm: 0, currentWeeklyKm: 0, birth: '1995-01-01', weight: 68, height: 168 }, extra || {});
const RW = { day: 'wed', typeKey: 'easy', dist: 2, durMin: 20, zone: 1, runWalk: { reps: 5, runSec: 120, walkSec: 120 } };

for (const trainBy of ['distance', 'time']) {
  test(`${trainBy}: la sesión de trote y caminata se manda al reloj como bloques de trote y caminata`, () => {
    const app = loadApp(); app.state.profile = prof({ trainBy });
    const p = app.watchDayPayload(RW, '2026-11-25');
    assert.equal(p.interval.reps, 5);
    assert.equal(p.interval.workMin, 2);
    assert.equal(p.interval.restMin, 2);
    assert.equal(p.repSec, 120);
    assert.equal(p.restSec, 120);
  });
}

test('un rodaje común (sin trote y caminata) sigue yendo continuo al reloj', () => {
  const app = loadApp(); app.state.profile = prof();
  const p = app.watchDayPayload({ day: 'wed', typeKey: 'easy', dist: 5, zone: 2 }, '2026-11-25');
  assert.equal(p.interval, null);
});

test('Garmin y COROS arman un grupo de 5 repeticiones (trote + caminata) con ese payload', () => {
  const app = loadApp(); app.state.profile = prof();
  const p = JSON.parse(JSON.stringify(app.watchDayPayload(RW, '2026-11-25')));
  const zones = [null, { min: 90, max: 110 }, { min: 111, max: 130 }, { min: 131, max: 150 }, { min: 151, max: 170 }, { min: 171, max: 190 }];
  const g = JSON.stringify(buildGarminWorkout(p, zones, {}));
  assert.match(g, /WorkoutRepeatStep/, 'Garmin: grupo repetido');
  assert.match(g, /"repeatValue":5/, 'Garmin: 5 repeticiones');
  assert.match(g, /"stepType":"?(INTERVAL|RECOVERY)|"INTERVAL"|"RECOVERY"/, 'Garmin: pasos de trote y de caminata');
  const c = buildCorosCourse(p, zones, {});
  const grp = c.sections.find((s) => s.intervalGroup);
  assert.ok(grp, 'COROS: grupo');
  assert.equal(grp.repeats, 5);
});
