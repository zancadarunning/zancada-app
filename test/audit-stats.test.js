// test/audit-stats.test.js
//
// Estadísticas de carreras: marcas por distancia, análisis de parciales y predicciones. Bugs hallados en la auditoría de octubre 2026.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

test('nearestPRBucket: una carrera más corta que la distancia estándar no cuenta como esa marca (4,7 km no es un 5K)', () => {
  const app = loadApp();
  assert.equal(app.nearestPRBucket(4.7), null);
  assert.equal(app.nearestPRBucket(4.95).key, '5k', 'hasta 1,5% menos se tolera por el error del GPS');
  assert.equal(app.nearestPRBucket(5.2).key, '5k');
  assert.equal(app.nearestPRBucket(10.3).key, '10k');
  assert.equal(app.nearestPRBucket(9.5), null);
});

test('analyzeSplitPacing: ignora el último tramo suelto y los parciales con GPS roto', () => {
  const app = loadApp();
  // 4 km parejos + un tramo final de 0,3 km a ritmo lento: no es una desaceleración real
  const splits = [
    { km: 1, paceMin: 5 }, { km: 2, paceMin: 5 }, { km: 3, paceMin: 5 }, { km: 4, paceMin: 5 }, { km: 0.3, paceMin: 9 },
  ];
  assert.equal(app.analyzeSplitPacing(splits).kind, 'even');
  // un parcial con ritmo imposible (GPS roto) tampoco cuenta
  const broken = [{ km: 1, paceMin: 5 }, { km: 2, paceMin: 5 }, { km: 3, paceMin: 45 }, { km: 4, paceMin: 5 }];
  assert.equal(app.analyzeSplitPacing(broken), null, 'quedan menos de 4 parciales válidos');
});

test('computeRacePredictions: needKm nunca baja de 3 km (el mínimo real que usa la predicción)', () => {
  const app = loadApp();
  app.state.runs = [];
  const need = Object.fromEntries(app.computeRacePredictions().map(p => [p.key, p.needKm]));
  assert.equal(need['5k'], 3);
  assert.ok(need['marathon'] >= 11);
});

test('getWeekData: la semana pasada se busca por fecha de inicio, no por número (el número se reinicia y se repite en el historial)', () => {
  const app = loadApp();
  const monday = app.getMondayISO(new Date());
  app.state.weekStart = monday;
  app.state.weekNumber = 1; // se reinició
  const lastMonday = app.addDaysToIsoLocal(monday, -7);
  const oldMonday = app.addDaysToIsoLocal(monday, -70);
  app.state.planHistory = [
    { weekNumber: 0, weekStart: oldMonday, plan: [{ day: 'mon', typeKey: 'easy', dist: 99 }] },
    { weekNumber: 0, weekStart: lastMonday, plan: [{ day: 'mon', typeKey: 'easy', dist: 7 }] },
  ];
  const w = app.getWeekData(-1);
  assert.equal(w.exists, true);
  assert.equal(w.plan[0].dist, 7, 'toma la de la semana pasada real, no la primera con el mismo número');
  assert.equal(app.getWeekData(-2).exists, false, 'una semana sin entrada no inventa otra');
});

test('htmlEntitiesToText: el calendario del teléfono recibe texto plano ("Rock & Run", no "Rock &amp; Run")', () => {
  const app = loadApp();
  assert.equal(app.htmlEntitiesToText('Rock &amp; Run &lt;10K&gt; &quot;hoy&quot; l&#39;ora'), 'Rock & Run <10K> "hoy" l\'ora');
  assert.equal(app.htmlEntitiesToText(null), '');
});
