// Pedido del dueño 2026-11-24: el test de nivel (Cooper, 12 min) también se manda al reloj, como UN paso de 12 minutos a esfuerzo máximo (sin objetivo de pulso).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');
const { buildGarminWorkout } = require('../api/_lib/garmin-workout-builder');
const { buildCorosCourse } = require('../api/_lib/coros-workout-builder');

const prof = (extra) => Object.assign({ name: 'T', goal: '5k', runnerType: 'new', trainBy: 'distance', units: 'metric', terrain: 'asfalto', trainingDays: ['mon', 'wed', 'fri'], weeklyKm: 0, currentWeeklyKm: 0, birth: '1995-01-01', weight: 68, height: 168 }, extra || {});
const TEST_DAY = { day: 'wed', typeKey: 'test', dist: 2.1, durMin: 12, timeBased: true, terrain: 'asfalto', zone: null, beginner: true };
const ZONES = [null, { min: 90, max: 110 }, { min: 111, max: 130 }, { min: 131, max: 150 }, { min: 151, max: 170 }, { min: 171, max: 190 }];

for (const trainBy of ['distance', 'time']) {
  test(`${trainBy}: el payload del test es de 12 minutos por tiempo, sin bloques`, () => {
    const app = loadApp(); app.state.profile = prof({ trainBy });
    const p = app.watchDayPayload(TEST_DAY, '2026-11-25');
    assert.equal(p.typeKey, 'test');
    assert.equal(p.durMin, 12);
    assert.equal(p.timeBased, true);
    assert.equal(p.interval, null);
  });
}

test('Garmin: calentamiento de 10 min, UN paso de 12 min sin objetivo de pulso y vuelta a la calma de 5', () => {
  const app = loadApp(); app.state.profile = prof();
  const p = JSON.parse(JSON.stringify(app.watchDayPayload(TEST_DAY, '2026-11-25')));
  const steps = buildGarminWorkout(p, ZONES, {}).segments[0].steps;
  assert.equal(steps.length, 3);
  assert.deepEqual([steps[0].intensity, steps[0].durationValue], ['WARMUP', 600]);
  assert.deepEqual([steps[1].intensity, steps[1].durationType, steps[1].durationValue, steps[1].targetType], ['ACTIVE', 'TIME', 720, 'OPEN']);
  assert.deepEqual([steps[2].intensity, steps[2].durationValue], ['COOLDOWN', 300]);
});

test('COROS: calentamiento de 10 min, UN paso de 12 min sin objetivo de pulso y vuelta a la calma de 5', () => {
  const app = loadApp(); app.state.profile = prof();
  const p = JSON.parse(JSON.stringify(app.watchDayPayload(TEST_DAY, '2026-11-25')));
  const sec = buildCorosCourse(p, ZONES, {}).sections;
  assert.equal(sec.length, 3);
  assert.equal(sec[1].sectionType, 2);
  assert.equal(sec[1].targetValue, 720);
  assert.equal(sec[1].intensityType, undefined, 'sin objetivo de pulso en el paso del test');
});

test('buildWatchPlanDays incluye el día del test (futuro, sin hacer)', () => {
  const app = loadApp(); app.state.profile = prof(); app.state.onboarded = true;
  const monday = app.getMondayISO(new Date());
  app.state.weekStart = monday;
  app.state.plan = [0, 1, 2, 3, 4, 5, 6].map((i) => (i === 6 ? Object.assign({}, TEST_DAY, { day: 'sun' }) : { day: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][i], typeKey: 'rest', dist: 0 }));
  const days = app.buildWatchPlanDays();
  assert.ok(days.some((x) => x.typeKey === 'test'), JSON.stringify(days.map((x) => x.typeKey)));
});
