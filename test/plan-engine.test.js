// test/plan-engine.test.js
//
// Pruebas del motor de generación de planes: generatePlan y las piezas de las
// que depende (distributeSessionTypes, buildIntervalStructure/buildHillStructure,
// las semanas de recuperación/taper, el día de carrera, planLabel/planAmountText).
//
// Cada test carga una instancia nueva de la app (loadApp()) en vez de compartir
// una sola entre todos los tests -- generatePlan lee bastante de `state`
// (state.profile, state.event, state.runs, etc.) y ese aislamiento evita que el
// orden en que corren los tests afecte el resultado.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

function baseProfile(overrides) {
  return Object.assign({
    weeklyKm: 30,
    weeklyGoalKm: 0,
    goal: '10k',
    runnerType: 'active',
    trainingDays: ['tue', 'wed', 'fri', 'sun'],
    terrain: 'asfalto',
    units: 'metric',
    trainBy: 'distance',
    birth: null,
    weight: null,
    height: null,
  }, overrides || {});
}

test('generatePlan: descansa en los días fuera de trainingDays y entrena en los que sí', () => {
  const app = loadApp();
  const profile = baseProfile();
  app.state.profile = profile;
  app.state.event = null;
  app.state.lastEventDate = null;
  const plan = app.generatePlan(profile, 1, '2026-09-07');
  assert.equal(plan.length, 7);
  assert.deepEqual(plan.map(d => d.day), app.DAY_KEYS);
  const trainingSet = new Set(profile.trainingDays);
  plan.forEach(d => {
    if (!trainingSet.has(d.day)) {
      assert.equal(d.typeKey, 'rest');
      assert.equal(d.dist, 0);
    } else {
      assert.ok(d.dist > 0, `${d.day} debería tener distancia asignada`);
    }
  });
});

test('generatePlan: el día "largo" que eligió distributeSessionTypes siempre sale como long', () => {
  const app = loadApp();
  const profile = baseProfile();
  app.state.profile = profile;
  app.state.event = null;
  const weekStartDate = '2026-09-07';
  const plan = app.generatePlan(profile, 1, weekStartDate);
  const caution = app.trainingCaution(profile);
  const sessions = app.distributeSessionTypes(profile.trainingDays, false, 1, caution, app.isCutbackWeek(1), profile.goal);
  const longDay = Object.keys(sessions).find(d => sessions[d] === 'long');
  const planDay = plan.find(d => d.day === longDay);
  assert.equal(planDay.typeKey, 'long');
});

test('generatePlan: coincide día a día con distributeSessionTypes en una semana normal', () => {
  const app = loadApp();
  const profile = baseProfile();
  app.state.profile = profile;
  app.state.event = null;
  app.state.lastEventDate = null;
  const weekNumber = 3;
  const weekStartDate = '2026-09-21'; // sin evento cargado, sin recuperación
  const plan = app.generatePlan(profile, weekNumber, weekStartDate);
  const caution = app.trainingCaution(profile);
  const sessions = app.distributeSessionTypes(profile.trainingDays, false, weekNumber, caution, app.isCutbackWeek(weekNumber), profile.goal);
  plan.forEach(d => {
    const expected = sessions[d.day] || 'rest';
    assert.equal(d.typeKey, expected, `día ${d.day}`);
  });
});

test('generatePlan: principiante entrena easy todos los días salvo el largo', () => {
  const app = loadApp();
  const profile = baseProfile({ weeklyKm: 0, goal: 'start', runnerType: 'new', trainingDays: ['tue', 'thu', 'sun'] });
  app.state.profile = profile;
  const plan = app.generatePlan(profile, 1, '2026-09-07');
  const byDay = Object.fromEntries(plan.map(d => [d.day, d]));
  assert.equal(byDay.sun.typeKey, 'long'); // domingo es el preferido para el día largo
  assert.equal(byDay.tue.typeKey, 'easy');
  assert.equal(byDay.thu.typeKey, 'easy');
  ['mon', 'wed', 'fri', 'sat'].forEach(d => assert.equal(byDay[d].typeKey, 'rest'));
});

test('generatePlan: en semana de recuperación no sobrevive ninguna sesión pesada', () => {
  const app = loadApp();
  const profile = baseProfile();
  app.state.profile = profile;
  app.state.event = null;
  app.state.lastEventDate = '2026-09-06'; // domingo
  const weekStartDate = '2026-09-07'; // lunes siguiente
  assert.ok(app.isRecoveryWeek(weekStartDate), 'el fixture debería detectarse como semana de recuperación');
  const plan = app.generatePlan(profile, 5, weekStartDate);
  const heavyTypes = ['intervals', 'tempo', 'fartlek', 'hills', 'progression', 'long'];
  plan.forEach(d => {
    assert.ok(!heavyTypes.includes(d.typeKey), `${d.day} no debería ser ${d.typeKey} en semana de recuperación`);
  });
});

test('generatePlan: el día de una carrera cargada en Próximos eventos queda como descanso especial', () => {
  const app = loadApp();
  const profile = baseProfile();
  app.state.profile = profile;
  const weekStartDate = '2026-09-07'; // lunes
  app.state.event = { date: '2026-09-11', name: 'Carrera de prueba', type: 'ruta' }; // viernes de esa semana
  const plan = app.generatePlan(profile, 2, weekStartDate);
  const raceDayPlan = plan.find(d => d.day === 'fri');
  assert.equal(raceDayPlan.typeKey, 'rest');
  assert.equal(raceDayPlan.dist, 0);
  assert.equal(raceDayPlan.raceDay, true);
});

test('generatePlan: cerca de una carrera de trail, el rodaje largo se corre en ese terreno', () => {
  const app = loadApp();
  const profile = baseProfile({ terrain: 'asfalto' });
  app.state.profile = profile;
  const weekStartDate = '2026-09-07';
  app.state.event = { date: '2026-09-27', name: 'Trail de prueba', type: 'trail' }; // ~3 semanas después
  const plan = app.generatePlan(profile, 2, weekStartDate);
  const longDay = plan.find(d => d.typeKey === 'long');
  assert.equal(longDay.terrain, 'trail');
});

test('generatePlan: una meta semanal propia mueve el volumen pero dentro de un rango acotado', () => {
  const app = loadApp();
  const profile = baseProfile({ weeklyKm: 20, weeklyGoalKm: 100 }); // meta desproporcionada a propósito
  app.state.profile = profile;
  const planConMeta = app.generatePlan(profile, 1, '2026-09-07');
  const profileSinMeta = baseProfile({ weeklyKm: 20, weeklyGoalKm: 0 });
  app.state.profile = profileSinMeta;
  const planSinMeta = app.generatePlan(profileSinMeta, 1, '2026-09-07');
  const totalCon = planConMeta.reduce((a, d) => a + d.dist, 0);
  const totalSin = planSinMeta.reduce((a, d) => a + d.dist, 0);
  assert.ok(totalCon > totalSin, 'la meta más alta debería subir el volumen semanal');
  // pero acotado: no debería multiplicarse como si realmente pidiera 100km/semana
  assert.ok(totalCon < totalSin * 1.5, 'el aumento debería estar acotado, no libre');
});

test('buildIntervalStructure: reps entre 4 y el máximo, y el total ronda la distancia pedida', () => {
  const app = loadApp();
  const { reps, repMeters, recoveryMin } = app.buildIntervalStructure(8, { level: 0 }, 1);
  assert.ok(reps >= 4 && reps <= 12);
  assert.ok(repMeters > 0 && recoveryMin > 0);
  const totalKm = (reps * repMeters) / 1000;
  assert.ok(Math.abs(totalKm - 8) <= 2, `total ${totalKm}km debería estar cerca de 8km`);
});

test('buildIntervalStructure: más cautela reduce el máximo de repeticiones', () => {
  const app = loadApp();
  const relaxed = app.buildIntervalStructure(15, { level: 0 }, 1);
  const cautious = app.buildIntervalStructure(15, { level: 2 }, 1);
  assert.ok(cautious.reps <= relaxed.reps);
  assert.ok(cautious.reps <= 8);
});

test('buildHillStructure: reps entre 4 y el máximo según cautela', () => {
  const app = loadApp();
  const { reps, repMeters } = app.buildHillStructure(6, { level: 1 });
  assert.ok(reps >= 4 && reps <= 7);
  assert.ok(repMeters > 0);
});

test('planAmountText: modo distancia vs. modo tiempo muestran unidades distintas', () => {
  const app = loadApp();
  const profileDist = baseProfile({ trainBy: 'distance' });
  app.state.profile = profileDist;
  const day = { typeKey: 'easy', dist: 8, zone: 2, beginner: false };
  const amountDist = app.planAmountText(day);
  assert.match(amountDist, /km$/);

  app.state.profile = Object.assign({}, profileDist, { trainBy: 'time' });
  const amountTime = app.planAmountText(day);
  assert.match(amountTime, /min$/);
  assert.notEqual(amountDist, amountTime);
});

test('planAmountText: un día de descanso no muestra cantidad', () => {
  const app = loadApp();
  app.state.profile = baseProfile();
  assert.equal(app.planAmountText({ typeKey: 'rest', dist: 0 }), '');
});

test('planLabel: la sesión de series en modo tiempo describe minutos, no metros', () => {
  const app = loadApp();
  const profile = baseProfile({ trainBy: 'time' });
  app.state.profile = profile;
  const day = { typeKey: 'intervals', dist: 8, zone: 4, beginner: false, interval: { reps: 8, repMeters: 400, recoveryMin: 2 } };
  const label = app.planLabel(day);
  assert.ok(!/400/.test(label.desc), 'en modo tiempo no debería mencionar los metros de cada repetición');
});

test('estimateBasePaceMinPerKm: usa el ritmo real de las corridas recientes cuando hay al menos 3', () => {
  const app = loadApp();
  const profile = baseProfile();
  app.state.profile = profile;
  app.state.runs = [
    { distanceKm: 5, durationSec: 5 * 6 * 60 }, // 6 min/km
    { distanceKm: 5, durationSec: 5 * 6 * 60 },
    { distanceKm: 5, durationSec: 5 * 6 * 60 },
  ];
  const pace = app.estimateBasePaceMinPerKm(profile);
  assert.ok(Math.abs(pace - 6) < 0.01);
});

test('estimateBasePaceMinPerKm: sin corridas ni PRs, usa el default según si es principiante', () => {
  const app = loadApp();
  app.state.runs = [];
  const beginner = baseProfile({ weeklyKm: 0, goal: 'start', runnerType: 'new' });
  const advanced = baseProfile();
  assert.equal(app.estimateBasePaceMinPerKm(beginner), 7.5);
  assert.equal(app.estimateBasePaceMinPerKm(advanced), 6.2);
});
