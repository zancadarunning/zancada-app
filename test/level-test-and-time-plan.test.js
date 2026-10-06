// test/level-test-and-time-plan.test.js
//
// Plan por tiempo propio (buildTimePlanDays) y test de nivel de 12 minutos (Cooper): que el modo "por tiempo"
// arme sesiones en minutos con estructuras distintas a las del modo distancia, que los principiantes tengan
// trote/caminata que progresa, que el test se ponga como primera sesión hasta que se cargue el resultado, y que
// los ritmos que salen del test sean coherentes.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

function baseProfile(overrides) {
  return Object.assign({
    weeklyKm: 30, currentWeeklyKm: 30, weeklyGoalKm: 0, goal: '10k', runnerType: 'active',
    trainingDays: ['tue', 'wed', 'fri', 'sun'], terrain: 'asfalto', units: 'metric', trainBy: 'distance',
    birth: null, weight: null, height: null,
  }, overrides || {});
}
function newbie(overrides) {
  return baseProfile(Object.assign({ runnerType: 'new', currentWeeklyKm: 0, weeklyKm: 8, trainingDays: ['tue', 'thu', 'sun'] }, overrides || {}));
}
function setup(app, profile) {
  app.state.profile = profile; app.state.event = null; app.state.lastEventDate = null; app.state.runs = []; app.state.plan = [];
  return profile;
}

test('plan por tiempo: sesiones en minutos (durMin) y estructuras propias; el de distancia no las tiene', () => {
  const app = loadApp();
  const time = app.generatePlan(setup(app, baseProfile({ trainBy: 'time' })), 3, '2026-09-07');
  time.filter(d => d.dist > 0).forEach(d => {
    assert.ok(d.durMin >= 15 && d.durMin % 5 === 0 || d.interval, `${d.typeKey} debería tener durMin`);
    assert.equal(d.timeBased, true);
  });
  const hills = time.find(d => d.typeKey === 'hills');
  if (hills) { assert.ok(hills.interval.repSec > 0 && hills.interval.recSec > hills.interval.repSec, 'la bajada dura más que la subida'); }
  const dist = app.generatePlan(setup(app, baseProfile({ trainBy: 'distance' })), 3, '2026-09-07');
  dist.filter(d => d.dist > 0).forEach(d => { assert.equal(d.durMin, undefined); assert.equal(d.timeBased, undefined); });
});

test('plan por tiempo: tempo es un bloque continuo con tope y la tirada larga va en minutos', () => {
  const app = loadApp();
  const plan = app.generatePlan(setup(app, baseProfile({ trainBy: 'time' })), 3, '2026-09-07');
  const tempo = plan.find(d => d.typeKey === 'tempo');
  if (tempo) {
    assert.ok(tempo.durMin <= 35);
    assert.match(app.planLabel(tempo).desc, /35 min|\d+ min seguidos/);
  }
  const long = plan.find(d => d.typeKey === 'long');
  assert.ok(long.durMin >= 30 && long.durMin <= 150);
  assert.match(app.planAmountText(long), /min$/);
});

test('principiante por tiempo: trote/caminata que sube un escalón por semana y pasa a continuo', () => {
  const app = loadApp();
  const p = setup(app, newbie({ trainBy: 'time' }));
  const w1 = app.generatePlan(p, 1, '2026-09-07').find(d => d.typeKey === 'easy');
  assert.deepEqual(Object.assign({}, w1.runWalk), { reps: 7, runSec: 60, walkSec: 120 });
  assert.equal(w1.durMin, 21);
  assert.match(app.planLabel(w1).desc, /Alterná 7 veces: 1 min de trote suave y 2 min de caminata/);
  const w3 = app.generatePlan(p, 3, '2026-09-07').find(d => d.typeKey === 'easy');
  assert.equal(w3.runWalk.runSec, 180);
  // semana de descarga (4): repite el escalón anterior
  const w4 = app.generatePlan(p, 4, '2026-09-07').find(d => d.typeKey === 'easy');
  assert.equal(w4.runWalk.runSec, 180);
  const w10 = app.generatePlan(p, 10, '2026-09-07').find(d => d.typeKey === 'easy');
  assert.equal(w10.runWalk, undefined);
  assert.ok(w10.durMin >= 20);
});

test('principiante que en el test corrió seguido (continuousOk) no hace trote/caminata', () => {
  const app = loadApp();
  const p = setup(app, newbie({ trainBy: 'time', levelTest: { required: true, done: true, continuousOk: true, paces: { easy: [6.3, 7.2], tempo: [5.4, 5.6], interval: [5, 5.2] } } }));
  const easy = app.generatePlan(p, 1, '2026-09-07').find(d => d.typeKey === 'easy');
  assert.equal(easy.runWalk, undefined);
});

test('test de nivel: se ubica una sola vez, desde hoy, mientras no se cargue el resultado', () => {
  const app = loadApp();
  const p = setup(app, baseProfile({ trainBy: 'distance', trainingDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], levelTest: { required: true, done: false } }));
  const monday = app.getMondayISO(new Date());
  const plan = app.generatePlan(p, 1, monday);
  const tests = plan.filter(d => d.typeKey === 'test');
  assert.equal(tests.length, 1);
  const todayIdx = (new Date().getDay() + 6) % 7;
  assert.ok(plan.indexOf(tests[0]) >= todayIdx, 'no puede caer en un día que ya pasó');
  assert.equal(tests[0].durMin, 12);
  assert.equal(app.planAmountText(tests[0]), '12 min');
  assert.match(app.planLabel(tests[0]).desc, /12 minutos/);
  // hecho el test: ya no se pone
  p.levelTest = { required: true, done: true };
  assert.equal(app.generatePlan(p, 1, monday).filter(d => d.typeKey === 'test').length, 0);
  // cuentas existentes (sin levelTest.required) no reciben el test obligatorio
  p.levelTest = undefined;
  assert.equal(app.generatePlan(p, 1, monday).filter(d => d.typeKey === 'test').length, 0);
});

test('evaluateLevelTest: más distancia en 12 minutos = ritmos más rápidos y rangos ordenados', () => {
  const app = loadApp();
  const slow = app.evaluateLevelTest(1600), mid = app.evaluateLevelTest(2400), fast = app.evaluateLevelTest(3200);
  assert.ok(slow.vdot < mid.vdot && mid.vdot < fast.vdot);
  [slow, mid, fast].forEach(r => {
    assert.ok(r.paces.easy[0] < r.paces.easy[1], 'suave: rápido < lento');
    assert.ok(r.paces.interval[0] < r.paces.tempo[0] && r.paces.tempo[0] < r.paces.easy[0], 'series < tempo < suave');
  });
  assert.ok(fast.paces.easy[0] < mid.paces.easy[0] && mid.paces.easy[0] < slow.paces.easy[0]);
  // 2400 m en 12 min = 5:00/km de ritmo medio: el tempo tiene que ser más lento que eso y las series cerca
  assert.ok(mid.paces.interval[0] > 4.5 && mid.paces.interval[1] < 5.5);
  assert.equal(slow.continuousOk, false);
  assert.equal(mid.continuousOk, true);
});

test('con test hecho, las sesiones muestran ritmo orientativo y el ritmo base sale del test', () => {
  const app = loadApp();
  const p = setup(app, baseProfile({ trainBy: 'distance' }));
  p.levelTest = Object.assign({ required: true, done: true, date: '2026-10-01' }, app.evaluateLevelTest(2400));
  const easy = app.generatePlan(p, 2, '2026-09-07').find(d => d.typeKey === 'easy');
  assert.match(app.planLabel(easy).desc, /Ritmo orientativo: \d+:\d\d–\d+:\d\d \/km/);
  const [fast, slow] = p.levelTest.paces.easy;
  assert.equal(app.estimateBasePaceMinPerKm(p), Math.round((fast + slow) / 2 * 100) / 100);
});

test('applyLevelTestResult: marca el test como hecho, guarda ritmos y rehace el plan sin otro test', () => {
  const app = loadApp();
  const p = setup(app, baseProfile({ trainBy: 'time', trainingDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], levelTest: { required: true, done: false } }));
  // sin pantalla de verdad: se anulan los renders y el guardado, lo que se prueba es la lógica
  ['renderAll', 'renderHistory', 'renderZones', 'renderChat', 'persist', 'showToast'].forEach(fn => { app[fn] = () => {}; });
  app.state.chat = [];
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.weekNumber = 1;
  app.state.plan = app.generatePlan(p, 1, app.state.weekStart);
  assert.equal(app.state.plan.filter(d => d.typeKey === 'test').length, 1);
  assert.equal(app.levelTestPending(p), true);
  app.applyLevelTestResult(2400, 182);
  assert.equal(app.levelTestPending(app.state.profile), false);
  assert.equal(app.state.profile.levelTest.done, true);
  assert.equal(app.state.profile.levelTest.distanceM, 2400);
  assert.ok(app.state.profile.levelTest.paces.easy[0] > 0);
  assert.equal(app.state.profile.hrMax >= 182, true);
  // el test pendiente deja de aparecer (el de hoy, si ya era de hoy hacia atrás, queda como hecho)
  assert.ok(app.state.plan.filter(d => d.typeKey === 'test' && !d.status).length === 0);
  assert.ok(app.state.chat.length === 1 && /2\.40 km/.test(app.state.chat[0].text));
});

function appWithPlan(profileOverrides) {
  const app = loadApp();
  ['renderAll', 'renderHistory', 'renderZones', 'renderChat', 'persist', 'showToast'].forEach(fn => { app[fn] = () => {}; });
  const p = setup(app, baseProfile(Object.assign({ trainBy: 'time', trainingDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }, profileOverrides || {})));
  app.state.chat = []; app.state.onboarded = true;
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.weekNumber = 3;
  app.state.nextWeekOverrides = {};
  app.state.plan = app.generatePlan(p, 3, app.state.weekStart);
  return app;
}

test('agendar el test un día de esta semana: reemplaza la sesión y sobrevive a rehacer el plan', () => {
  const app = appWithPlan();
  const todayIdx = (new Date().getDay() + 6) % 7;
  const before = app.state.plan[todayIdx];
  assert.ok(before.dist > 0 && before.typeKey !== 'test');
  app.scheduleLevelTestOn('cur', todayIdx);
  assert.equal(app.state.plan[todayIdx].typeKey, 'test');
  assert.equal(app.state.plan[todayIdx].userTest, true);
  // rehacer el plan (cambiar de modo, guardar el perfil...) no lo pisa
  app.state.plan = app.preserveLivedDays(app.state.plan, app.generatePlan(app.state.profile, 3));
  assert.equal(app.state.plan[todayIdx].typeKey, 'test');
  // y no se agrega otro test automático
  assert.equal(app.state.plan.filter(d => d.typeKey === 'test').length, 1);
});

test('agendar el test la semana que viene: queda como override, aparece en esa semana y es uno solo', () => {
  const app = appWithPlan();
  app.scheduleLevelTestOn('next', 3); // jueves de la semana que viene
  assert.equal(app.state.nextWeekOverrides.thu.userTest, true);
  const nw = app.getNextWeekPlan();
  assert.equal(nw.plan[3].typeKey, 'test');
  assert.equal(nw.plan[3].custom, false);
  assert.equal(nw.plan.filter(d => d.typeKey === 'test').length, 1);
  // si después lo agenda esta semana, el de la semana que viene se saca
  const todayIdx = (new Date().getDay() + 6) % 7;
  app.scheduleLevelTestOn('cur', todayIdx);
  assert.equal(Object.keys(app.state.nextWeekOverrides).filter(k => app.state.nextWeekOverrides[k].userTest).length, 0);
  assert.equal(app.getNextWeekPlan().plan.filter(d => d.typeKey === 'test').length, 0);
});

test('con el test obligatorio pendiente, uno agendado a mano evita que se ponga otro automático', () => {
  const app = appWithPlan({ levelTest: { required: true, done: false } });
  app.scheduleLevelTestOn('next', 4);
  assert.equal(app.state.plan.filter(d => d.typeKey === 'test').length, 0);
  assert.equal(app.getNextWeekPlan().plan.filter(d => d.typeKey === 'test').length, 1);
});

test('autoReadLevelTest: la carrera de ~12 min vinculada a la sesión del test se lee sola', () => {
  const app = appWithPlan({ levelTest: { required: true, done: false } });
  const todayIdx = (new Date().getDay() + 6) % 7;
  app.scheduleLevelTestOn('cur', todayIdx);
  app.state.runs = [{ id: 77, date: new Date().toISOString(), distanceKm: 2.4, durationSec: 720, hrLog: [], points: [], maxHr: 178 }];
  app.state.plan[todayIdx].status = 'done';
  app.state.plan[todayIdx].linkedRunId = 77;
  app.autoReadLevelTest();
  const lt = app.state.profile.levelTest;
  assert.equal(lt.done, true);
  assert.equal(lt.distanceM, 2400);
  assert.equal(lt.maxHr, 178);
  assert.equal(app.state.plan[todayIdx].testRead, true);
  // no se vuelve a leer
  lt.distanceM = 1;
  app.autoReadLevelTest();
  assert.equal(app.state.profile.levelTest.distanceM, 1);
});

test('autoReadLevelTest: una carrera de otra duración no se usa como test; sin carrera todavía, espera', () => {
  const app = appWithPlan({ levelTest: { required: true, done: false } });
  const todayIdx = (new Date().getDay() + 6) % 7;
  app.scheduleLevelTestOn('cur', todayIdx);
  app.state.plan[todayIdx].status = 'done';
  app.state.plan[todayIdx].linkedRunId = 88;
  app.autoReadLevelTest(); // la carrera todavía no está en state.runs
  assert.equal(app.state.plan[todayIdx].testRead, undefined);
  app.state.runs = [{ id: 88, date: new Date().toISOString(), distanceKm: 5, durationSec: 1800 }];
  app.autoReadLevelTest();
  assert.equal(app.state.profile.levelTest.done, false);
  assert.equal(app.state.plan[todayIdx].testRead, true);
});

test('autoReadLevelTest: una carrera de 12:30 se escala a 12:00', () => {
  const app = appWithPlan({ levelTest: { required: true, done: false } });
  const todayIdx = (new Date().getDay() + 6) % 7;
  app.scheduleLevelTestOn('cur', todayIdx);
  app.state.runs = [{ id: 99, date: new Date().toISOString(), distanceKm: 2.5, durationSec: 750 }];
  app.state.plan[todayIdx].status = 'done';
  app.state.plan[todayIdx].linkedRunId = 99;
  app.autoReadLevelTest();
  assert.equal(app.state.profile.levelTest.distanceM, 2400); // 2500 m * 720/750
});
