// test/stats-and-achievements.test.js
//
// Pruebas de funciones puras de estadísticas/progreso que hasta ahora no tenían
// ningún test: clasificación de zonas (classifyHR/classifyPaceRelative), el
// indicador de carga aguda:crónica (calcTrainingLoad, el mismo que se muestra
// en Inicio y se le pasa al coach), récords personales y la proyección de
// tiempo de carrera con la fórmula de Riegel (predictRaceTime), y los logros
// (getAchievementSections). Todas dependen solo de `state` y el reloj real --
// nada de pantalla -- así que son baratas de cubrir y las que más rápido
// detectan una regresión de cálculo en algo que el corredor ve como un
// consejo de salud/entrenamiento, no solo un número decorativo.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

function daysAgoISO(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

test('classifyHR: clasifica por los límites de cada zona (190 de FC máx)', () => {
  const app = loadApp();
  app.state.profile = { hrZones: app.computeZones(190) };
  // zonas para 190: 1=95-114, 2=115-133, 3=134-152, 4=153-171, 5=172-190
  assert.equal(app.classifyHR(114), 1);
  assert.equal(app.classifyHR(115), 2);
  assert.equal(app.classifyHR(133), 2);
  assert.equal(app.classifyHR(134), 3);
  assert.equal(app.classifyHR(152), 3);
  assert.equal(app.classifyHR(153), 4);
  assert.equal(app.classifyHR(171), 4);
  assert.equal(app.classifyHR(172), 5);
  assert.equal(app.classifyHR(220), 5); // por encima de la FC máx configurada: sigue siendo zona 5, no explota
});

test('classifyHR: sin zonas configuradas devuelve zona 2 por defecto en vez de romper', () => {
  const app = loadApp();
  app.state.profile = {};
  assert.equal(app.classifyHR(150), 2);
});

test('classifyPaceRelative: clasifica el ritmo de un tramo contra el promedio de esa carrera', () => {
  const app = loadApp();
  // avgPaceMin = 6 min/km
  assert.equal(app.classifyPaceRelative(7.5, 6), 1);  // 25% más lento -> zona 1 (muy por debajo del promedio)
  assert.equal(app.classifyPaceRelative(6.5, 6), 2);  // ~8% más lento
  assert.equal(app.classifyPaceRelative(6, 6), 3);    // en el promedio
  assert.equal(app.classifyPaceRelative(5.5, 6), 4);  // ~8% más rápido
  assert.equal(app.classifyPaceRelative(4.5, 6), 5);  // 25% más rápido -> zona 5
});

test('classifyPaceRelative: sin promedio (carrera sin splits) devuelve zona 3 sin romper', () => {
  const app = loadApp();
  assert.equal(app.classifyPaceRelative(6, 0), 3);
  assert.equal(app.classifyPaceRelative(6, null), 3);
});

test('calcTrainingLoad: sin carreras o sin fecha de inicio de plan devuelve null', () => {
  const app = loadApp();
  app.state.runs = [];
  app.state.weekStart = daysAgoISO(20).slice(0, 10);
  assert.equal(app.calcTrainingLoad(), null); // sin carreras

  app.state.runs = [{ date: daysAgoISO(3), distanceKm: 8 }];
  app.state.weekStart = null;
  app.state.planHistory = [];
  assert.equal(app.calcTrainingLoad(), null); // sin fecha de inicio de plan
});

test('calcTrainingLoad: plan con menos de 2 semanas de vida todavía no compara', () => {
  const app = loadApp();
  app.state.weekStart = daysAgoISO(10).slice(0, 10); // hace 10 días, menos de los 14 que pide la función
  app.state.runs = [{ date: daysAgoISO(2), distanceKm: 8 }];
  assert.equal(app.calcTrainingLoad(), null);
});

test('calcTrainingLoad: carga óptima cuando la semana actual va en línea con el promedio reciente', () => {
  const app = loadApp();
  app.state.weekStart = daysAgoISO(28).slice(0, 10);
  // 10km/semana constante en las últimas 4 semanas -> acuteKm=10, chronicWeeklyAvg=10, ratio=1 (óptimo)
  app.state.runs = [1, 8, 15, 22].map(d => ({ date: daysAgoISO(d), distanceKm: 10 }));
  const load = app.calcTrainingLoad();
  assert.ok(load, 'debería devolver un resultado con 4 semanas de historial parejo');
  assert.equal(load.level, 'optimal');
  assert.ok(Math.abs(load.ratio - 1) < 0.01, `ratio esperado ~1, dio ${load.ratio}`);
});

test('calcTrainingLoad: sube de golpe el volumen de esta semana da nivel de riesgo', () => {
  const app = loadApp();
  app.state.weekStart = daysAgoISO(28).slice(0, 10);
  // 3 semanas tranquilas de 5km, y esta semana un salto a 20km -> ratio alto
  app.state.runs = [
    { date: daysAgoISO(2), distanceKm: 20 },
    { date: daysAgoISO(10), distanceKm: 5 },
    { date: daysAgoISO(17), distanceKm: 5 },
    { date: daysAgoISO(24), distanceKm: 5 },
  ];
  const load = app.calcTrainingLoad();
  assert.ok(load);
  assert.equal(load.level, 'risk');
  assert.ok(load.ratio > 1.5, `ratio esperado > 1.5, dio ${load.ratio}`);
});

test('calcTrainingLoad: bajó mucho el volumen de esta semana da nivel bajo', () => {
  const app = loadApp();
  app.state.weekStart = daysAgoISO(28).slice(0, 10);
  app.state.runs = [
    { date: daysAgoISO(2), distanceKm: 2 },
    { date: daysAgoISO(10), distanceKm: 15 },
    { date: daysAgoISO(17), distanceKm: 15 },
    { date: daysAgoISO(24), distanceKm: 15 },
  ];
  const load = app.calcTrainingLoad();
  assert.ok(load);
  assert.equal(load.level, 'low');
  assert.ok(load.ratio < 0.8, `ratio esperado < 0.8, dio ${load.ratio}`);
});

test('detectTrainingGapWeeks: sin carreras nunca cargadas y sin referencia devuelve 0', () => {
  const app = loadApp();
  app.state.runs = [];
  assert.equal(app.detectTrainingGapWeeks(), 0);
});

test('detectTrainingGapWeeks: sin carreras pero con una fecha de referencia, cuenta desde ahí', () => {
  const app = loadApp();
  app.state.runs = [];
  const gap = app.detectTrainingGapWeeks(daysAgoISO(21).slice(0, 10));
  assert.equal(gap, 3);
});

test('detectTrainingGapWeeks: con carreras, cuenta desde la más reciente sin importar el orden', () => {
  const app = loadApp();
  app.state.runs = [
    { date: daysAgoISO(30) },
    { date: daysAgoISO(14) }, // la más reciente -- no está última en el array a propósito
    { date: daysAgoISO(45) },
  ];
  assert.equal(app.detectTrainingGapWeeks(), 2);
});

test('getPersonalRecords: se queda con el tiempo más rápido por distancia estándar (dentro de +-6%)', () => {
  const app = loadApp();
  app.state.runs = [
    { id: 'a', distanceKm: 10.2, durationSec: 3000, date: daysAgoISO(10) },
    { id: 'b', distanceKm: 9.9, durationSec: 2800, date: daysAgoISO(5) }, // más rápida, mismo bucket "10k"
    { id: 'c', distanceKm: 21.1, durationSec: 6300, date: daysAgoISO(3) },
    { id: 'd', distanceKm: 3, durationSec: 900, date: daysAgoISO(2) }, // 3km no entra en ningún bucket estándar (+-6% de 5k son 4.7-5.3km)
  ];
  const records = app.getPersonalRecords();
  assert.equal(records['10k'].durationSec, 2800);
  assert.equal(records['10k'].runId, 'b');
  assert.ok(records.half, 'debería reconocer 21.1km como el bucket de media maratón');
  assert.equal(records['5k'], undefined, '3km está fuera de la tolerancia del 6% del bucket de 5k');
});

test('getPersonalRecords: excludeRunId saca esa carrera del cálculo (para saber si ES un récord nuevo)', () => {
  const app = loadApp();
  app.state.runs = [
    { id: 'old', distanceKm: 10, durationSec: 3000, date: daysAgoISO(30) },
    { id: 'new', distanceKm: 10, durationSec: 2700, date: daysAgoISO(1) },
  ];
  const withoutNew = app.getPersonalRecords('new');
  assert.equal(withoutNew['10k'].runId, 'old');
  const withAll = app.getPersonalRecords();
  assert.equal(withAll['10k'].runId, 'new');
});

test('predictRaceTime: sin ninguna marca personal cargada devuelve null', () => {
  const app = loadApp();
  app.state.runs = [];
  assert.equal(app.predictRaceTime(21.0975), null);
});

test('predictRaceTime: proyecta con la fórmula de Riegel a partir de la marca más cercana en distancia', () => {
  const app = loadApp();
  // 10k en 50min (3000s) como única marca; proyectar a 5k debería dar bastante menos de la mitad
  // del tiempo (Riegel predice que se corre más rápido en distancias más cortas).
  app.state.runs = [{ id: 'a', distanceKm: 10, durationSec: 3000, date: daysAgoISO(5) }];
  const pred = app.predictRaceTime(5);
  assert.ok(pred);
  assert.equal(pred.refDistanceKm, 10);
  assert.equal(pred.refDurationSec, 3000);
  const expected = 3000 * Math.pow(5 / 10, 1.06);
  assert.ok(Math.abs(pred.predictedSec - expected) < 0.01);
  assert.ok(pred.predictedSec < 1500, 'proyectar a la mitad de distancia debería dar bastante menos de la mitad del tiempo');
});

test('predictRaceTime: con varias marcas, usa la más cercana en distancia (en escala logarítmica) como referencia', () => {
  const app = loadApp();
  app.state.runs = [
    { id: 'a', distanceKm: 5, durationSec: 1200, date: daysAgoISO(20) },
    { id: 'b', distanceKm: 42.195, durationSec: 14400, date: daysAgoISO(10) },
  ];
  // Proyectar a 10k: 5k está mucho más cerca (en escala log) que la maratón -> debería usar la de 5k.
  const pred = app.predictRaceTime(10);
  assert.equal(pred.refDistanceKm, 5);
});

test('getAchievementSections: cuenta bien lo desbloqueado en cada categoría', () => {
  const app = loadApp();
  app.state.profile = { units: 'metric' };
  // 60km totales -> desbloquea el hito de 50km pero no el de 100km
  app.state.runs = [
    { id: '1', distanceKm: 30, durationSec: 10800, date: daysAgoISO(10) },
    { id: '2', distanceKm: 30, durationSec: 10800, date: daysAgoISO(3) },
  ];
  app.state.bestStreakWeeks = 3;
  app.state.streakWeeks = 1;
  const sections = app.getAchievementSections();

  assert.equal(sections.distanceBadges[0].achieved, true);  // 50km
  assert.equal(sections.distanceBadges[1].achieved, false); // 100km
  assert.equal(sections.runBadges[0].achieved, false);      // hito de 10 carreras, solo hay 2
  assert.equal(sections.streakBadges[0].achieved, true);    // hito de 2 semanas -- usa el mejor entre bestStreakWeeks y streakWeeks
  assert.equal(sections.streakBadges[1].achieved, false);   // hito de 4 semanas
  assert.ok(sections.totalCount > 0);
  assert.ok(sections.unlockedCount >= 1 && sections.unlockedCount < sections.totalCount);
});

test('getAchievementSections: sin ninguna carrera, nada está desbloqueado', () => {
  const app = loadApp();
  app.state.profile = { units: 'metric' };
  app.state.runs = [];
  app.state.bestStreakWeeks = 0;
  app.state.streakWeeks = 0;
  const sections = app.getAchievementSections();
  assert.equal(sections.unlockedCount, 0);
});
