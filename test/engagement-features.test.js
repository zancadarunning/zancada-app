// test/engagement-features.test.js
//
// Lógica pura de las funciones nuevas de octubre 2026: test de nivel salteado, sesiones salteadas,
// aviso de subida brusca de carga, guía de ritmo en vivo (sin pulsaciones, solo GPS), récord
// anticipado en el resumen de carrera, zapatilla preseleccionada y mover sesiones del plan.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function mkPlan(overrides) {
  return DAYS.map((day, i) => Object.assign({ day, typeKey: 'rest', dist: 0, terrain: null, zone: null }, (overrides && overrides[i]) || {}));
}
function isoDaysAgo(n) { return new Date(Date.now() - n * 864e5).toISOString(); }
function todayIdx() { return (new Date().getDay() + 6) % 7; }

test('test de nivel salteado: devuelve la fecha del test que pasó sin hacerse', () => {
  const app = loadApp();
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.plan = mkPlan({ 0: { typeKey: 'test', dist: 2, status: 'skipped' } });
  assert.equal(app.missedLevelTestIso(), app.state.weekStart);
});

test('test de nivel salteado: no avisa si ya hay otro test agendado', () => {
  const app = loadApp();
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.plan = mkPlan({ 0: { typeKey: 'test', dist: 2, status: 'skipped' }, 5: { typeKey: 'test', dist: 2 } });
  assert.equal(app.missedLevelTestIso(), null);
  app.state.plan = mkPlan({ 0: { typeKey: 'test', dist: 2, status: 'skipped' } });
  app.state.nextWeekOverrides = { thu: { userTest: true } };
  assert.equal(app.missedLevelTestIso(), null);
});

test('sesiones salteadas: cuenta solo las que tenían distancia y no eran el test', () => {
  const app = loadApp();
  app.state.plan = mkPlan({
    0: { typeKey: 'easy', dist: 5, status: 'skipped' },
    1: { typeKey: 'rest', dist: 0, status: 'skipped' },
    2: { typeKey: 'test', dist: 2, status: 'skipped' },
    3: { typeKey: 'long', dist: 8, status: 'skipped' },
    4: { typeKey: 'easy', dist: 5, status: 'done' },
  });
  assert.equal(app.skippedSessionCount(), 2);
});

test('subida de carga: avisa si lo corrido + lo planeado supera 30% a la semana anterior', () => {
  const app = loadApp();
  app.state.weekStart = app.getMondayISO(new Date());
  // semana anterior: 20 km en 2 carreras (hace 8 y 9 días siempre cae en la semana previa)
  const mondayThis = new Date(app.state.weekStart + 'T12:00:00');
  const prev1 = new Date(mondayThis.getTime() - 3 * 864e5).toISOString();
  const prev2 = new Date(mondayThis.getTime() - 5 * 864e5).toISOString();
  app.state.runs = [
    { id: 'a', date: prev1, distanceKm: 10, durationSec: 3600 },
    { id: 'b', date: prev2, distanceKm: 10, durationSec: 3600 },
  ];
  const t0 = todayIdx();
  const plan = mkPlan({});
  plan[t0] = { day: DAYS[t0], typeKey: 'long', dist: 30, terrain: 'asfalto', zone: 2 };
  app.state.plan = plan;
  const sp = app.weeklyLoadSpike();
  assert.ok(sp, 'debería detectar la subida');
  assert.equal(sp.pct, 50);
  plan[t0].dist = 22; // +10%: no avisa
  assert.equal(app.weeklyLoadSpike(), null);
});

test('subida de carga: sin una semana anterior de 8 km o más no avisa', () => {
  const app = loadApp();
  app.state.weekStart = app.getMondayISO(new Date());
  const mondayThis = new Date(app.state.weekStart + 'T12:00:00');
  app.state.runs = [{ id: 'a', date: new Date(mondayThis.getTime() - 3 * 864e5).toISOString(), distanceKm: 4, durationSec: 1800 }];
  const t0 = todayIdx();
  const plan = mkPlan({});
  plan[t0] = { day: DAYS[t0], typeKey: 'long', dist: 30 };
  app.state.plan = plan;
  assert.equal(app.weeklyLoadSpike(), null);
});

// Puntos de GPS sintéticos: avanzan hacia el norte a velocidad constante (metros/segundo).
function pointsAt(mps, seconds, startT) {
  const pts = [];
  const degPerM = 1 / 111320;
  for (let i = 0; i <= seconds; i++) pts.push({ lat: -34.6 + i * mps * degPerM, lon: -58.4, t: (startT || 0) + i, alt: null });
  return pts;
}
function lvTest(app) {
  app.state.profile = { levelTest: { required: true, done: true, paces: { easy: [6.5, 7.5], tempo: [5.5, 6.0], interval: [4.8, 5.2] } } };
}

test('guía de ritmo en vivo: rodaje suave rápido => "fast", dentro del rango => "ok" (solo por GPS)', () => {
  const app = loadApp();
  lvTest(app);
  const tr = app.getTracker();
  tr.workout = { phase: 'continuous', structure: { typeKey: 'continuous', planTypeKey: 'easy' } };
  tr.points = pointsAt(4.4, 120);           // ~3:47 /km
  assert.equal(app.livePaceStatus().status, 'fast');
  tr.points = pointsAt(2.38, 120);          // ~7:00 /km
  assert.equal(app.livePaceStatus().status, 'ok');
  tr.points = pointsAt(1.3, 120);           // ~12:50 /km
  assert.equal(app.livePaceStatus().status, 'slow');
});

test('guía de ritmo en vivo: tempo usa el ritmo de tempo y las series solo en la fase de esfuerzo', () => {
  const app = loadApp();
  lvTest(app);
  const tr = app.getTracker();
  tr.workout = { phase: 'continuous', structure: { typeKey: 'continuous', planTypeKey: 'tempo' } };
  tr.points = pointsAt(2.38, 120);          // 7:00 /km: lento para tempo
  assert.equal(app.livePaceStatus().kind, 'tempo');
  assert.equal(app.livePaceStatus().status, 'slow');
  tr.workout = { phase: 'recovery', structure: { typeKey: 'intervals' } };
  assert.equal(app.livePaceStatus(), null, 'en la recuperación de series no hay objetivo');
  tr.workout = { phase: 'effort', structure: { typeKey: 'intervals' } };
  tr.points = pointsAt(3.4, 60);            // ~4:54 /km dentro del rango de series
  assert.equal(app.livePaceStatus().kind, 'interval');
  assert.equal(app.livePaceStatus().status, 'ok');
});

test('guía de ritmo en vivo: sin test usa el promedio de tus últimas carreras (suave y tempo, no series)', () => {
  const app = loadApp();
  app.state.profile = {};
  app.state.runs = [1, 2, 3, 4].map(i => ({ id: 'r' + i, date: isoDaysAgo(i), distanceKm: 5, durationSec: 5 * 6 * 60 })); // 6:00 /km
  const ranges = app.livePaceRanges();
  assert.ok(ranges && ranges.easy && ranges.tempo);
  assert.equal(ranges.interval, null);
  assert.ok(ranges.easy[0] < 6 && ranges.easy[1] > 6, 'el suave rodea tu promedio');
  assert.ok(ranges.tempo[1] < 6, 'el tempo es más rápido que tu promedio');
  app.state.runs = app.state.runs.slice(0, 2);
  assert.equal(app.livePaceRanges(), null, 'con menos de 3 carreras no inventa un objetivo');
});

test('alerta de ritmo: avisa una vez y respeta la espera; en suave no avisa si vas lento', () => {
  const app = loadApp();
  lvTest(app);
  const said = [];
  app.speak = (txt) => said.push(txt);
  app.haptic = () => {};
  const tr = app.getTracker();
  tr.workout = { phase: 'continuous', structure: { typeKey: 'continuous', planTypeKey: 'easy' } };
  tr.points = pointsAt(4.4, 120, 200);
  tr.elapsedSec = 320;
  app.maybePaceAlert();
  assert.equal(said.length, 1);
  app.maybePaceAlert();
  assert.equal(said.length, 1, 'la espera de 150 s evita repetirlo');
  tr.lastPaceAlertSec = undefined;
  tr.points = pointsAt(1.3, 120, 200);
  app.maybePaceAlert();
  assert.equal(said.length, 1, 'ir lento en un rodaje suave no se avisa');
});

test('resumen de carrera: anticipa si la carrera sin guardar sería récord personal', () => {
  const app = loadApp();
  app.state.runs = [{ id: 'x', date: isoDaysAgo(10), distanceKm: 5, durationSec: 2280 }];
  const tr = app.getTracker();
  tr.distanceKm = 5.05; tr.elapsedSec = 2100;
  const pr = app.runSummaryPR();
  assert.ok(pr && pr.key === '5k' && pr.prev && pr.prev.durationSec === 2280);
  tr.elapsedSec = 2400;
  assert.equal(app.runSummaryPR(), null, 'más lento que el récord: no es PR');
  tr.distanceKm = 5.5; tr.elapsedSec = 100;
  assert.equal(app.runSummaryPR(), null, '5,5 km queda fuera del 6% de una distancia estándar');
});

test('zapatilla: viene preseleccionada la última que usaste', () => {
  const app = loadApp();
  app.state.shoes = [{ id: 1, name: 'Vomero', km: 0 }, { id: 2, name: 'Pegasus', km: 0 }];
  app.state.runs = [
    { id: 'a', date: isoDaysAgo(9), distanceKm: 5, durationSec: 1800, shoeId: 1 },
    { id: 'b', date: isoDaysAgo(2), distanceKm: 5, durationSec: 1800, shoeId: 2 },
  ];
  assert.match(app.shoeOptionsHtml(), /value="2" selected/);
  app.state.shoes = [];
  assert.match(app.shoeOptionsHtml(), /value=""/);
});

test('mover sesión: intercambia los días y rechaza un día que ya pasó o ya se hizo', () => {
  const app = loadApp();
  app.state.profile = { terrain: 'asfalto', trainingDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], hrMax: 190, hrZones: app.computeZones(190) };
  app.state.weekStart = app.getMondayISO(new Date());
  const t0 = todayIdx();
  if (t0 >= 5) return; // necesita dos días libres por delante dentro de la misma semana
  const plan = mkPlan({});
  plan[t0 + 1] = { day: DAYS[t0 + 1], typeKey: 'easy', dist: 5, terrain: 'asfalto', zone: 2 };
  plan[t0 + 2] = { day: DAYS[t0 + 2], typeKey: 'rest', dist: 0 };
  app.state.plan = plan;
  const ok = app.applyMoveSession({ dia_origen: DAYS[t0 + 1], dia_destino: DAYS[t0 + 2] });
  assert.match(ok, /^OK/);
  assert.equal(app.state.plan[t0 + 2].dist, 5);
  assert.equal(app.state.plan[t0 + 1].dist, 0);
  app.state.plan[t0 + 2].status = 'done';
  const bad = app.applyMoveSession({ dia_origen: DAYS[t0 + 2], dia_destino: DAYS[t0 + 1] });
  assert.doesNotMatch(bad, /^OK/);
});

test('plan de carrera: los parciales suman exactamente el tiempo objetivo y salen más lentos al inicio', () => {
  const app = loadApp();
  for (const km of [5, 10, 21.0975, 42.195]) {
    const sp = app.buildRaceSplits(km, 3000);
    assert.equal(Math.round(sp[sp.length - 1].cumSec), 3000, 'total = objetivo para ' + km + ' km');
    assert.ok(sp[0].paceMin > sp[Math.floor(sp.length / 2)].paceMin, 'el primer km es más lento que el del medio');
    assert.ok(sp[sp.length - 1].paceMin < sp[Math.floor(sp.length / 2)].paceMin, 'el final es más rápido que el medio');
  }
  assert.equal(app.buildRaceSplits(10, 3000).length, 10);
  assert.equal(app.buildRaceSplits(21.0975, 6000).length, 22, 'la media termina con un tramo parcial');
});

test('plan de carrera: estima con tu mejor esfuerzo reciente o, si no hay, con tu mejor marca', () => {
  const app = loadApp();
  app.state.runs = [{ id: 'a', date: isoDaysAgo(10), distanceKm: 5, durationSec: 1500 }];
  const e = app.estimateRaceTime(10);
  assert.equal(e.source, 'runs');
  assert.ok(Math.abs(e.sec / 60 - 25 * Math.pow(2, 1.06)) < 0.1);
  app.state.runs = [{ id: 'b', date: isoDaysAgo(200), distanceKm: 10, durationSec: 3000 }];
  const e2 = app.estimateRaceTime(10);
  assert.equal(e2 && e2.source, 'pr');
  app.state.runs = [];
  app.state.profile = {};
  assert.equal(app.estimateRaceTime(10), null);
});

test('forma física: el VDOT de un 5K en 20:00 es ~49.8 y el índice sube cuando corrés más rápido', () => {
  const app = loadApp();
  assert.ok(Math.abs(app.vdotFromEffort(5000, 20) - 49.8) < 0.2);
  assert.ok(app.vdotFromEffort(5000, 25) < app.vdotFromEffort(5000, 22));
  // una carrera por semana, cada vez más rápida
  app.state.profile = {};
  app.state.runs = [0, 1, 2, 3].map(i => ({ id: 'r' + i, date: isoDaysAgo(7 * (3 - i) + 1), distanceKm: 5, durationSec: (30 - i) * 60 }));
  const weeks = app.computeFitnessTrend(12).filter(w => w.v !== null);
  assert.equal(weeks.length, 4);
  assert.ok(weeks[3].v > weeks[0].v);
  app.state.runs = [{ id: 'x', date: isoDaysAgo(2), distanceKm: 1.5, durationSec: 480 }];
  assert.equal(app.computeFitnessTrend(12).filter(w => w.v !== null).length, 0, 'una carrera de menos de 3 km no cuenta');
});

test('clima: traduce los códigos de Open-Meteo', () => {
  const app = loadApp();
  assert.equal(app.wxKind(0).k, 'clear');
  assert.equal(app.wxKind(2).k, 'partly');
  assert.equal(app.wxKind(3).k, 'cloudy');
  assert.equal(app.wxKind(63).k, 'rain');
  assert.equal(app.wxKind(81).k, 'rain');
  assert.equal(app.wxKind(73).k, 'snow');
  assert.equal(app.wxKind(95).k, 'storm');
});
