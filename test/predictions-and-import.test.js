// test/predictions-and-import.test.js
//
// Marcas estimadas (Riegel) y calibración del plan con el historial importado de relojes/apps.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

function run(daysAgo, km, minutes, extra) {
  const date = new Date(Date.now() - daysAgo * 864e5).toISOString();
  return Object.assign({ id: 'r' + daysAgo + '_' + km, date, distanceKm: km, durationSec: Math.round(minutes * 60) }, extra || {});
}

function baseProfile(app, overrides) {
  return Object.assign({
    name: 'Corredor', weeklyKm: 12, currentWeeklyKm: 10, weeklyGoalKm: 0, goal: '10k', runnerType: 'new',
    trainingDays: ['tue', 'thu', 'sun'], terrain: 'asfalto', units: 'metric', trainBy: 'distance',
    birth: null, weight: null, height: null, hrKnown: false, hrMax: 190, hrZones: app.computeZones(190),
    createdAt: new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10),
  }, overrides || {});
}

test('marcas estimadas: Riegel desde una carrera de 10K en 50:00 da ~1:50 en la media', () => {
  const app = loadApp();
  app.state.runs = [run(5, 10, 50)];
  const p = app.computeRacePredictions();
  const half = p.find(x => x.key === 'half');
  // 50 min * (21.0975/10)^1.06 ≈ 110.3 min
  assert.ok(Math.abs(half.sec / 60 - 110.3) < 0.5, 'media ≈ 1:50 (' + (half.sec / 60).toFixed(1) + ' min)');
  const five = p.find(x => x.key === '5k');
  assert.ok(five.sec / 60 < 25 && five.sec / 60 > 23, '5K ≈ 24:00');
});

test('marcas estimadas: no proyecta más de ~4 veces la distancia de la carrera de origen', () => {
  const app = loadApp();
  app.state.runs = [run(3, 5.5, 31)];
  const p = app.computeRacePredictions();
  assert.ok(p.find(x => x.key === '10k').sec, '10K sí (menos de 2x)');
  assert.ok(p.find(x => x.key === 'half').sec, 'media sí (menos de 4.2x)');
  assert.equal(p.find(x => x.key === 'marathon').sec, null, 'maratón no se proyecta desde 5K');
  assert.ok(p.find(x => x.key === 'marathon').needKm >= 10, 'pide una carrera de ~10 km o más');
});

test('marcas estimadas: ignora carreras viejas, cortas, caminatas y GPS imposible', () => {
  const app = loadApp();
  app.state.runs = [
    run(120, 10, 50),          // más de 90 días
    run(2, 2, 10),             // menos de 3 km
    run(2, 8, 130),            // caminata (16 min/km)
    run(2, 10, 20),            // 2:00/km: imposible
  ];
  const p = app.computeRacePredictions();
  p.forEach(x => assert.equal(x.sec, null, x.key + ' no debe tener marca'));
});

test('marcas estimadas: toma la mejor proyección entre varias carreras', () => {
  const app = loadApp();
  app.state.runs = [run(20, 10, 60), run(4, 10, 48)];
  const ten = app.computeRacePredictions().find(x => x.key === '10k');
  assert.equal(Math.round(ten.sec / 60), 48);
});

test('historial importado: solo cuentan carreras de relojes/apps de los últimos 28 días', () => {
  const app = loadApp();
  app.state.runs = [
    run(3, 8, 45, { source: 'strava' }),
    run(10, 12, 65, { source: 'polar' }),
    run(40, 20, 110, { source: 'strava' }),   // fuera de los 28 días
    run(2, 5, 30),                              // sin fuente (carrera propia): no cuenta
  ];
  const s = app.getImportedHistoryStats();
  assert.equal(s.count, 2);
  assert.equal(Math.round(s.totalKm), 20);
  assert.equal(s.weeklyKm, 5);
});

test('historial importado: se ofrece con 2+ carreras y no si ya se ajustó o se descartó', () => {
  const app = loadApp();
  app.state.profile = baseProfile(app);
  app.state.runs = [run(3, 8, 45, { source: 'strava' })];
  assert.equal(app.shouldOfferHistoryCalibration(), false, 'una sola carrera no alcanza');
  app.state.runs.push(run(8, 10, 55, { source: 'strava' }));
  assert.equal(app.shouldOfferHistoryCalibration(), true);
  app.state.profile.historyCalibrated = 'dismissed';
  assert.equal(app.shouldOfferHistoryCalibration(), false);
});

test('historial importado: ajustar el plan sube el volumen base y regenera la semana', () => {
  const app = loadApp();
  app.state.profile = baseProfile(app, { currentWeeklyKm: 5, runnerType: 'new' });
  app.state.profile.weeklyKm = app.calcWeeklyKm(app.state.profile);
  app.state.weekNumber = 1;
  app.state.plan = app.generatePlan(app.state.profile, 1);
  app.state.nextWeekOverrides = {};
  app.state.chat = [];
  // 4 semanas de ~28 km: 28 km/sem de promedio
  app.state.runs = [run(2, 10, 55, { source: 'strava' }), run(9, 12, 65, { source: 'strava' }), run(16, 10, 54, { source: 'polar' }), run(23, 12, 66, { source: 'strava' }), run(26, 68 / 4, 90, { source: 'wahoo' })];
  const before = app.state.profile.weeklyKm;
  app.applyHistoryCalibration();
  assert.equal(app.state.profile.historyCalibrated, 'done');
  assert.equal(app.state.profile.runnerType, 'active', 'con 3+ carreras y 8+ km/sem pasa a corredor activo');
  assert.ok(app.state.profile.currentWeeklyKm > 5);
  assert.ok(app.state.profile.weeklyKm > before, 'el volumen del plan sube');
  assert.equal(app.state.chat.length, 1, 'Zonda avisa en el chat');
  assert.equal(app.shouldOfferHistoryCalibration(), false);
});

test('historial importado: no se ofrece a cuentas de más de 60 días', () => {
  const app = loadApp();
  const old = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  app.state.profile = baseProfile(app, { createdAt: old });
  app.state.runs = [run(3, 8, 45, { source: 'strava' }), run(8, 10, 55, { source: 'strava' })];
  assert.equal(app.shouldOfferHistoryCalibration(), false);
  app.state.profile.createdAt = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
  assert.equal(app.shouldOfferHistoryCalibration(), true);
});

test('historial importado: una cuenta sin createdAt (anterior a ese dato) se considera antigua y no se le ofrece', () => {
  const app = loadApp();
  app.state.profile = baseProfile(app, { createdAt: undefined });
  app.state.runs = [run(3, 8, 45, { source: 'strava' }), run(8, 10, 55, { source: 'strava' })];
  assert.equal(app.shouldOfferHistoryCalibration(), false);
});
