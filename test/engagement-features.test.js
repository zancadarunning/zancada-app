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

test('forma física: con pocas semanas de datos muestra una tarjeta explicativa (no desaparece)', () => {
  const app = loadApp();
  app.state.profile = {};
  app.state.runs = [];
  assert.equal(app.renderFitnessCard(), '', 'sin ninguna carrera no hay tarjeta (ya está el estado vacío del historial)');
  app.state.runs = [{ id: 'a', date: isoDaysAgo(3), distanceKm: 5, durationSec: 1700 }];
  const html = app.renderFitnessCard();
  assert.match(html, /Forma física/);
  assert.match(html, /3 semanas/);
});

test('cadencia: el promedio de la carrera solo existe con suficientes muestras (≥ 10)', () => {
  const app = loadApp();
  const tr = app.getTracker();
  tr.cadSum = 0; tr.cadN = 0;
  assert.equal(app.runAvgCadence(), null);
  tr.cadSum = 170 * 9; tr.cadN = 9;
  assert.equal(app.runAvgCadence(), null, '9 muestras (27 s) no alcanzan');
  tr.cadSum = 170 * 10 + 10; tr.cadN = 11;
  assert.equal(app.runAvgCadence(), Math.round((170 * 10 + 10) / 11));
});

test('cadencia baja: avisa una vez cuando cae más de 10% bajo el promedio y respeta la espera de 5 minutos', () => {
  const app = loadApp();
  const said = [];
  app.speak = (txt) => said.push(txt);
  app.haptic = () => {};
  const tr = app.getTracker();
  tr.running = true; tr.autoPaused = false; tr.workout = null; tr.elapsedSec = 900;
  tr.cadSum = 170 * 40; tr.cadN = 40; tr.cadRecent = [];
  app.checkCadenceDrop(170); app.checkCadenceDrop(170); app.checkCadenceDrop(170);
  assert.equal(said.length, 0, 'cadencia normal: sin aviso');
  tr.cadRecent = [];
  app.checkCadenceDrop(148); app.checkCadenceDrop(148); app.checkCadenceDrop(148);
  assert.equal(said.length, 1, 'cayó ~13%: avisa');
  tr.cadRecent = [];
  app.checkCadenceDrop(148); app.checkCadenceDrop(148); app.checkCadenceDrop(148);
  assert.equal(said.length, 1, 'no repite antes de 5 minutos');
  tr.elapsedSec += 301; tr.cadRecent = [];
  app.checkCadenceDrop(148); app.checkCadenceDrop(148); app.checkCadenceDrop(148);
  assert.equal(said.length, 2);
});

test('cadencia baja: en series (fase de esfuerzo) y con poca referencia no avisa', () => {
  const app = loadApp();
  const said = [];
  app.speak = (txt) => said.push(txt);
  app.haptic = () => {};
  const tr = app.getTracker();
  tr.running = true; tr.autoPaused = false; tr.elapsedSec = 900;
  tr.cadSum = 170 * 40; tr.cadN = 40; tr.cadRecent = [];
  tr.workout = { phase: 'effort', structure: { typeKey: 'intervals' } };
  for (let i = 0; i < 3; i++) app.checkCadenceDrop(140);
  assert.equal(said.length, 0, 'en series la cadencia cambia a propósito');
  tr.workout = null; tr.cadN = 10; tr.cadSum = 1700; tr.cadRecent = [];
  for (let i = 0; i < 3; i++) app.checkCadenceDrop(140);
  assert.equal(said.length, 0, 'con menos de ~90 s de referencia no avisa');
});

test('plan de regreso: se ofrece tras 2+ semanas sin correr y arma un plan más suave una sola vez', () => {
  const app = loadApp();
  const weeklyKm = 30;
  app.state.onboarded = true;
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.profile = {
    name: 'Corredor', weeklyKm, currentWeeklyKm: weeklyKm, goal: '10k', runnerType: 'active', trainingDays: ['tue', 'thu', 'sun'],
    terrain: 'asfalto', units: 'metric', trainBy: 'distance', hrKnown: false, hrMax: 190, hrZones: app.computeZones(190),
    createdAt: '2025-01-01',
  };
  // 6 semanas corriendo ~30 km por semana, y la última carrera hace 4 semanas
  app.state.runs = [];
  for (let w = 0; w < 6; w++) for (let k = 0; k < 3; k++) app.state.runs.push({ id: 'r' + w + k, date: isoDaysAgo(28 + w * 7 + k * 2 + 1), distanceKm: 10, durationSec: 3600 });
  const info = app.returnCardInfo();
  assert.ok(info && info.weeks >= 4, 'ofrece el plan de regreso');
  assert.ok(Math.abs(info.prev - 30) < 1);
  app.state.plan = mkPlan({});
  app.state.chat = [];
  app.applyReturnPlan();
  assert.equal(app.state.profile.returningFromBreak, true);
  assert.ok(app.state.profile.weeklyKm < weeklyKm, 'el volumen baja');
  assert.equal(app.returnCardInfo(), null, 'ya no se vuelve a ofrecer');
  assert.ok(app.state.chat.length >= 1);
});

test('plan de regreso: no se ofrece con una pausa corta o con poco historial', () => {
  const app = loadApp();
  app.state.onboarded = true;
  app.state.profile = { name: 'x', weeklyKm: 20, createdAt: '2025-01-01' };
  app.state.runs = [{ id: 'a', date: isoDaysAgo(3), distanceKm: 10, durationSec: 3600 }, { id: 'b', date: isoDaysAgo(6), distanceKm: 10, durationSec: 3600 }, { id: 'c', date: isoDaysAgo(9), distanceKm: 10, durationSec: 3600 }];
  assert.equal(app.returnCardInfo(), null, 'corrió hace 3 días');
  app.state.runs = [{ id: 'a', date: isoDaysAgo(40), distanceKm: 10, durationSec: 3600 }];
  assert.equal(app.returnCardInfo(), null, 'menos de 3 carreras');
});

function sessionTracker(app, dist, totalKm, mode) {
  const tr = app.getTracker();
  tr.running = true; tr.autoPaused = false; tr.elapsedSec = 600; tr.distanceKm = dist; tr.ms = undefined;
  tr.workout = { phase: 'continuous', structure: { typeKey: 'continuous', planTypeKey: 'easy', targetDist: totalKm, targetDurMin: undefined } };
  app.state.profile = { trainBy: mode || 'distance', units: 'metric' };
  return tr;
}

test('hitos de la sesión: avisa mitad, último kilómetro y sesión completa, cada uno una vez', () => {
  const app = loadApp();
  const said = [];
  app.speak = (txt) => said.push(txt);
  app.haptic = () => {};
  const tr = sessionTracker(app, 0.5, 8);
  app.maybeAnnounceMilestones();
  assert.equal(said.length, 0, 'al inicio no dice nada');
  tr.distanceKm = 4.1; app.maybeAnnounceMilestones();
  assert.equal(said.length, 1); assert.match(said[0], /Mitad/);
  tr.distanceKm = 4.4; app.maybeAnnounceMilestones();
  assert.equal(said.length, 1, 'la mitad no se repite');
  tr.distanceKm = 7.1; app.maybeAnnounceMilestones();
  assert.equal(said.length, 2); assert.match(said[1], /Último kilómetro/);
  tr.distanceKm = 8.05; app.maybeAnnounceMilestones();
  assert.equal(said.length, 3); assert.match(said[2], /Completaste/);
  tr.distanceKm = 8.5; app.maybeAnnounceMilestones();
  assert.equal(said.length, 3);
});

test('hitos de la sesión: una carrera retomada pasada la mitad no repite lo que ya pasó, y sesiones cortas no anuncian la mitad', () => {
  const app = loadApp();
  const said = [];
  app.speak = (txt) => said.push(txt);
  app.haptic = () => {};
  sessionTracker(app, 5, 8);
  app.maybeAnnounceMilestones();
  assert.equal(said.length, 0, 'ya pasó la mitad al retomar: no la anuncia');
  const app2 = loadApp();
  const said2 = [];
  app2.speak = (txt) => said2.push(txt); app2.haptic = () => {};
  const tr2 = sessionTracker(app2, 0.2, 1.5);
  app2.maybeAnnounceMilestones(); tr2.distanceKm = 0.9; app2.maybeAnnounceMilestones();
  assert.equal(said2.length, 0, 'una sesión de 1,5 km es muy corta para anunciar hitos');
});

test('constancia de ritmo: variación entre parciales y cambio de la segunda mitad', () => {
  const app = loadApp();
  const mk = (paces) => paces.map((p, i) => ({ km: String(i + 1), paceMin: p }));
  const neg = app.pacingStats(mk([6.2, 6.1, 6.0, 5.8, 5.7, 5.6]));
  assert.ok(neg.diffPct < -3, 'segunda mitad más rápida');
  const even = app.pacingStats(mk([6.0, 6.02, 5.98, 6.01, 6.0, 5.99]));
  assert.ok(Math.abs(even.diffPct) < 0.5 && even.cv < 0.5);
  const fade = app.pacingStats(mk([5.5, 5.6, 5.8, 6.0, 6.2, 6.4]));
  assert.ok(fade.diffPct > 3 && fade.cv > 4);
  assert.equal(app.pacingStats(mk([6, 6])), null, 'con menos de 3 parciales no hay datos');
  const partial = app.pacingStats([...mk([6, 6, 6, 6, 6]), { km: '5.4', paceMin: 9 }]);
  assert.ok(partial.cv < 0.1, 'el último tramo suelto (5,4) no cuenta');
  assert.match(app.pacingDetailText(mk([6.2, 6.1, 6.0, 5.8, 5.7, 5.6])), /Variación entre parciales: \d/);
});
