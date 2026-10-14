// test/plan-phases.test.js
//
// Pruebas del plan por fases. El primer test es una "foto dorada" del comportamiento
// actual (v4) de generatePlan: para un conjunto de perfiles que quedan FUERA del alcance
// del plan por fases, la salida tiene que seguir siendo idéntica a la que quedó guardada en
// test/support/plan-golden-v4.json. Los tests posteriores se agregan debajo de este.
//
// Los casos tienen que ser deterministas: generatePlan y sus ayudantes leen la fecha actual
// (new Date()) en varios lados (applyLevelTestDay, etc.), así que cada corrida congela el
// reloj del sandbox en una fecha fija. Ningún perfil usa levelTest.required, para que el
// resultado no dependa del test de nivel pendiente.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const GOLDEN_PATH = path.join(__dirname, 'support', 'plan-golden-v4.json');

// Dos relojes congelados distintos: el resultado tiene que ser el mismo con cualquiera.
const FROZEN_NOWS = ['2026-03-04T12:00:00', '2027-01-20T09:30:00'];

function baseProfile(overrides) {
  return Object.assign({
    weeklyKm: 30,
    // Un corredor "active" de verdad SIEMPRE tiene currentWeeklyKm seteado -- calcWeeklyKm()
    // deriva weeklyKm A PARTIR de este campo para ese runnerType, nunca al revés (ver
    // isBeginnerProfile() en app.js). Sin este campo, este fixture representaba un perfil
    // que no podría existir en la app real (activo con volumen actual desconocido), y por
    // eso isBeginnerProfile() lo trataba como principiante -- lo cual es justo lo correcto
    // para ese caso real (alguien que dice "ya corro" pero declaró 0km/semana actuales),
    // pero no para este fixture, pensado como corredor activo genuino.
    currentWeeklyKm: 30,
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

// Lunes de la semana 1 de todos los casos; la semana N arranca (N-1)*7 días después.
const WEEK1_MONDAY = '2026-09-07';
function weekStartFor(weekNumber) {
  const d = new Date(WEEK1_MONDAY + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + (weekNumber - 1) * 7);
  return d.toISOString().slice(0, 10);
}

// Casos fuera del alcance del plan por fases: 6 perfiles x semanas 1, 5 y 9.
function goldenCases() {
  const profiles = [
    ['activo-10k-sin-carrera', baseProfile({ goal: '10k' })],
    ['21k-carrera-pasada', baseProfile({ goal: '21k', raceDate: '2026-06-14' })],
    ['principiante-carrera-a-10-semanas', baseProfile({
      runnerType: 'new', weeklyKm: 0, currentWeeklyKm: 0, goal: '10k', raceDate: '2026-11-15',
      trainingDays: ['tue', 'thu', 'sun'],
    })],
    ['por-tiempo', baseProfile({ trainBy: 'time' })],
    ['meta-semanal-40km', baseProfile({ weeklyGoalKm: 40 })],
    ['dos-dias-de-entrenamiento', baseProfile({ trainingDays: ['wed', 'sun'] })],
  ];
  const cases = [];
  profiles.forEach(([base, profile]) => {
    [1, 5, 9].forEach(weekNumber => {
      cases.push({
        name: `${base}-semana-${weekNumber}`,
        profile,
        weekNumber,
        weekStart: weekStartFor(weekNumber),
      });
    });
  });
  return cases;
}

// Reloj congelado: new Date() sin argumentos devuelve siempre `nowIso`; con argumentos se
// comporta como el Date de siempre.
function makeFrozenDate(nowIso) {
  const frozen = new Date(nowIso).getTime();
  class FrozenDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(frozen);
      else super(...args);
    }
    static now() { return frozen; }
  }
  return FrozenDate;
}

// Corre un caso en una instancia nueva de la app con el reloj congelado, y devuelve el plan
// pasado por un viaje JSON (así undefined/funciones no producen diferencias falsas).
function runGoldenCase(c, nowIso) {
  const app = loadApp();
  app.Date = makeFrozenDate(nowIso);
  const profile = JSON.parse(JSON.stringify(c.profile));
  app.state.profile = profile;
  app.state.event = null;
  app.state.lastEventDate = null;
  const plan = app.generatePlan(profile, c.weekNumber, c.weekStart);
  return JSON.parse(JSON.stringify(plan));
}

module.exports = { goldenCases, runGoldenCase, FROZEN_NOWS, GOLDEN_PATH };

test('plan v4: sin cambios para casos fuera de alcance', () => {
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  const cases = goldenCases();
  assert.deepEqual(Object.keys(golden).sort(), cases.map(c => c.name).sort());
  FROZEN_NOWS.forEach(nowIso => {
    cases.forEach(c => {
      assert.deepEqual(runGoldenCase(c, nowIso), golden[c.name], `${c.name} (reloj ${nowIso})`);
    });
  });
});

// ---- phaseSplit: reparto de las semanas útiles entre las fases ----

// Arma el arreglo esperado a partir de pares [fase, cantidad], así los casos de abajo
// se leen igual que la tabla del diseño (ej. base×2, build×3, ...).
function phases(...pairs) {
  const out = [];
  pairs.forEach(([name, n]) => { for (let i = 0; i < n; i++) out.push(name); });
  return out;
}

test('phaseSplit: menos de 4 semanas útiles no alcanza para fases (null)', () => {
  const app = loadApp();
  assert.equal(app.phaseSplit(3), null);
  assert.equal(app.phaseSplit(0), null);
});

test('phaseSplit: reparto exacto para R = 4, 5, 7, 8, 16, 24 y 30', () => {
  const app = loadApp();
  const expected = {
    4: phases(['build', 1], ['specific', 2], ['peak', 1]),
    5: phases(['build', 2], ['specific', 2], ['peak', 1]),
    7: phases(['build', 3], ['specific', 3], ['peak', 1]),
    8: phases(['base', 2], ['build', 3], ['specific', 2], ['peak', 1]),
    16: phases(['base', 4], ['build', 6], ['specific', 4], ['peak', 2]),
    24: phases(['base', 6], ['build', 8], ['specific', 6], ['peak', 4]),
    // R>24: las semanas de más se anteponen como base extendida (6 + 6 = 12 de base)
    30: phases(['base', 12], ['build', 8], ['specific', 6], ['peak', 4]),
  };
  Object.keys(expected).forEach(r => {
    const got = app.phaseSplit(Number(r));
    assert.deepEqual(Array.from(got), expected[r], `R=${r}`);
    assert.equal(got.length, Number(r), `longitud para R=${r}`);
  });
});

test('phaseSplit: para todo R>=4 devuelve R semanas, en orden, con al menos 1 de cada fase presente', () => {
  const app = loadApp();
  const ORDER = ['base', 'build', 'specific', 'peak'];
  for (let r = 4; r <= 60; r++) {
    const got = Array.from(app.phaseSplit(r));
    assert.equal(got.length, r, `longitud para R=${r}`);
    const idx = got.map(n => ORDER.indexOf(n));
    assert.ok(idx.every(i => i >= 0), `R=${r}: nombre de fase desconocido`);
    for (let i = 1; i < idx.length; i++) assert.ok(idx[i] >= idx[i - 1], `R=${r}: las fases tienen que ir en orden`);
    ['build', 'specific', 'peak'].forEach(n => assert.ok(got.includes(n), `R=${r}: falta la fase ${n}`));
    assert.equal(got.includes('base'), r >= 8, `R=${r}: base solo desde 8 semanas`);
    assert.equal(got[got.length - 1], 'peak', `R=${r}: la última semana es de peak`);
  }
});

// ---- cronograma (makePhaseSchedule) y phaseForWeek ----

// Los objetos que devuelve el sandbox tienen prototipos de OTRO contexto: un viaje JSON los
// vuelve comparables con deepEqual estricto.
const plain = v => JSON.parse(JSON.stringify(v));

// Perfil activo con meta y fecha de carrera que coinciden con el cronograma de los tests.
function racingProfile(overrides) {
  return baseProfile(Object.assign({ goal: '21k', raceDate: '2027-03-14' }, overrides || {}));
}
// Ancla 2026-11-02 (lunes); carrera el domingo 2027-03-14 -> lunes de la semana de la
// carrera 2027-03-08, 18 semanas después del ancla -> R = 16.
const SCHEDULE = { anchor: '2026-11-02', raceDate: '2027-03-14', goal: '21k' };

test('makePhaseSchedule: ancla = el lunes siguiente a hoy (estricto, también si hoy es lunes o domingo)', () => {
  const app = loadApp();
  const p = racingProfile();
  // miércoles, lunes y domingo -> todos anclan al lunes 2026-11-02 (salvo el lunes, que va al siguiente)
  assert.deepEqual(plain(app.makePhaseSchedule(p, new Date(2026, 9, 28, 15, 0))), SCHEDULE, 'miércoles');
  assert.deepEqual(plain(app.makePhaseSchedule(p, new Date(2026, 10, 1, 23, 30))), SCHEDULE, 'domingo');
  // lunes -> el lunes de la semana SIGUIENTE, no el mismo día
  assert.equal(app.makePhaseSchedule(p, new Date(2026, 10, 2, 8, 0)).anchor, '2026-11-09', 'lunes');
  assert.equal(app.makePhaseSchedule(p, new Date(2026, 10, 3)).anchor, '2026-11-09', 'martes');
});

test('makePhaseSchedule: el ancla cruza un cambio de horario sin correrse de día', () => {
  const app = loadApp();
  const p = racingProfile({ raceDate: '2027-06-13' });
  // fines de octubre / marzo: cambios de horario en Europa y EE.UU.
  assert.equal(app.makePhaseSchedule(p, new Date(2026, 9, 27, 12)).anchor, '2026-11-02');
  assert.equal(app.makePhaseSchedule(p, new Date(2026, 9, 31, 12)).anchor, '2026-11-02');
  assert.equal(app.makePhaseSchedule(p, new Date(2027, 2, 9, 12)).anchor, '2027-03-15');
  assert.equal(app.makePhaseSchedule(p, new Date(2027, 2, 28, 12)).anchor, '2027-03-29');
});

test('makePhaseSchedule: null si el perfil no califica', () => {
  const app = loadApp();
  const today = new Date(2026, 9, 28);
  assert.equal(app.makePhaseSchedule(racingProfile({ runnerType: 'new', weeklyKm: 0, currentWeeklyKm: 0 }), today), null, 'principiante');
  assert.equal(app.makePhaseSchedule(racingProfile({ goal: 'general' }), today), null, 'meta general');
  assert.equal(app.makePhaseSchedule(racingProfile({ goal: 'start' }), today), null, 'meta start');
  assert.equal(app.makePhaseSchedule(baseProfile({ goal: '21k' }), today), null, 'sin raceDate');
  assert.equal(app.makePhaseSchedule(racingProfile({ raceDate: '' }), today), null, 'raceDate vacío');
  assert.equal(app.makePhaseSchedule(racingProfile({ raceDate: 'no-es-fecha' }), today), null, 'raceDate inválido');
  assert.equal(app.makePhaseSchedule(racingProfile({ raceDate: '2027-02-30' }), today), null, 'raceDate imposible');
  assert.equal(app.makePhaseSchedule(null, today), null, 'sin perfil');
});

test('makePhaseSchedule: cada meta de PHASE_GOALS califica', () => {
  const app = loadApp();
  ['5k', '10k', '15k', '21k', '42k'].forEach(goal => {
    const s = app.makePhaseSchedule(racingProfile({ goal }), new Date(2026, 9, 28));
    assert.deepEqual(plain(s), { anchor: '2026-11-02', raceDate: '2027-03-14', goal });
  });
});

test('phaseForWeek: inactivo sin cronograma o si no coincide con el perfil', () => {
  const app = loadApp();
  const p = racingProfile();
  const off = { active: false };
  assert.deepEqual(plain(app.phaseForWeek(p, '2026-11-02', null)), off);
  assert.deepEqual(plain(app.phaseForWeek(p, '2026-11-02', undefined)), off);
  assert.deepEqual(plain(app.phaseForWeek(p, '2026-11-02', Object.assign({}, SCHEDULE, { raceDate: '2027-03-21' }))), off);
  assert.deepEqual(plain(app.phaseForWeek(p, '2026-11-02', Object.assign({}, SCHEDULE, { goal: '10k' }))), off);
  assert.deepEqual(plain(app.phaseForWeek(p, '2026-11-02', Object.assign({}, SCHEDULE, { anchor: 'basura' }))), off);
  assert.deepEqual(plain(app.phaseForWeek(p, 'basura', SCHEDULE)), off);
  assert.deepEqual(plain(app.phaseForWeek(p, '', SCHEDULE)), off);
});

test('phaseForWeek: semana anterior al ancla -> inactivo', () => {
  const app = loadApp();
  assert.deepEqual(plain(app.phaseForWeek(racingProfile(), '2026-10-26', SCHEDULE)), { active: false });
});

test('phaseForWeek: R < 4 -> inactivo', () => {
  const app = loadApp();
  // ancla 2026-11-02, carrera 2026-12-13 (domingo): lunes de la carrera 2026-12-07 = 5 semanas -> R=3
  const p = racingProfile({ raceDate: '2026-12-13' });
  const s = { anchor: '2026-11-02', raceDate: '2026-12-13', goal: '21k' };
  assert.deepEqual(plain(app.phaseForWeek(p, '2026-11-02', s)), { active: false });
  assert.deepEqual(plain(app.phaseForWeek(p, '2026-12-07', s)), { active: false });
  // con una semana más ya es R=4 y entra
  const p4 = racingProfile({ raceDate: '2026-12-20' });
  const s4 = { anchor: '2026-11-02', raceDate: '2026-12-20', goal: '21k' };
  const w = plain(app.phaseForWeek(p4, '2026-11-02', s4));
  assert.equal(w.active, true);
  assert.equal(w.R, 4);
  assert.equal(w.phase, 'build');
});

test('phaseForWeek: carrera domingo, R=16 -> fases, semanas y contadores', () => {
  const app = loadApp();
  const p = racingProfile();
  const at = week => plain(app.phaseForWeek(p, week, SCHEDULE));
  assert.deepEqual(at('2026-11-02'), { active: true, phase: 'base', weekIdx: 0, R: 16, weeksToRace: 18, weekInPhase: 1, phaseWeeks: 4 });
  assert.deepEqual(at('2026-11-23'), { active: true, phase: 'base', weekIdx: 3, R: 16, weeksToRace: 15, weekInPhase: 4, phaseWeeks: 4 });
  assert.deepEqual(at('2026-11-30'), { active: true, phase: 'build', weekIdx: 4, R: 16, weeksToRace: 14, weekInPhase: 1, phaseWeeks: 6 });
  assert.deepEqual(at('2026-12-28'), { active: true, phase: 'build', weekIdx: 8, R: 16, weeksToRace: 10, weekInPhase: 5, phaseWeeks: 6 });
  assert.deepEqual(at('2027-01-11'), { active: true, phase: 'specific', weekIdx: 10, R: 16, weeksToRace: 8, weekInPhase: 1, phaseWeeks: 4 });
  assert.deepEqual(at('2027-02-01'), { active: true, phase: 'specific', weekIdx: 13, R: 16, weeksToRace: 5, weekInPhase: 4, phaseWeeks: 4 });
  assert.deepEqual(at('2027-02-08'), { active: true, phase: 'peak', weekIdx: 14, R: 16, weeksToRace: 4, weekInPhase: 1, phaseWeeks: 2 });
  assert.deepEqual(at('2027-02-15'), { active: true, phase: 'peak', weekIdx: 15, R: 16, weeksToRace: 3, weekInPhase: 2, phaseWeeks: 2 });
});

test('phaseForWeek: carrera domingo -> las 3 últimas semanas son taper', () => {
  const app = loadApp();
  const p = racingProfile();
  const at = week => plain(app.phaseForWeek(p, week, SCHEDULE));
  assert.deepEqual(at('2027-02-22'), { active: true, phase: 'taper', weekIdx: 16, R: 16, weeksToRace: 2, weekInPhase: 1, phaseWeeks: 3 });
  assert.deepEqual(at('2027-03-01'), { active: true, phase: 'taper', weekIdx: 17, R: 16, weeksToRace: 1, weekInPhase: 2, phaseWeeks: 3 });
  assert.deepEqual(at('2027-03-08'), { active: true, phase: 'taper', weekIdx: 18, R: 16, weeksToRace: 0, weekInPhase: 3, phaseWeeks: 3 });
});

test('phaseForWeek: semana posterior a la carrera (sin peakKm) -> inactivo', () => {
  const app = loadApp();
  assert.deepEqual(plain(app.phaseForWeek(racingProfile(), '2027-03-15', SCHEDULE)), { active: false });
  assert.deepEqual(plain(app.phaseForWeek(racingProfile(), '2027-04-12', SCHEDULE)), { active: false });
});

test('phaseForWeek: carrera un miércoles -> el taper cae igual en las 3 últimas semanas', () => {
  const app = loadApp();
  // miércoles 2027-03-10: misma semana de carrera (lunes 2027-03-08), R=16
  const p = racingProfile({ raceDate: '2027-03-10' });
  const s = { anchor: '2026-11-02', raceDate: '2027-03-10', goal: '21k' };
  const at = week => plain(app.phaseForWeek(p, week, s));
  assert.equal(at('2027-02-15').phase, 'peak');
  assert.equal(at('2027-02-22').phase, 'taper');
  assert.equal(at('2027-03-01').phase, 'taper');
  assert.equal(at('2027-03-08').phase, 'taper');
  assert.equal(at('2027-03-08').R, 16);
  assert.equal(at('2027-03-08').weekInPhase, 3);
});

test('phaseForWeek: las semanas taper son exactamente las que taperMultiplier baja de 1 (carrera cualquier día)', () => {
  const app = loadApp();
  // lunes 2027-03-08 + 0..6 días: carrera lunes, martes, ..., domingo de la misma semana
  for (let d = 0; d < 7; d++) {
    const raceDate = app.addDaysToIsoLocal('2027-03-08', d);
    const p = racingProfile({ raceDate });
    const s = { anchor: '2026-11-02', raceDate, goal: '21k' };
    for (let i = 0; i <= 18; i++) {
      const week = app.addDaysToIsoLocal('2026-11-02', i * 7);
      const ph = plain(app.phaseForWeek(p, week, s));
      assert.equal(ph.active, true, `${raceDate} ${week}`);
      assert.equal(ph.phase === 'taper', app.taperMultiplier(p, week) < 1, `${raceDate} semana ${week} (idx ${i})`);
    }
  }
});

test('phaseForWeek: las fases siguen phaseSplit(R) semana a semana y es pura (no lee state)', () => {
  const app = loadApp();
  const p = racingProfile();
  app.state.profile = null;
  app.state.phaseSchedule = null;
  const expected = Array.from(app.phaseSplit(16)).concat(['taper', 'taper', 'taper']);
  for (let i = 0; i < 19; i++) {
    const week = app.addDaysToIsoLocal('2026-11-02', i * 7);
    const ph = plain(app.phaseForWeek(p, week, SCHEDULE));
    assert.equal(ph.phase, expected[i], `idx ${i}`);
    assert.equal(ph.weekIdx, i);
    assert.equal(ph.weeksToRace, 18 - i);
    const same = expected.filter(n => n === ph.phase).length;
    assert.equal(ph.phaseWeeks, same, `phaseWeeks idx ${i}`);
    assert.equal(ph.weekInPhase, expected.slice(0, i + 1).filter(n => n === ph.phase).length, `weekInPhase idx ${i}`);
  }
});

test('phaseForWeek: cruza el cambio de horario (octubre-marzo) sin correr el índice de semana', () => {
  const app = loadApp();
  // cronograma largo que cubre el fin de DST de otoño y el comienzo de primavera
  const p = racingProfile({ raceDate: '2027-08-08' });
  const s = { anchor: '2026-10-05', raceDate: '2027-08-08', goal: '21k' };
  for (let i = 0; i < 44; i++) {
    const week = app.addDaysToIsoLocal('2026-10-05', i * 7);
    const ph = plain(app.phaseForWeek(p, week, s));
    assert.equal(ph.weekIdx, i, week);
  }
});

// ---- refreshPhaseSchedule ----

// Cronograma esperado de un perfil: `base` + el pico y `limited` que fija el cronograma al crearse
// (volumen de referencia del perfil -> phasePeakKm con los pasos de rampa de su R).
function withPeak(app, p, base) {
  const R = app.phaseScheduleR(base);
  const pk = app.phasePeakKm(p.goal, app.phaseEffectiveWeeklyKm(p, false), app.trainingCaution(p), app.phaseRampSteps(R));
  return Object.assign({}, base, { peakKm: pk.peakKm, limited: pk.limited });
}

// Prepara una app con reloj congelado y persist() espiado (así no toca red ni disco).
function appForRefresh(profile, schedule) {
  const app = loadApp();
  app.Date = makeFrozenDate('2026-10-28T12:00:00'); // miércoles -> ancla 2026-11-02
  app.state.profile = profile;
  if (schedule !== undefined) app.state.phaseSchedule = schedule;
  const calls = { persist: 0 };
  app.persist = () => { calls.persist++; return Promise.resolve(); };
  return { app, calls };
}

test('refreshPhaseSchedule: crea el cronograma si falta y persiste una vez', () => {
  const { app, calls } = appForRefresh(racingProfile(), undefined);
  app.refreshPhaseSchedule();
  assert.deepEqual(plain(app.state.phaseSchedule), withPeak(app, app.state.profile, SCHEDULE));
  assert.equal(app.state.phaseSchedule.peakKm, 54); // 21k, 30 km base: 30 x 1.8 (el tope de 55 de la distancia no llega a usarse)
  assert.equal(app.state.phaseSchedule.limited, true);
  assert.equal(calls.persist, 1);
});

test('refreshPhaseSchedule: si ya coincide no cambia nada ni persiste (el ancla no se mueve)', () => {
  const viejo = { anchor: '2026-09-07', raceDate: '2027-03-14', goal: '21k' };
  const { app, calls } = appForRefresh(racingProfile(), viejo);
  app.refreshPhaseSchedule();
  assert.deepEqual(plain(app.state.phaseSchedule), viejo);
  assert.equal(calls.persist, 0);
});

test('refreshPhaseSchedule: lo reemplaza si cambió la fecha de la carrera o la meta', () => {
  const a = appForRefresh(racingProfile({ raceDate: '2027-04-04' }), SCHEDULE);
  a.app.refreshPhaseSchedule();
  assert.deepEqual(plain(a.app.state.phaseSchedule), withPeak(a.app, a.app.state.profile, { anchor: '2026-11-02', raceDate: '2027-04-04', goal: '21k' }));
  assert.equal(a.calls.persist, 1);

  const b = appForRefresh(racingProfile({ goal: '10k' }), SCHEDULE);
  b.app.refreshPhaseSchedule();
  assert.deepEqual(plain(b.app.state.phaseSchedule), withPeak(b.app, b.app.state.profile, { anchor: '2026-11-02', raceDate: '2027-03-14', goal: '10k' }));
  assert.equal(b.app.state.phaseSchedule.peakKm, 45);
  assert.equal(b.app.state.phaseSchedule.limited, false);
  assert.equal(b.calls.persist, 1);
});

test('refreshPhaseSchedule: lo pone en null si el perfil ya no califica', () => {
  const { app, calls } = appForRefresh(racingProfile({ goal: 'general' }), SCHEDULE);
  app.refreshPhaseSchedule();
  assert.equal(app.state.phaseSchedule, null);
  assert.equal(calls.persist, 1);
});

test('refreshPhaseSchedule: sin cronograma y sin perfil que califique no hace nada', () => {
  const a = appForRefresh(baseProfile({ goal: 'general' }), undefined);
  a.app.refreshPhaseSchedule();
  assert.ok(!a.app.state.phaseSchedule);
  assert.equal(a.calls.persist, 0);
  const b = appForRefresh(null, null);
  b.app.refreshPhaseSchedule();
  assert.equal(b.app.state.phaseSchedule, null);
  assert.equal(b.calls.persist, 0);
});

// ---- growthParams / phasedWeeklyKm: volumen semanal por fases ----

// Arma el `info` activo de phaseForWeek para la semana útil/taper número `i` de un plan de R
// semanas útiles, sin pasar por fechas (phasedWeeklyKm solo mira phase, weekIdx y R).
function infoAt(app, R, i) {
  const split = app.phaseSplit(R);
  const phase = i < R ? split[i] : 'taper';
  return { active: true, phase, weekIdx: i, R };
}

// Serie completa de km: R semanas útiles + 3 de taper.
function kmSeries(app, p, caution, baseKm, R) {
  const out = [];
  for (let i = 0; i < R + 3; i++) out.push(plain(app.phasedWeeklyKm(p, caution, infoAt(app, R, i), baseKm)));
  return out;
}

test('growthParams: crecimiento y techo por nivel de cautela (los mismos que weekMultiplier)', () => {
  const app = loadApp();
  assert.deepEqual(plain(app.growthParams({ level: 0 })), { growth: 1.06, cap: 1.8 });
  assert.deepEqual(plain(app.growthParams({ level: 1 })), { growth: 1.05, cap: 1.65 });
  assert.deepEqual(plain(app.growthParams({ level: 2 })), { growth: 1.04, cap: 1.5 });
  assert.deepEqual(plain(app.growthParams({ level: 3 })), { growth: 1.04, cap: 1.5 });
  assert.deepEqual(plain(app.growthParams(null)), { growth: 1.06, cap: 1.8 });
  assert.deepEqual(plain(app.growthParams(undefined)), { growth: 1.06, cap: 1.8 });
});

test('weekMultiplier: mismos valores que antes de extraer growthParams', () => {
  const app = loadApp();
  // valores calculados a mano con la fórmula original: 1.06^(n - floor(n/4) - 1), tope 1.8,
  // y x0.75 en las semanas múltiplo de 4 salvo skipCutback
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} vs ${b}`);
  near(app.weekMultiplier(1, { level: 0 }), 1);
  near(app.weekMultiplier(4, { level: 0 }), Math.pow(1.06, 2) * 0.75);
  near(app.weekMultiplier(4, { level: 0 }, true), Math.pow(1.06, 2));
  near(app.weekMultiplier(9, { level: 1 }), Math.pow(1.05, 6));
  near(app.weekMultiplier(9, { level: 2 }), Math.pow(1.04, 6));
  assert.equal(app.weekMultiplier(60, { level: 0 }, true), 1.8);
  assert.equal(app.weekMultiplier(60, { level: 1 }, true), 1.65);
  assert.equal(app.weekMultiplier(60, { level: 2 }, true), 1.5);
  assert.equal(app.weekMultiplier(60, null, true), 1.8);
});

test('phasedWeeklyKm: baseKm 30, 10k, cautela 0, R=16 -> pico 45 (tope de la distancia), no limitado', () => {
  const app = loadApp();
  const r = plain(app.phasedWeeklyKm({ goal: '10k' }, { level: 0 }, infoAt(app, 16, 0), 30));
  assert.equal(r.peakKm, 45);
  assert.equal(r.limited, false);
});

test('phasedWeeklyKm: baseKm 10, 42k, cautela 0, R=16 -> pico limitado por el techo/crecimiento, limited true', () => {
  const app = loadApp();
  // R=16: 2 semanas peak -> 14 de rampa, de las cuales 3 son descarga -> 11 pasos de crecimiento
  const steps = 14 - 3;
  const expected = Math.min(70, 10 * 1.8, 10 * Math.pow(1.06, steps));
  const r = plain(app.phasedWeeklyKm({ goal: '42k' }, { level: 0 }, infoAt(app, 16, 0), 10));
  assert.equal(r.peakKm, expected);
  assert.equal(r.peakKm, 18);
  assert.equal(r.limited, true);
});

test('phasedWeeklyKm: baseKm mayor que el pico de la distancia -> pico = baseKm, no limitado', () => {
  const app = loadApp();
  const r = plain(app.phasedWeeklyKm({ goal: '10k' }, { level: 0 }, infoAt(app, 16, 5), 60));
  assert.equal(r.peakKm, 60);
  assert.equal(r.limited, false);
  // igual al tope exacto de la distancia: tampoco está limitado
  const eq = plain(app.phasedWeeklyKm({ goal: '10k' }, { level: 0 }, infoAt(app, 16, 5), 45));
  assert.equal(eq.peakKm, 45);
  assert.equal(eq.limited, false);
});

test('phasedWeeklyKm: la rampa es geométrica sobre las semanas completas y llega al pico en la última', () => {
  const app = loadApp();
  const R = 16;
  const rampCount = R - 2;   // 14 semanas de rampa
  const steps = rampCount - 3; // 3 descargas (semanas 3, 7, 11) no cuentan como paso
  const s = kmSeries(app, { goal: '21k' }, { level: 0 }, 30, R);
  const peakKm = s[0].peakKm;
  assert.equal(peakKm, 54); // 30 x 1.8 (el tope de 55 de la distancia no llega a usarse)
  // valor de la semana completa con k pasos ya dados
  const full = k => 30 * Math.pow(peakKm / 30, k / steps);
  let k = 0;
  for (let i = 0; i < rampCount; i++) {
    if (i % 4 === 3) {
      // descarga: 0,75 x la semana completa anterior (no consume un paso)
      assert.ok(Math.abs(s[i].km - 0.75 * full(k)) < 1e-9, `descarga ${i}: ${s[i].km}`);
    } else {
      k++;
      assert.ok(Math.abs(s[i].km - full(k)) < 1e-9, `semana ${i}: ${s[i].km} vs ${full(k)}`);
    }
  }
  assert.equal(k, steps);
  assert.ok(Math.abs(s[rampCount - 1].km - peakKm) < 1e-9); // la última semana de rampa es completa y vale el pico
  // peak y taper: exactamente peakKm (el taper lo aplica generatePlan después)
  for (let i = rampCount; i < R + 3; i++) assert.equal(s[i].km, peakKm, `semana ${i}`);
});

test('phasedWeeklyKm: cada semana sin descarga sube como mucho `growth` sobre la semana completa anterior (incluido el rebote)', () => {
  const app = loadApp();
  const bases = [3, 10, 20, 30, 44, 45, 60];
  const goals = ['5k', '10k', '15k', '21k', '42k'];
  const levels = [0, 1, 2];
  const Rs = [4, 5, 8, 16, 24, 30, 60];
  let combos = 0;
  bases.forEach(baseKm => goals.forEach(goal => levels.forEach(level => Rs.forEach(R => {
    combos++;
    const caution = { level };
    const { growth, cap } = app.growthParams(caution);
    const s = kmSeries(app, { goal }, caution, baseKm, R);
    const peakKm = s[0].peakKm;
    const label = `base ${baseKm} ${goal} nivel ${level} R=${R}`;
    // el pico respeta el techo y nunca baja de baseKm
    assert.ok(peakKm >= baseKm, label);
    assert.ok(peakKm <= Math.max(baseKm, baseKm * cap) + 1e-9, label);
    const split = Array.from(app.phaseSplit(R));
    const isCut = i => i < R && split[i] !== 'peak' && i % 4 === 3;
    let prevFull = baseKm; // última semana sin descarga (la primera de rampa se compara con baseKm)
    s.forEach((w, i) => {
      assert.equal(w.peakKm, peakKm, `${label} peakKm constante, semana ${i}`);
      if (i >= R || split[i] === 'peak') {
        // peak y taper nunca son descarga y valen el pico
        assert.equal(w.km, peakKm, `${label} semana ${i} (${i >= R ? 'taper' : 'peak'})`);
      }
      if (isCut(i)) {
        // descarga: exactamente 0,75 x la semana completa anterior
        assert.ok(Math.abs(w.km - 0.75 * prevFull) < 1e-9, `${label} semana ${i} descarga: ${w.km} vs ${0.75 * prevFull}`);
        return; // no pasa a ser la referencia de la semana siguiente
      }
      // semana completa (rebote incluido): sube como mucho `growth` y nunca baja
      assert.ok(w.km / prevFull <= growth + 1e-9, `${label} semana ${i}: ${w.km} / ${prevFull}`);
      assert.ok(w.km >= prevFull - 1e-9, `${label} semana ${i} no baja sin descarga`);
      prevFull = w.km;
    });
    // el pico es >= cualquier semana anterior
    const firstPeak = split.indexOf('peak');
    for (let i = 0; i < firstPeak; i++) assert.ok(s[firstPeak].km >= s[i].km - 1e-9, `${label} pico >= semana ${i}`);
  }))));
  assert.equal(combos, bases.length * goals.length * levels.length * Rs.length);
});

test('phasedWeeklyKm: la descarga cae cada 4 semanas (índices 3, 7, 11...) solo en rampa y el rebote sube un solo paso', () => {
  const app = loadApp();
  // base 30, 10k, nivel 0, R=16: rampa = 14 semanas, descargas en 3, 7, 11 -> 11 pasos hasta 45
  const s = kmSeries(app, { goal: '10k' }, { level: 0 }, 30, 16);
  const r = Math.pow(45 / 30, 1 / 11);
  assert.equal(s[0].peakKm, 45);
  [3, 7, 11].forEach(i => {
    assert.ok(Math.abs(s[i].km - 0.75 * s[i - 1].km) < 1e-9, `descarga en ${i}`);
    // rebote: vuelve a la semana completa previa x r (un solo paso), NO x r^2
    assert.ok(Math.abs(s[i + 1].km - s[i - 1].km * r) < 1e-9, `rebote en ${i + 1}: ${s[i + 1].km}`);
    assert.ok(s[i + 1].km / s[i - 1].km <= 1.06 + 1e-9, `rebote en ${i + 1} dentro del límite`);
  });
  // caso citado en la revisión (antes: 32.7 [25.3] 34.7, o sea r^2 sobre la semana previa a la descarga)
  assert.ok(Math.abs(s[4].km - s[2].km * r) < 1e-9);
  // las semanas 12 y 13 son rampa completa, la 14 la última de rampa (vale el pico) y 15 es peak
  assert.ok(Math.abs(s[13].km - 45) < 1e-9);
  assert.equal(s[14].km, 45);
  assert.equal(s[15].km, 45);
  assert.equal(s[16].km, 45);
});

test('phasedWeeklyKm: si la última semana de rampa es una descarga vale 0,75 x el pico y la primera peak vuelve al pico', () => {
  const app = loadApp();
  // R=5: build x2, specific x2, peak x1 -> rampCount 4, la semana 3 (última de rampa) es descarga
  const s = kmSeries(app, { goal: '10k' }, { level: 0 }, 30, 5);
  const peakKm = s[0].peakKm;
  assert.ok(Math.abs(s[3].km - 0.75 * peakKm) < 1e-9);
  assert.ok(Math.abs(s[2].km - peakKm) < 1e-9); // la última semana completa de rampa ya es el pico
  assert.equal(s[4].km, peakKm);
});

test('phasedWeeklyKm: es pura (no lee state) y no modifica sus argumentos', () => {
  const app = loadApp();
  app.state.profile = null;
  const p = { goal: '10k' };
  const caution = { level: 1 };
  const info = infoAt(app, 12, 4);
  const a = plain(app.phasedWeeklyKm(p, caution, info, 25));
  const b = plain(app.phasedWeeklyKm(p, caution, info, 25));
  assert.deepEqual(a, b);
  assert.deepEqual(plain(info), infoAt(app, 12, 4));
  assert.deepEqual(plain(caution), { level: 1 });
});

// ---- generatePlan con volumen por fases + versión del plan ----

// Semana 'build' del cronograma SCHEDULE (weekIdx 4, no es descarga) y una semana anterior al ancla.
// (A volúmenes más altos la sesión de cuestas se recalcula por su estructura de repeticiones y no
// conserva su parte del total, ver el cálculo de hills: por eso no se usa una semana build tardía.)
const BUILD_WEEK = '2026-11-30';
const PRE_ANCHOR_WEEK = '2026-10-26';

// App con reloj congelado, perfil, cronograma y sin carreras cargadas. persist() espiado (así
// no toca red ni disco y se puede comprobar que generatePlan no persiste).
function phasedApp(profile, schedule, nowIso) {
  const app = loadApp();
  app.Date = makeFrozenDate(nowIso || '2026-10-28T12:00:00');
  app.state.profile = profile;
  app.state.event = null;
  app.state.lastEventDate = null;
  app.state.phaseSchedule = schedule === undefined ? plain(SCHEDULE) : schedule;
  const calls = { persist: 0 };
  app.persist = () => { calls.persist++; return Promise.resolve(); };
  return { app, calls };
}
const sumDist = plan => plan.reduce((a, d) => a + (d.dist || 0), 0);

test('generatePlan: con cronograma activo en semana build, el total semanal sigue phasedWeeklyKm x taperMultiplier (+-1,5 km)', () => {
  const p = racingProfile();
  const { app } = phasedApp(p);
  const info = plain(app.phaseForWeek(p, BUILD_WEEK, app.state.phaseSchedule));
  assert.equal(info.phase, 'build');
  const expected = app.phasedWeeklyKm(p, app.trainingCaution(p), info, 30).km * app.taperMultiplier(p, BUILD_WEEK);
  const plan = plain(app.generatePlan(p, 1, BUILD_WEEK));
  assert.ok(Math.abs(sumDist(plan) - expected) <= 1.5, `suma ${sumDist(plan)} vs esperado ${expected}`);
  // y no es el volumen de v4 (30 km en la semana 1): el plan por fases ya subió
  assert.ok(expected > 35, `esperado ${expected}`);
});

test('generatePlan: sin cronograma (null) o con uno que no coincide, el plan es el de v4', () => {
  const p = racingProfile();
  const v4 = plain(phasedApp(p, null).app.generatePlan(p, 1, BUILD_WEEK));
  const desfasado = phasedApp(p, { anchor: '2026-11-02', raceDate: '2027-03-21', goal: '21k' }).app;
  assert.deepEqual(plain(desfasado.generatePlan(p, 1, BUILD_WEEK)), v4);
  const sinKey = phasedApp(p, undefined).app;
  sinKey.state.phaseSchedule = undefined;
  assert.deepEqual(plain(sinKey.generatePlan(p, 1, BUILD_WEEK)), v4);
  // v4: semana 1 -> multiplicador 1 -> ~30 km, bien lejos del volumen por fases
  assert.ok(Math.abs(sumDist(v4) - 30) <= 1.5, `v4 suma ${sumDist(v4)}`);
});

test('generatePlan: principiante con cronograma viejo -> plan de v4 (el guard de principiante manda)', () => {
  const beginner = racingProfile({ runnerType: 'new', weeklyKm: 0, currentWeeklyKm: 0, trainingDays: ['tue', 'thu', 'sun'] });
  const withStale = phasedApp(beginner, plain(SCHEDULE)).app;
  const without = phasedApp(beginner, null).app;
  assert.deepEqual(plain(withStale.generatePlan(beginner, 3, BUILD_WEEK)), plain(without.generatePlan(beginner, 3, BUILD_WEEK)));
  assert.equal(withStale.state.phaseSchedule.peakKm, undefined, 'no escribe peakKm para un principiante');
});

test('generatePlan: la semana de recuperación posterior a una carrera cargada sigue multiplicando (0,6) sobre el volumen por fases', () => {
  const p = racingProfile();
  const { app } = phasedApp(p);
  const base = sumDist(plain(app.generatePlan(p, 1, BUILD_WEEK)));
  // una carrera cargada el domingo anterior a BUILD_WEEK -> semana de recuperación
  app.state.event = { date: '2026-11-29' };
  const rec = sumDist(plain(app.generatePlan(p, 1, BUILD_WEEK)));
  assert.ok(rec < base * 0.75, `recuperación ${rec} vs normal ${base}`);
});

test('generatePlan: en la semana de taper el volumen por fases se multiplica por taperMultiplier', () => {
  const p = racingProfile();
  const { app } = phasedApp(p);
  const week = '2027-03-01'; // taper, a 1 semana de la carrera
  const info = plain(app.phaseForWeek(p, week, app.state.phaseSchedule));
  assert.equal(info.phase, 'taper');
  const tm = app.taperMultiplier(p, week);
  assert.ok(tm < 1);
  const expected = app.phasedWeeklyKm(p, app.trainingCaution(p), info, 30).km * tm;
  const plan = plain(app.generatePlan(p, 1, week));
  assert.ok(Math.abs(sumDist(plan) - expected) <= 1.5, `suma ${sumDist(plan)} vs esperado ${expected}`);
});

test('generatePlan: el volumen por fases parte de effectiveWeeklyKm (meta semanal propia acotada)', () => {
  const p = racingProfile({ weeklyGoalKm: 40 });
  const { app } = phasedApp(p);
  const eff = Math.min(Math.max(30 * 1.3, 35), Math.max(30 * 0.7, 40)); // = 39
  const info = plain(app.phaseForWeek(p, BUILD_WEEK, app.state.phaseSchedule));
  const expected = app.phasedWeeklyKm(p, app.trainingCaution(p), info, eff).km;
  const plan = plain(app.generatePlan(p, 1, BUILD_WEEK));
  assert.ok(Math.abs(sumDist(plan) - expected) <= 1.5, `suma ${sumDist(plan)} vs esperado ${expected}`);
});

test('generatePlan: plan por TIEMPO también recibe el volumen por fases (rodaje + tirada escalan con el km de phasedWeeklyKm)', () => {
  const p = racingProfile({ trainBy: 'time' });
  const { app } = phasedApp(p);
  const info = plain(app.phaseForWeek(p, BUILD_WEEK, app.state.phaseSchedule));
  const phasedKm = app.phasedWeeklyKm(p, app.trainingCaution(p), info, 30).km;
  // En minutos, tempo/series/cuestas tienen topes propios (TIME_MAX_BY_TYPE) y estructuras que se
  // redondean aparte; rodaje suave y tirada larga no, y escalan 1:1 con el multiplicador de la
  // semana. v4 en la semana 1 tiene multiplicador 1 (30 km), así que por fases escalan phasedKm/30.
  const pickMin = plan => plan.filter(d => d.typeKey === 'easy' || d.typeKey === 'long').reduce((a, d) => a + d.durMin, 0);
  const v4 = pickMin(plain(phasedApp(p, null).app.generatePlan(p, 1, BUILD_WEEK)));
  const got = pickMin(plain(app.generatePlan(p, 1, BUILD_WEEK)));
  const expected = v4 * phasedKm / 30;
  // cada sesión se redondea a 5 min (+-2,5) en las dos versiones: hasta ~10 min de desvío
  assert.ok(Math.abs(got - expected) <= 10, `minutos rodaje+tirada ${got} vs esperado ${expected} (v4 ${v4}, km ${phasedKm})`);
  assert.ok(got > v4 + 15, `por fases ${got} min tiene que superar claramente v4 ${v4} min`);
});

test('generatePlan no escribe state.phaseSchedule ni state.phaseNow (ni persiste), con cualquier perfil', () => {
  const p = racingProfile();
  const { app, calls } = phasedApp(p, Object.assign(plain(SCHEDULE), { peakKm: 54, limited: true }));
  const antes = JSON.stringify(app.state.phaseSchedule);
  app.state.weekStart = BUILD_WEEK;
  app.state.phaseNow = 'centinela';
  app.generatePlan(p, 1, BUILD_WEEK);
  app.generatePlan(p, 1, '2027-02-08');
  app.generatePlan(p, 1); // semana por defecto = state.weekStart
  // perfil de vista previa con otro weeklyKm (como getNextWeekPlan)
  app.generatePlan(Object.assign({}, p, { weeklyKm: 24, currentWeeklyKm: 24 }), 1, BUILD_WEEK);
  assert.equal(JSON.stringify(app.state.phaseSchedule), antes);
  assert.equal(app.state.phaseNow, 'centinela');
  assert.equal(calls.persist, 0);
});

test('el pico del cronograma sale del perfil al crearlo: no cambia con el weeklyKm de la vista previa que generePlan', () => {
  const p = racingProfile();
  const { app } = phasedApp(p, undefined);
  app.state.phaseSchedule = undefined;
  app.refreshPhaseSchedule();
  const pico = app.state.phaseSchedule.peakKm;
  assert.ok(pico > 0);
  const preview = Object.assign({}, p, { weeklyKm: 24, currentWeeklyKm: 24 });
  // el pico que calcula cada perfil adentro de generatePlan es distinto...
  const info = plain(app.phaseForWeek(p, BUILD_WEEK, app.state.phaseSchedule));
  assert.notEqual(app.phasedWeeklyKm(preview, app.trainingCaution(p), info, 24).peakKm, pico);
  // ...pero el del cronograma (y state.phaseNow) no se mueve sin importar el orden
  app.generatePlan(preview, 1, BUILD_WEEK);
  app.generatePlan(p, 1, BUILD_WEEK);
  app.generatePlan(preview, 1, BUILD_WEEK);
  assert.equal(app.state.phaseSchedule.peakKm, pico);
  app.state.weekStart = BUILD_WEEK;
  app.refreshPhaseNow();
  assert.equal(app.state.phaseNow.peakKm, pico);
});

test('refreshPhaseNow: deriva {phase, weeksToRace, limited, peakKm} de la semana actual y del cronograma', () => {
  const p = racingProfile();
  const { app } = phasedApp(p, Object.assign(plain(SCHEDULE), { peakKm: 54, limited: true }));
  app.state.weekStart = BUILD_WEEK;
  app.refreshPhaseNow();
  assert.deepEqual(plain(app.state.phaseNow), { phase: 'build', weeksToRace: 14, limited: true, peakKm: 54 });
  // antes del ancla, después de la carrera, sin cronograma, sin perfil -> null
  app.state.weekStart = PRE_ANCHOR_WEEK;
  app.refreshPhaseNow();
  assert.equal(app.state.phaseNow, null);
  app.state.weekStart = '2027-03-15';
  app.refreshPhaseNow();
  assert.equal(app.state.phaseNow, null);
  app.state.weekStart = BUILD_WEEK;
  app.state.phaseSchedule = null;
  app.refreshPhaseNow();
  assert.equal(app.state.phaseNow, null);
  app.state.phaseSchedule = plain(SCHEDULE);
  app.state.profile = null;
  app.refreshPhaseNow();
  assert.equal(app.state.phaseNow, null);
});

test('refreshPhaseNow: un usuario fuera del plan por fases (principiante / meta general / sin carrera) tiene phaseNow null', () => {
  [
    racingProfile({ runnerType: 'new', weeklyKm: 0, currentWeeklyKm: 0 }),
    racingProfile({ goal: 'general' }),
    baseProfile({ goal: '21k' }),
  ].forEach(p => {
    const { app } = phasedApp(p, null);
    app.state.weekStart = BUILD_WEEK;
    app.state.phaseNow = 'viejo';
    app.refreshPhaseSchedule();
    assert.equal(app.state.phaseSchedule, null);
    assert.equal(app.state.phaseNow, null);
  });
});

test('rollover a la semana ancla: phaseNow pasa a base, y weeksToRace baja 1 la semana siguiente', () => {
  const p = racingProfile();
  // 2026-11-02 es el lunes ancla; el cronograma se creó el 28/10 (miércoles) y ya está guardado
  const sched = withPeak(loadApp(), p, SCHEDULE);
  const { app } = phasedApp(p, sched, '2026-11-02T08:00:00');
  app.state.onboarded = true;
  app.state.weekNumber = 5;
  app.state.weekStart = '2026-10-26';
  app.state.plan = plain(app.generatePlan(p, 5, '2026-10-26'));
  app.state.runs = [];
  app.state.phaseNow = null; // la semana pasada no tenía fase activa
  app.checkWeekRollover();
  assert.equal(app.state.weekStart, '2026-11-02');
  assert.equal(app.state.phaseNow.phase, 'base');
  assert.equal(app.state.phaseNow.weeksToRace, 18);
  assert.equal(app.state.phaseNow.peakKm, sched.peakKm);
  assert.equal(app.state.phaseNow.limited, sched.limited);
  // una semana después (reloj corrido): sigue siendo la rampa, un lunes más cerca de la carrera
  app.Date = makeFrozenDate('2026-11-09T08:00:00');
  app.checkWeekRollover();
  assert.equal(app.state.weekStart, '2026-11-09');
  assert.equal(app.state.phaseNow.weeksToRace, 17);
});

test('rollover pasada la carrera: phaseNow no se queda trabado en taper (null)', () => {
  const p = racingProfile();
  const sched = withPeak(loadApp(), p, SCHEDULE);
  const { app } = phasedApp(p, sched, '2027-03-08T08:00:00'); // lunes de la semana de la carrera
  app.state.onboarded = true;
  app.state.weekNumber = 18;
  app.state.weekStart = '2027-03-01';
  app.state.plan = plain(app.generatePlan(p, 18, '2027-03-01'));
  app.state.runs = [];
  app.refreshPhaseNow();
  app.state.weekStart = '2027-03-01';
  app.refreshPhaseNow();
  assert.equal(app.state.phaseNow.phase, 'taper');
  app.checkWeekRollover();
  assert.equal(app.state.weekStart, '2027-03-08');
  assert.equal(app.state.phaseNow.phase, 'taper');
  assert.equal(app.state.phaseNow.weeksToRace, 0);
  app.Date = makeFrozenDate('2027-03-15T08:00:00'); // la semana después de la carrera
  app.checkWeekRollover();
  assert.equal(app.state.weekStart, '2027-03-15');
  assert.equal(app.state.phaseNow, null);
});

test('cambio de plazo "desde la semana que viene": el cronograma nuevo deja phaseNow coherente (null: la semana actual queda fuera)', () => {
  const p = racingProfile();
  const { app } = phasedApp(p, withPeak(loadApp(), p, SCHEDULE), '2026-12-02T12:00:00');
  app.state.weekStart = '2026-11-30';
  app.refreshPhaseNow();
  assert.equal(app.state.phaseNow.phase, 'build');
  // la fecha de carrera cambia y se confirma: el ancla nuevo es el lunes siguiente (2026-12-07)
  app.state.profile.raceDate = '2027-04-04';
  app.refreshPhaseSchedule();
  assert.equal(app.state.phaseSchedule.anchor, '2026-12-07');
  assert.equal(app.state.phaseNow, null);
});

test('checkPlanAlgoVersion: con planAlgoVersion 4 (por distancia) solo anota la 5, no regenera el plan', () => {
  const p = racingProfile();
  const { app, calls } = phasedApp(p, undefined);
  app.state.onboarded = true;
  app.state.weekStart = BUILD_WEEK;
  const plan = [{ day: 'mon', typeKey: 'rest', dist: 0 }, { day: 'tue', typeKey: 'easy', dist: 7, zone: 2 }];
  app.state.plan = plan;
  app.state.planAlgoVersion = 4;
  app.checkPlanAlgoVersion();
  assert.equal(app.state.planAlgoVersion, 5);
  assert.equal(app.state.plan, plan, 'el mismo arreglo, sin regenerar');
  assert.deepEqual(plain(app.state.plan), plain(plan));
  assert.ok(calls.persist >= 1);
});

test('checkPlanAlgoVersion: con planAlgoVersion 3 por distancia sigue anotando sin regenerar; por tiempo regenera', () => {
  const dist = phasedApp(racingProfile(), null);
  dist.app.state.onboarded = true;
  dist.app.state.weekStart = BUILD_WEEK;
  const plan = [{ day: 'tue', typeKey: 'easy', dist: 7, zone: 2 }];
  dist.app.state.plan = plan;
  dist.app.state.planAlgoVersion = 3;
  dist.app.checkPlanAlgoVersion();
  assert.equal(dist.app.state.planAlgoVersion, 5);
  assert.equal(dist.app.state.plan, plan);

  const time = phasedApp(racingProfile({ trainBy: 'time' }), null);
  time.app.state.onboarded = true;
  time.app.state.weekStart = BUILD_WEEK;
  const tplan = [{ day: 'tue', typeKey: 'easy', dist: 7, zone: 2 }];
  time.app.state.plan = tplan;
  time.app.state.planAlgoVersion = 3;
  time.app.checkPlanAlgoVersion();
  assert.equal(time.app.state.planAlgoVersion, 5);
  assert.notEqual(time.app.state.plan, tplan, 'por tiempo se regenera');
  assert.equal(time.app.state.plan.length, 7);
});

test('checkPlanAlgoVersion: con una versión más vieja (2) regenera el plan', () => {
  const { app } = phasedApp(racingProfile(), null);
  app.state.onboarded = true;
  app.state.weekStart = BUILD_WEEK;
  const plan = [{ day: 'tue', typeKey: 'easy', dist: 7, zone: 2 }];
  app.state.plan = plan;
  app.state.planAlgoVersion = 2;
  app.checkPlanAlgoVersion();
  assert.equal(app.state.planAlgoVersion, 5);
  assert.equal(app.state.plan.length, 7);
});

// ---- cableado de refreshPhaseSchedule ----

test('checkPlanAlgoVersion: deja el cronograma al día aunque la versión ya sea la actual', () => {
  const { app } = phasedApp(racingProfile(), undefined);
  app.state.phaseSchedule = undefined;
  app.state.onboarded = true;
  app.state.weekStart = '2026-10-26';
  app.state.plan = [{ day: 'tue', typeKey: 'easy', dist: 7 }];
  app.state.planAlgoVersion = 5;
  app.checkPlanAlgoVersion();
  assert.deepEqual(plain(app.state.phaseSchedule), withPeak(app, app.state.profile, SCHEDULE));
});

test('checkWeekRollover: deja el cronograma al día (con una semana que no cambia)', () => {
  const { app } = phasedApp(racingProfile(), undefined);
  app.state.phaseSchedule = undefined;
  app.state.onboarded = true;
  app.state.weekStart = app.getMondayISO(new app.Date()); // sin cambio de semana
  app.checkWeekRollover();
  assert.deepEqual(plain(app.state.phaseSchedule), withPeak(app, app.state.profile, SCHEDULE));
});

test('checkWeekRollover / checkPlanAlgoVersion: no tiran si falta el perfil', () => {
  const { app } = phasedApp(null, undefined);
  app.state.phaseSchedule = undefined;
  app.state.onboarded = true;
  app.state.weekStart = app.getMondayISO(new app.Date());
  app.state.plan = [{ day: 'tue', typeKey: 'easy', dist: 7 }];
  app.state.planAlgoVersion = 5;
  assert.doesNotThrow(() => app.checkWeekRollover());
  assert.doesNotThrow(() => app.checkPlanAlgoVersion());
});

test('checkWeekRollover: al cambiar de semana crea el cronograma y sella la versión del plan', () => {
  const p = racingProfile();
  // hoy es lunes 2026-11-30: el cronograma sale con ancla en el lunes siguiente (2026-12-07)
  const { app } = phasedApp(p, undefined, '2026-11-30T10:00:00');
  app.state.phaseSchedule = undefined;
  app.state.onboarded = true;
  app.state.weekNumber = 5;
  app.state.weekStart = '2026-11-23';
  app.state.plan = [{ day: 'tue', typeKey: 'easy', dist: 7, zone: 2, status: 'done' }];
  app.state.runs = [];
  app.checkWeekRollover();
  assert.equal(app.state.phaseSchedule.anchor, '2026-12-07');
  assert.equal(app.state.weekStart, '2026-11-30');
  assert.equal(app.state.planAlgoVersion, 5);
});

test('applyProfileChange (herramienta del coach): cambiar fecha_carrera o objetivo reemplaza el cronograma', () => {
  const p = racingProfile();
  const { app } = phasedApp(p);
  app.renderAll = () => {}; app.renderZones = () => {};
  app.state.weekStart = '2026-10-26';
  app.state.weekNumber = 1;
  app.state.plan = plain(app.generatePlan(p, 1, '2026-10-26'));
  app.applyProfileChange({ fecha_carrera: '2027-04-04' });
  assert.equal(app.state.profile.raceDate, '2027-04-04');
  assert.deepEqual(plain(app.state.phaseSchedule), withPeak(app, app.state.profile, { anchor: '2026-11-02', raceDate: '2027-04-04', goal: '21k' }));
  app.applyProfileChange({ objetivo: '10k' });
  assert.deepEqual(plain(app.state.phaseSchedule), withPeak(app, app.state.profile, { anchor: '2026-11-02', raceDate: '2027-04-04', goal: '10k' }));
  app.applyProfileChange({ objetivo: 'general' });
  assert.equal(app.state.phaseSchedule, null);
});

test('applyUndoLastChange: deshacer un cambio de carrera restaura el cronograma ORIGINAL (mismo ancla y pico), aunque el reloj avanzó una semana', () => {
  const p = racingProfile();
  const original = withPeak(loadApp(), p, SCHEDULE);
  const { app } = phasedApp(p, plain(original));
  app.renderAll = () => {}; app.renderZones = () => {};
  app.state.weekStart = '2026-10-26';
  app.state.weekNumber = 1;
  app.state.plan = plain(app.generatePlan(p, 1, '2026-10-26'));
  app.applyProfileChange({ fecha_carrera: '2027-04-04' });
  assert.equal(app.state.phaseSchedule.raceDate, '2027-04-04');
  assert.equal(app.state.phaseSchedule.anchor, '2026-11-02');
  // pasa una semana: un cronograma NUEVO se anclaría ahora a 2026-11-09, no a 2026-11-02
  app.Date = makeFrozenDate('2026-11-04T12:00:00');
  app.applyUndoLastChange();
  assert.equal(app.state.profile.raceDate, '2027-03-14');
  assert.deepEqual(plain(app.state.phaseSchedule), original);
});

test('applyUndoLastChange: si el snapshot no trae cronograma (viejo) deja uno coherente con el perfil restaurado', () => {
  const p = racingProfile();
  const { app } = phasedApp(p, undefined);
  app.renderAll = () => {}; app.renderZones = () => {};
  app.state.weekStart = '2026-10-26';
  app.state.weekNumber = 1;
  app.state.plan = plain(app.generatePlan(p, 1, '2026-10-26'));
  app.state.coachUndoSnapshot = { plan: plain(app.state.plan), nextWeekOverrides: {}, profile: plain(p) };
  app.state.profile = racingProfile({ raceDate: '2027-04-04' });
  app.applyUndoLastChange();
  assert.equal(app.state.phaseSchedule.raceDate, '2027-03-14');
});

// ---- Rotación de sesiones fuertes por fase ----

const NO_CAUTION = { level: 0 };
const HIGH_CAUTION = { level: 2 };

test('hardSessionRotationForPhase: base y build no dependen de la meta', () => {
  const { app } = phasedApp(racingProfile());
  for (const goal of ['5k', '10k', '15k', '21k', '42k']) {
    assert.deepEqual(plain(app.hardSessionRotationForPhase('base', goal, NO_CAUTION)), ['hills', 'fartlek', 'progression'], goal);
    assert.deepEqual(plain(app.hardSessionRotationForPhase('build', goal, NO_CAUTION)), ['tempo', 'intervals', 'fartlek'], goal);
  }
});

test('hardSessionRotationForPhase: specific / peak / taper dependen de la meta', () => {
  const { app } = phasedApp(racingProfile());
  const expected = {
    '5k': ['intervals', 'tempo'],
    '10k': ['tempo', 'intervals'],
    '15k': ['tempo', 'progression'],
    '21k': ['tempo', 'progression'],
    '42k': ['tempo', 'progression'],
  };
  for (const phase of ['specific', 'peak', 'taper']) {
    for (const goal of Object.keys(expected)) {
      assert.deepEqual(plain(app.hardSessionRotationForPhase(phase, goal, NO_CAUTION)), expected[goal], `${phase} ${goal}`);
    }
  }
});

test('hardSessionRotationForPhase: con cautela >= 2 se quitan intervals y hills', () => {
  const { app } = phasedApp(racingProfile());
  const r = (phase, goal) => plain(app.hardSessionRotationForPhase(phase, goal, HIGH_CAUTION));
  assert.deepEqual(r('base', '10k'), ['fartlek', 'progression']);
  assert.deepEqual(r('build', '10k'), ['tempo', 'fartlek']);
  assert.deepEqual(r('specific', '5k'), ['tempo']);
  assert.deepEqual(r('peak', '5k'), ['tempo']);
  assert.deepEqual(r('specific', '10k'), ['tempo']);
  assert.deepEqual(r('taper', '10k'), ['tempo']);
  assert.deepEqual(r('specific', '21k'), ['tempo', 'progression']);
  assert.deepEqual(r('peak', '42k'), ['tempo', 'progression']);
  // cautela 1 no filtra nada
  assert.deepEqual(plain(app.hardSessionRotationForPhase('base', '10k', { level: 1 })), ['hills', 'fartlek', 'progression']);
});

test('hardSessionRotationForPhase: una fase desconocida devuelve lo mismo que hardSessionRotation', () => {
  const { app } = phasedApp(racingProfile());
  for (const phase of ['maintenance', 'post', undefined, null, '']) {
    for (const goal of ['5k', '10k', '21k', '42k']) {
      for (const caution of [NO_CAUTION, HIGH_CAUTION]) {
        assert.deepEqual(
          plain(app.hardSessionRotationForPhase(phase, goal, caution)),
          plain(app.hardSessionRotation(goal, caution)),
          `${phase} ${goal} ${caution.level}`
        );
      }
    }
  }
});

test('hardSessionRotationForPhase: devuelve una lista nueva (no deja mutar la rotación compartida)', () => {
  const { app } = phasedApp(racingProfile());
  const a = app.hardSessionRotationForPhase('base', '10k', NO_CAUTION);
  a.push('x');
  assert.deepEqual(plain(app.hardSessionRotationForPhase('base', '10k', NO_CAUTION)), ['hills', 'fartlek', 'progression']);
});

test('distributeSessionTypes: sin phase se comporta igual que antes (rotación de hardSessionRotation)', () => {
  const { app } = phasedApp(racingProfile());
  const days4 = ['tue', 'wed', 'fri', 'sun'];
  const days3 = ['tue', 'thu', 'sun'];
  const d = (days, beginner, wn, caution, cut, goal, vo) => plain(app.distributeSessionTypes(days, beginner, wn, caution, cut, goal, vo));
  // 10k, 4 días: rotación corta ['intervals','fartlek','tempo','hills']
  assert.deepEqual(d(days4, false, 1, NO_CAUTION, false, '10k', false), { tue: 'intervals', wed: 'easy', fri: 'fartlek', sun: 'long' });
  assert.deepEqual(d(days4, false, 2, NO_CAUTION, false, '10k', false), { tue: 'fartlek', wed: 'easy', fri: 'tempo', sun: 'long' });
  // 21k, 3 días, semana 1: rotación larga ['tempo','hills','progression','intervals']
  assert.deepEqual(d(days3, false, 1, NO_CAUTION, false, '21k', false), { tue: 'tempo', thu: 'easy', sun: 'long' });
  // explicitar undefined en el 8.º parámetro es lo mismo que omitirlo
  for (const wn of [1, 2, 3, 4, 5]) {
    for (const goal of ['5k', '21k']) {
      assert.deepEqual(
        plain(app.distributeSessionTypes(days4, false, wn, NO_CAUTION, false, goal, false, undefined)),
        plain(app.distributeSessionTypes(days4, false, wn, NO_CAUTION, false, goal, false))
      );
    }
  }
});

test('distributeSessionTypes: con phase usa la rotación de la fase; el resto de reglas no cambia', () => {
  const { app } = phasedApp(racingProfile());
  const days4 = ['tue', 'wed', 'fri', 'sun'];
  const d = (days, beginner, wn, caution, cut, goal, vo, phase) => plain(app.distributeSessionTypes(days, beginner, wn, caution, cut, goal, vo, phase));
  // base, semana 1 y 2 (dos días fuertes): hills + fartlek, luego fartlek + progression
  assert.deepEqual(d(days4, false, 1, NO_CAUTION, false, '10k', false, 'base'), { tue: 'hills', wed: 'easy', fri: 'fartlek', sun: 'long' });
  assert.deepEqual(d(days4, false, 2, NO_CAUTION, false, '10k', false, 'base'), { tue: 'fartlek', wed: 'easy', fri: 'progression', sun: 'long' });
  // specific 10k
  assert.deepEqual(d(days4, false, 1, NO_CAUTION, false, '10k', false, 'specific'), { tue: 'tempo', wed: 'easy', fri: 'intervals', sun: 'long' });
  // semana de descarga: un solo día fuerte (maxHardDays - 1), sale de la rotación de la fase
  assert.deepEqual(d(days4, false, 1, NO_CAUTION, true, '10k', false, 'base'), { tue: 'hills', wed: 'easy', fri: 'easy', sun: 'long' });
  // principiante con variedad: sigue siendo solo fartlek aunque haya fase
  const bv = d(['tue', 'thu', 'sat', 'sun'], true, 2, { level: 0 }, false, '10k', true, 'specific');
  assert.ok(Object.values(bv).every(t => ['fartlek', 'easy', 'long'].includes(t)), JSON.stringify(bv));
  // principiante sin variedad: todo rodaje suave igual que sin fase
  assert.deepEqual(d(days4, true, 1, NO_CAUTION, false, '10k', false, 'base'), d(days4, true, 1, NO_CAUTION, false, '10k', false));
  // phase desconocida: igual que sin phase
  assert.deepEqual(d(days4, false, 3, NO_CAUTION, false, '21k', false, 'maintenance'), d(days4, false, 3, NO_CAUTION, false, '21k', false));
});

// Semana (lunes) de un cronograma activo cuya fase es `phase`, para un perfil/cronograma dado.
function weekOfPhase(app, p, schedule, phase, nth) {
  const hits = [];
  for (let i = 0; i < 40; i++) {
    const week = app.addDaysToIsoLocal(schedule.anchor, i * 7);
    const info = plain(app.phaseForWeek(p, week, schedule));
    if (info.active && info.phase === phase) hits.push(week);
  }
  return hits[nth || 0];
}
const hardTypes = plan => plan.map(d => d.typeKey).filter(k => k && k !== 'easy' && k !== 'long' && k !== 'rest');

test('generatePlan: una semana base con cronograma activo solo tiene cuestas / fartlek / progresivo como sesión fuerte', () => {
  const p = racingProfile();
  const { app } = phasedApp(p);
  const base = weekOfPhase(app, p, app.state.phaseSchedule, 'base', 0);
  assert.ok(base, 'hay una semana base');
  const seen = new Set();
  for (let wn = 1; wn <= 6; wn++) {
    const hard = hardTypes(plain(app.generatePlan(p, wn, base)));
    assert.ok(hard.length >= 1, `semana ${wn}: ${hard}`);
    for (const k of hard) {
      assert.ok(['hills', 'fartlek', 'progression'].includes(k), `semana ${wn}: ${k}`);
      seen.add(k);
    }
  }
  assert.ok(!seen.has('tempo') && !seen.has('intervals'));
  assert.ok(seen.size >= 2, `rota entre varios: ${[...seen]}`);
});

test('generatePlan: una semana specific de 10k tiene tempo o series y nunca cuestas ni fartlek', () => {
  const p = racingProfile({ goal: '10k' });
  const schedule = { anchor: '2026-11-02', raceDate: '2027-03-14', goal: '10k' };
  const { app } = phasedApp(p, schedule);
  const spec = weekOfPhase(app, p, app.state.phaseSchedule, 'specific', 0);
  assert.ok(spec, 'hay una semana specific');
  const seen = new Set();
  for (let wn = 1; wn <= 6; wn++) {
    const hard = hardTypes(plain(app.generatePlan(p, wn, spec)));
    assert.ok(hard.length >= 1, `semana ${wn}: ${hard}`);
    for (const k of hard) {
      assert.ok(['tempo', 'intervals'].includes(k), `semana ${wn}: ${k}`);
      seen.add(k);
    }
  }
  assert.ok(seen.has('tempo') && seen.has('intervals'));
});

test('generatePlan: sin cronograma activo la rotación es la de siempre (series o cuestas aparecen)', () => {
  const p = racingProfile();
  const { app } = phasedApp(p, null);
  const v4 = new Set();
  for (let wn = 1; wn <= 8; wn++) hardTypes(plain(app.generatePlan(p, wn, '2026-11-02'))).forEach(k => v4.add(k));
  assert.ok(v4.has('intervals') || v4.has('hills'), `v4 tiene series o cuestas: ${[...v4]}`);
});

// ---- applyPhaseLongRun: tirada larga por proporción de la semana y tope por distancia ----

// Misma tabla RATIO que arma generatePlan (rama no principiante); EASY_SESSION_RATIO = 0.9.
const LR_RATIO = { easy: 0.9, intervals: 1.15, tempo: 0.85, long: 1.5, fartlek: 1.0, hills: 0.9, progression: 1.0 };
const BUILD_INFO = { active: true, phase: 'build' };

// Replica el reparto proporcional de generatePlan para un conjunto de sesiones y un total semanal.
function lrDist(usedTypes, total) {
  const weightSum = usedTypes.reduce((a, t) => a + (LR_RATIO[t] || 1), 0);
  const perUnit = total / weightSum;
  const distMap = {};
  Object.keys(LR_RATIO).forEach(t => { distMap[t] = Math.round(perUnit * LR_RATIO[t]); });
  return distMap;
}
// Suma real de la semana: cada sesión cuenta con la distancia de su tipo.
const lrTotal = (distMap, usedTypes) => usedTypes.reduce((a, t) => a + distMap[t], 0);
const USED4 = ['easy', 'tempo', 'easy', 'long'];

test('applyPhaseLongRun: 4 días, semana build de 40 km, 21k -> tirada = round(40 x 0,30) = 12', () => {
  const { app } = phasedApp(racingProfile(), null);
  const distMap = lrDist(USED4, 40);
  app.applyPhaseLongRun(distMap, USED4, 40, BUILD_INFO, '21k', false, LR_RATIO);
  assert.equal(distMap.long, Math.min(24, Math.round(40 * 0.30)));
  assert.equal(distMap.long, 12);
});

test('applyPhaseLongRun: semana de descarga -> round(40 x 0,30 x 0,8) = 10 (round de 9,6)', () => {
  const { app } = phasedApp(racingProfile(), null);
  const distMap = lrDist(USED4, 40);
  app.applyPhaseLongRun(distMap, USED4, 40, BUILD_INFO, '21k', true, LR_RATIO);
  assert.equal(distMap.long, 10);
});

test('applyPhaseLongRun: el total semanal después del ajuste coincide con el de antes (+-1 km), en las cinco fases y en los dos sentidos', () => {
  const { app } = phasedApp(racingProfile(), null);
  const sets = [USED4, ['easy', 'hills', 'easy', 'long'], ['tempo', 'easy', 'long'], ['easy', 'easy', 'intervals', 'easy', 'fartlek', 'long']];
  ['base', 'build', 'specific', 'peak', 'taper'].forEach(phase => {
    sets.forEach(used => {
      [20, 32, 40, 55, 70].forEach(total => {
        [false, true].forEach(cut => {
          const distMap = lrDist(used, total);
          const before = lrTotal(distMap, used);
          app.applyPhaseLongRun(distMap, used, total, { active: true, phase }, '42k', cut, LR_RATIO);
          const after = lrTotal(distMap, used);
          assert.ok(Math.abs(after - before) <= 1, `${phase} ${used} total ${total} cut ${cut}: ${before} -> ${after}`);
          used.filter(t => t !== 'long').forEach(t => assert.ok(distMap[t] >= 1, `${t} cayó a ${distMap[t]}`));
        });
      });
    });
  });
});

test('applyPhaseLongRun: la tirada puede bajar o crecer (las demás ceden) y las demás nunca bajan de 1 km', () => {
  const { app } = phasedApp(racingProfile(), null);
  // la tirada del reparto proporcional (1,5 de 3,2 unidades) pesa más que 0,32 de la semana: baja
  const used = ['easy', 'tempo', 'long'];
  const distMap = lrDist(used, 40);
  const oldLong = distMap.long;
  app.applyPhaseLongRun(distMap, used, 40, { active: true, phase: 'specific' }, '21k', false, LR_RATIO);
  assert.equal(distMap.long, Math.round(40 * 0.32));
  assert.ok(distMap.long < oldLong, `la tirada de ${oldLong} bajó a ${distMap.long}`);
  // sentido contrario: con muchas sesiones suaves la tirada del reparto queda corta
  const used2 = ['easy', 'easy', 'easy', 'easy', 'easy', 'long'];
  const dm2 = lrDist(used2, 40);
  const old2 = dm2.long;
  app.applyPhaseLongRun(dm2, used2, 40, { active: true, phase: 'peak' }, '21k', false, LR_RATIO);
  assert.ok(dm2.long > old2, `la tirada de ${old2} subió a ${dm2.long}`);
  assert.ok(dm2.easy >= 1);
  assert.ok(Math.abs(lrTotal(dm2, used2) - 40) <= 1);
  // 4 rodajes + tirada: crece justo a round(40 x 0,33)
  const used4 = ['easy', 'easy', 'easy', 'easy', 'long'];
  const dm4 = lrDist(used4, 40);
  const old4 = dm4.long;
  app.applyPhaseLongRun(dm4, used4, 40, { active: true, phase: 'peak' }, '21k', false, LR_RATIO);
  assert.ok(dm4.long > old4, `tirada ${old4} -> ${dm4.long}`);
  assert.equal(dm4.long, 13);
  // piso de 1 km: una semana mínima no deja a las demás en 0 ni negativo, y el total se conserva
  const dm3 = { easy: 1, intervals: 1, tempo: 1, long: 8, fartlek: 1, hills: 1, progression: 1 };
  app.applyPhaseLongRun(dm3, ['easy', 'long'], 40, { active: true, phase: 'peak' }, '42k', false, LR_RATIO);
  assert.ok(dm3.easy >= 1, `easy ${dm3.easy}`);
  assert.ok(Math.abs(dm3.easy + dm3.long - 9) <= 1, `el piso de 1 km frena el recorte: la tirada absorbe lo que no entra (${dm3.easy} + ${dm3.long})`);
  assert.ok(dm3.long <= 32);
  // muchas sesiones del mismo tipo (5 rodajes comparten distMap.easy): el total igual queda a +-1 km
  const used5 = ['easy', 'easy', 'easy', 'easy', 'easy', 'long'];
  const dm5 = lrDist(used5, 40);
  const tot5 = lrTotal(dm5, used5);
  app.applyPhaseLongRun(dm5, used5, 40, { active: true, phase: 'peak' }, '21k', false, LR_RATIO);
  assert.ok(Math.abs(lrTotal(dm5, used5) - tot5) <= 1, `${tot5} -> ${lrTotal(dm5, used5)}`);
});

test('applyPhaseLongRun: con 2 días de entrenamiento la tirada nunca supera el 35% del total', () => {
  const { app } = phasedApp(racingProfile(), null);
  const used = ['easy', 'long'];
  ['base', 'build', 'specific', 'peak', 'taper'].forEach(phase => {
    [20, 28, 40, 55, 70].forEach(total => {
      [false, true].forEach(cut => {
        const distMap = lrDist(used, total);
        app.applyPhaseLongRun(distMap, used, total, { active: true, phase }, '42k', cut, LR_RATIO);
        const sum = lrTotal(distMap, used);
        assert.ok(distMap.long <= 0.35 * sum + 1e-9, `${phase} total ${total} cut ${cut}: ${distMap.long} de ${sum}`);
      });
    });
  });
});

test('applyPhaseLongRun: sin sesión long en la semana no cambia nada', () => {
  const { app } = phasedApp(racingProfile(), null);
  const used = ['easy', 'tempo', 'easy', 'fartlek'];
  const distMap = lrDist(used, 40);
  const copy = plain(distMap);
  app.applyPhaseLongRun(distMap, used, 40, BUILD_INFO, '21k', false, LR_RATIO);
  assert.deepEqual(plain(distMap), copy);
});

test('applyPhaseLongRun: sin phaseInfo.active (o sin phaseInfo) no cambia nada', () => {
  const { app } = phasedApp(racingProfile(), null);
  [{ active: false }, { active: false, phase: 'build' }, undefined, null].forEach(info => {
    const distMap = lrDist(USED4, 40);
    const copy = plain(distMap);
    app.applyPhaseLongRun(distMap, USED4, 40, info, '21k', false, LR_RATIO);
    assert.deepEqual(plain(distMap), copy);
  });
});

test('applyPhaseLongRun: una semana con solo la sesión long no tira y queda igual', () => {
  const { app } = phasedApp(racingProfile(), null);
  const distMap = lrDist(['long'], 40);
  const copy = plain(distMap);
  app.applyPhaseLongRun(distMap, ['long'], 40, BUILD_INFO, '21k', false, LR_RATIO);
  assert.deepEqual(plain(distMap), copy);
});

test('applyPhaseLongRun: el tope por distancia manda (42k pico de 70 km -> <= 32; 5k nunca pasa de 12)', () => {
  const { app } = phasedApp(racingProfile(), null);
  const used = ['easy', 'tempo', 'easy', 'long'];
  const d42 = lrDist(used, 70);
  app.applyPhaseLongRun(d42, used, 70, { active: true, phase: 'peak' }, '42k', false, LR_RATIO);
  assert.equal(d42.long, 23, 'round(70 x 0,33) = 23, por debajo del tope');
  const d42b = lrDist(used, 110);
  app.applyPhaseLongRun(d42b, used, 110, { active: true, phase: 'peak' }, '42k', false, LR_RATIO);
  assert.equal(d42b.long, 32, 'el tope de 32 km frena a 0,33 x 110 = 36');
  ['5k', '10k', '15k', '21k', '42k'].forEach(goal => {
    const cap = { '5k': 12, '10k': 16, '15k': 20, '21k': 24, '42k': 32 }[goal];
    const dm = lrDist(used, 200);
    app.applyPhaseLongRun(dm, used, 200, { active: true, phase: 'peak' }, goal, false, LR_RATIO);
    assert.equal(dm.long, cap, goal);
  });
  const d5 = lrDist(used, 35);
  app.applyPhaseLongRun(d5, used, 35, { active: true, phase: 'peak' }, '5k', false, LR_RATIO);
  assert.ok(d5.long <= 12, `5k pico: ${d5.long}`);
});

test('applyPhaseLongRun: taper usa la proporción de peak', () => {
  const { app } = phasedApp(racingProfile(), null);
  const a = lrDist(USED4, 40);
  const b = lrDist(USED4, 40);
  app.applyPhaseLongRun(a, USED4, 40, { active: true, phase: 'taper' }, '21k', false, LR_RATIO);
  app.applyPhaseLongRun(b, USED4, 40, { active: true, phase: 'peak' }, '21k', false, LR_RATIO);
  assert.deepEqual(plain(a), plain(b));
  assert.equal(a.long, Math.round(40 * 0.33));
});

test('applyPhaseLongRun: proporción por fase base 0,28 / build 0,30 / specific 0,32 / peak 0,33', () => {
  const { app } = phasedApp(racingProfile(), null);
  [['base', 0.28], ['build', 0.30], ['specific', 0.32], ['peak', 0.33]].forEach(([phase, share]) => {
    const dm = lrDist(USED4, 40);
    app.applyPhaseLongRun(dm, USED4, 40, { active: true, phase }, '21k', false, LR_RATIO);
    assert.equal(dm.long, Math.round(40 * share), phase);
  });
});

test('generatePlan: semana build con cronograma activo -> tirada = round(total x 0,30); en la de descarga x 0,8', () => {
  const p = racingProfile();
  const { app } = phasedApp(p);
  const info = plain(app.phaseForWeek(p, BUILD_WEEK, app.state.phaseSchedule));
  assert.equal(info.phase, 'build');
  const total = app.phasedWeeklyKm(p, app.trainingCaution(p), info, 30).km * app.taperMultiplier(p, BUILD_WEEK);
  // weekNumber 1: no es descarga
  const plan = plain(app.generatePlan(p, 1, BUILD_WEEK));
  const longDay = plan.find(d => d.typeKey === 'long');
  assert.ok(longDay, 'hay tirada larga');
  assert.equal(longDay.dist, Math.min(24, Math.round(total * 0.30)));
  // weekNumber 4: isCutbackWeek -> x 0,8 (la fase y el volumen salen del cronograma, no del número)
  const planCut = plain(app.generatePlan(p, 4, BUILD_WEEK));
  const longCut = planCut.find(d => d.typeKey === 'long');
  assert.equal(longCut.dist, Math.min(24, Math.round(total * 0.30 * 0.8)));
  assert.ok(longCut.dist < longDay.dist);
  // el total semanal sigue el volumen por fases (la tirada solo reparte distinto)
  assert.ok(Math.abs(sumDist(plan) - total) <= 2, `suma ${sumDist(plan)} vs ${total}`);
});

test('generatePlan: sin cronograma activo la tirada es la de v4; por tiempo y principiante no se tocan', () => {
  const p = racingProfile();
  // semana peak: 0,33 del total, bien distinto del peso fijo de v4 para el mismo volumen
  const act = phasedApp(p).app;
  const peakWeek = weekOfPhase(act, p, act.state.phaseSchedule, 'peak', 0);
  const v4 = plain(phasedApp(p, null).app.generatePlan(p, 1, peakWeek));
  const active = plain(act.generatePlan(p, 1, peakWeek));
  const total = sumDist(active);
  const activeLong = active.find(d => d.typeKey === 'long').dist;
  assert.ok(Math.abs(activeLong - 0.33 * total) <= 1.5, `peak: tirada ${activeLong} de ${total}`);
  assert.notEqual(activeLong, v4.find(d => d.typeKey === 'long').dist, 'con fases la tirada cambia');
  const beginner = racingProfile({ runnerType: 'new', weeklyKm: 0, currentWeeklyKm: 0, trainingDays: ['tue', 'thu', 'sun'] });
  assert.deepEqual(plain(phasedApp(beginner, plain(SCHEDULE)).app.generatePlan(beginner, 3, BUILD_WEEK)),
    plain(phasedApp(beginner, null).app.generatePlan(beginner, 3, BUILD_WEEK)));
  // por tiempo (vuelve antes del reparto en km) y principiante: ni siquiera se llama a la función
  const calls = (profile) => {
    const a = phasedApp(profile, plain(SCHEDULE)).app;
    let n = 0;
    const orig = a.applyPhaseLongRun;
    a.applyPhaseLongRun = (...args) => { n++; return orig(...args); };
    a.generatePlan(profile, 1, BUILD_WEEK);
    return n;
  };
  assert.equal(calls(racingProfile({ trainBy: 'time' })), 0, 'por tiempo');
  assert.equal(calls(beginner), 0, 'principiante');
  assert.equal(calls(p), 1, 'distancia no principiante: una vez');
});

test('generatePlan: con 2 días y fases la tirada no pasa del 35% del total semanal', () => {
  const p = racingProfile({ trainingDays: ['wed', 'sun'] });
  const { app } = phasedApp(p);
  // Las semanas con cuestas/series se saltean a propósito: ahí el techo HIGH_IMPACT_SHARE_CAP
  // (0,3 del total para esa única sesión fuerte) corre DESPUÉS y devuelve lo que sobra a la
  // tirada -- con solo 2 sesiones, es imposible cumplir los dos topes a la vez. Las de fartlek
  // también: su dist sale de la estructura armada (fartlekActualKm), no de lo repartido.
  let checked = 0;
  ['base', 'build', 'specific', 'peak', 'taper'].forEach(phase => {
    const week = weekOfPhase(app, p, app.state.phaseSchedule, phase, 0);
    assert.ok(week, phase);
    for (let wn = 1; wn <= 6; wn++) {
      const plan = plain(app.generatePlan(p, wn, week));
      if (plan.some(d => ['hills', 'intervals', 'fartlek'].includes(d.typeKey))) continue;
      const longDay = plan.find(d => d.typeKey === 'long');
      assert.ok(longDay, `${phase} semana ${wn}: hay tirada`);
      checked++;
      assert.ok(longDay.dist <= 0.35 * sumDist(plan) + 1e-9, `${phase} semana ${wn}: ${longDay.dist} de ${sumDist(plan)}`);
    }
  });
  assert.ok(checked >= 10, `se revisaron ${checked} semanas`);
});
