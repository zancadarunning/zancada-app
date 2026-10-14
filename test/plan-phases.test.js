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
  assert.deepEqual(plain(app.state.phaseSchedule), SCHEDULE);
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
  assert.deepEqual(plain(a.app.state.phaseSchedule), { anchor: '2026-11-02', raceDate: '2027-04-04', goal: '21k' });
  assert.equal(a.calls.persist, 1);

  const b = appForRefresh(racingProfile({ goal: '10k' }), SCHEDULE);
  b.app.refreshPhaseSchedule();
  assert.deepEqual(plain(b.app.state.phaseSchedule), { anchor: '2026-11-02', raceDate: '2027-03-14', goal: '10k' });
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
