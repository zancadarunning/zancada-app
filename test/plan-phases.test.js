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

// La foto dorada (test/support/plan-golden-v4.json) se generó UNA vez, a partir de v4 en el commit
// 48759b6 (antes del plan por fases), y NO se regenera: es la prueba de que los usuarios fuera del plan
// por fases reciben exactamente el plan de siempre. Si este test falla, el cambio tocó v4: se arregla
// el código, no la foto.
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
// La rampa arranca en `startKm` (rampStartKm); sin él, en lo que v4 daba la semana del ancla
// (base x weekMultiplier(weekNumber actual + 1), sin descarga): es la entrada al plan desde v4.
// Para un reemplazo, el test pasa como startKm la continuación del cronograma reemplazado.
function withPeak(app, p, base, startKm) {
  const R = app.phaseScheduleR(base);
  const baseKm = app.phaseEffectiveWeeklyKm(p, false);
  const caution = app.trainingCaution(p);
  const start = startKm !== undefined ? startKm : baseKm * app.weekMultiplier((app.state.weekNumber || 1) + 1, caution, true);
  const pk = app.phasePeakFromStart(p.goal, baseKm, start, caution, app.phaseRampSteps(R));
  return Object.assign({}, base, { peakKm: pk.peakKm, limited: pk.limited, baseKm, rampStartKm: start });
}
// Continuación del cronograma `old` en el lunes `monday` con la base del perfil (para withPeak).
const contOf = (app, p, old, monday) => app.phaseContinuationKm(old, monday, app.phaseEffectiveWeeklyKm(p, false), app.trainingCaution(p));

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
  assert.deepEqual(plain(a.app.state.phaseSchedule), withPeak(a.app, a.app.state.profile, { anchor: '2026-11-02', raceDate: '2027-04-04', goal: '21k' }, contOf(a.app, a.app.state.profile, SCHEDULE, '2026-11-02')));
  assert.equal(a.calls.persist, 1);

  const b = appForRefresh(racingProfile({ goal: '10k' }), SCHEDULE);
  b.app.refreshPhaseSchedule();
  assert.deepEqual(plain(b.app.state.phaseSchedule), withPeak(b.app, b.app.state.profile, { anchor: '2026-11-02', raceDate: '2027-03-14', goal: '10k' }, contOf(b.app, b.app.state.profile, SCHEDULE, '2026-11-02')));
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
  // cada sesión se redondea a 5 min (+-2,5) en las dos versiones: hasta ~10 min de desvío; y el reparto
  // de I5 suma en rodaje/tirada lo que las sesiones de calidad (con tope de minutos) no alcanzan
  assert.ok(got >= expected - 10, `minutos rodaje+tirada ${got} vs esperado ${expected} (v4 ${v4}, km ${phasedKm})`);
  const week = plain(app.generatePlan(p, 1, BUILD_WEEK)).reduce((a, d) => a + (d.durMin || 0), 0);
  const targetMin = phasedKm * app.estimateBasePaceMinPerKm(p);
  assert.ok(Math.abs(week - targetMin) <= targetMin * 0.1, `semana ${week} min vs ${targetMin}`);
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
  // antes del ancla, sin cronograma, sin perfil -> null
  app.state.weekStart = PRE_ANCHOR_WEEK;
  app.refreshPhaseNow();
  assert.equal(app.state.phaseNow, null);
  // después de la carrera, con el pico guardado -> recuperación (Task 10)
  app.state.weekStart = '2027-03-15';
  app.refreshPhaseNow();
  assert.deepEqual(plain(app.state.phaseNow), { phase: 'post', weeksToRace: 0, limited: false, peakKm: 54, weeksAfter: 1 });
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

test('rollover pasada la carrera: phaseNow no se queda trabado en taper (pasa a post)', () => {
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
  // el cronograma tiene el pico guardado: la semana siguiente es de recuperación (Task 10)
  assert.equal(app.state.phaseNow.phase, 'post');
  assert.equal(app.state.phaseNow.weeksAfter, 1);
  assert.equal(app.state.phaseNow.weeksToRace, 0);
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
  assert.deepEqual(plain(app.state.phaseSchedule), withPeak(app, app.state.profile, { anchor: '2026-11-02', raceDate: '2027-04-04', goal: '21k' }, contOf(app, p, SCHEDULE, '2026-11-02')));
  const first = plain(app.state.phaseSchedule);
  app.applyProfileChange({ objetivo: '10k' });
  assert.deepEqual(plain(app.state.phaseSchedule), withPeak(app, app.state.profile, { anchor: '2026-11-02', raceDate: '2027-04-04', goal: '10k' }, contOf(app, app.state.profile, first, '2026-11-02')));
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
          // 4+ sesiones: el total se conserva a +-1 km. 2-3 sesiones (regla de tirada más larga
          // que las demás): el total puede quedar más bajo, nunca más alto.
          // (I6: con 4+ sesiones los rodajes quedan por debajo de la tirada; si ese recorte actuó, el
          // total puede bajar -- en generatePlan lo recupera el reparto hasta donde las reglas dejan)
          const easyClamped = used.includes('easy') && distMap.easy === Math.max(1, distMap.long - 1);
          if (used.length >= 4) assert.ok(Math.abs(after - before) <= 1 || (easyClamped && after < before), `${phase} ${used} total ${total} cut ${cut}: ${before} -> ${after}`);
          else assert.ok(after <= before + 1, `${phase} ${used} total ${total} cut ${cut}: ${before} -> ${after}`);
          used.filter(t => t !== 'long').forEach(t => assert.ok(distMap[t] >= 1, `${t} cayó a ${distMap[t]}`));
        });
      });
    });
  });
});

test('applyPhaseLongRun: la tirada puede bajar o crecer (las demás ceden) y las demás nunca bajan de 1 km', () => {
  const { app } = phasedApp(racingProfile(), null);
  // la tirada del reparto proporcional (1,5 de 4,15 unidades) pesa más que 0,32 de la semana: baja
  const used = USED4;
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

test('applyPhaseLongRun: con 4 o más sesiones la tirada nunca supera el 35% del total', () => {
  const { app } = phasedApp(racingProfile(), null);
  [USED4, ['easy', 'easy', 'tempo', 'easy', 'long'], ['easy', 'hills', 'easy', 'fartlek', 'long']].forEach(used => {
    ['base', 'build', 'specific', 'peak', 'taper'].forEach(phase => {
      [28, 40, 55, 70].forEach(total => {
        [false, true].forEach(cut => {
          const distMap = lrDist(used, total);
          app.applyPhaseLongRun(distMap, used, total, { active: true, phase }, '42k', cut, LR_RATIO);
          const sum = lrTotal(distMap, used);
          assert.ok(distMap.long <= 0.35 * sum + 1e-9, `${used} ${phase} total ${total} cut ${cut}: ${distMap.long} de ${sum}`);
        });
      });
    });
  });
});

// Series de sesiones de 2 y 3 días, con y sin cuestas / series / fartlek.
const SHORT_SETS = [
  ['easy', 'long'], ['tempo', 'long'], ['progression', 'long'], ['intervals', 'long'], ['hills', 'long'], ['fartlek', 'long'],
  ['easy', 'tempo', 'long'], ['easy', 'intervals', 'long'], ['hills', 'easy', 'long'], ['fartlek', 'progression', 'long'], ['easy', 'easy', 'long'],
];
const ALL_GOALS = ['5k', '10k', '15k', '21k', '42k'];
const LR_CAP = { '5k': 12, '10k': 16, '15k': 20, '21k': 24, '42k': 32 };
const LR_PHASES = ['base', 'build', 'specific', 'peak', 'taper'];

test('applyPhaseLongRun: con 2 o 3 sesiones la tirada es estrictamente más larga que cualquier otra (barrido de metas x fases x totales x series)', () => {
  const { app } = phasedApp(racingProfile(), null);
  let cases = 0;
  ALL_GOALS.forEach(goal => LR_PHASES.forEach(phase => [15, 20, 28, 35, 42, 55, 75].forEach(total => SHORT_SETS.forEach(used => [false, true].forEach(cut => {
    const distMap = lrDist(used, total);
    app.applyPhaseLongRun(distMap, used, total, { active: true, phase }, goal, cut, LR_RATIO);
    used.filter(t => t !== 'long').forEach(t => {
      assert.ok(distMap.long > distMap[t], `${goal} ${phase} ${total} ${used} cut ${cut}: long ${distMap.long} vs ${t} ${distMap[t]}`);
      assert.ok(distMap[t] >= 1);
    });
    assert.ok(distMap.long <= LR_CAP[goal]);
    cases++;
  })))));
  assert.ok(cases > 1000, `${cases}`);
});

test('applyPhaseLongRun: los seis ejemplos de semanas cortas del review dejan la tirada por encima de todas las demás', () => {
  const { app } = phasedApp(racingProfile(), null);
  const examples = [
    ['10k', 'build', 35, ['easy', 'long'], 16],
    ['42k', 'build', 55, ['tempo', 'long'], 31],
    ['42k', 'peak', 75, ['progression', 'long'], 32],
    ['42k', 'peak', 75, ['easy', 'tempo', 'long'], 30],
    ['42k', 'build', 55, ['easy', 'tempo', 'long'], 22],
    ['10k', 'peak', 42, ['easy', 'tempo', 'long'], 16],
  ];
  examples.forEach(([goal, phase, total, used, expectedLong]) => {
    const distMap = lrDist(used, total);
    app.applyPhaseLongRun(distMap, used, total, { active: true, phase }, goal, false, LR_RATIO);
    assert.equal(distMap.long, expectedLong, `${goal} ${phase} ${total} ${used}`);
    used.filter(t => t !== 'long').forEach(t => assert.ok(distMap.long > distMap[t], `${goal} ${phase} ${total} ${used}: long ${distMap.long} vs ${t} ${distMap[t]}`));
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
  assert.equal(d5.long, 12, '5k pico: round(35 x 0,33) = 12, justo el tope');
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
  // la proporción de la fase, o algo más si el reparto de I5 la hizo crecer (rodajes ya en tirada - 1)
  assert.ok(longDay.dist >= Math.min(24, Math.round(total * 0.30)) && longDay.dist <= 24, `tirada ${longDay.dist}`);
  // weekNumber 4 ya no es descarga con fases (manda phaseIsCutbackWeek): la misma tirada
  assert.equal(plain(app.generatePlan(p, 4, BUILD_WEEK)).find(d => d.typeKey === 'long').dist, longDay.dist);
  // la descarga es la de la rampa (weekIdx 7, 2026-12-21, build): x 0,8 sobre su propio total
  const CUT_WEEK = '2026-12-21';
  const cutInfo = plain(app.phaseForWeek(p, CUT_WEEK, app.state.phaseSchedule));
  assert.equal(app.phaseIsCutbackWeek(cutInfo), true);
  const cutTotal = app.phasedWeeklyKm(p, app.trainingCaution(p), cutInfo, 30).km;
  const longCut = plain(app.generatePlan(p, 1, CUT_WEEK)).find(d => d.typeKey === 'long');
  assert.ok(longCut.dist >= Math.min(24, Math.round(cutTotal * 0.30 * 0.8)), `tirada de descarga ${longCut.dist}`);
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

test('generatePlan: con 2 días y fases la tirada es la sesión más larga y no pasa del tope (también con cuestas, series y fartlek)', () => {
  const p = racingProfile({ trainingDays: ['wed', 'sun'] });
  const { app } = phasedApp(p);
  const seen = new Set();
  LR_PHASES.forEach(phase => {
    const week = weekOfPhase(app, p, app.state.phaseSchedule, phase, 0);
    assert.ok(week, phase);
    for (let wn = 1; wn <= 8; wn++) {
      const plan = plain(app.generatePlan(p, wn, week));
      const longDay = plan.find(d => d.typeKey === 'long');
      assert.ok(longDay, `${phase} semana ${wn}: hay tirada`);
      plan.filter(d => d.typeKey !== 'rest' && d.typeKey !== 'long').forEach(d => {
        seen.add(d.typeKey);
        assert.ok(longDay.dist > d.dist, `${phase} semana ${wn}: tirada ${longDay.dist} vs ${d.typeKey} ${d.dist}`);
      });
      assert.ok(longDay.dist <= LR_CAP['21k'], `${phase} semana ${wn}: ${longDay.dist}`);
    }
  });
  assert.ok(seen.has('hills') || seen.has('intervals'), `se cubrió cuestas/series: ${[...seen]}`);
  assert.ok(seen.has('fartlek'), `se cubrió fartlek: ${[...seen]}`);
});

test('generatePlan: el recorte de HIGH_IMPACT_SHARE_CAP no hace pasar a la tirada del tope de la distancia (barrido con cuestas / series)', () => {
  const dayChoices = [['wed', 'sun'], ['tue', 'sun'], ['tue', 'thu', 'sun'], ['tue', 'wed', 'fri', 'sun'], ['mon', 'tue', 'thu', 'fri', 'sun']];
  let withHigh = 0, cases = 0;
  ALL_GOALS.forEach(goal => dayChoices.forEach(trainingDays => [20, 35, 50, 70].forEach(km => {
    const p = racingProfile({ goal, trainingDays, weeklyKm: km, currentWeeklyKm: km });
    const schedule = { anchor: '2026-11-02', raceDate: '2027-03-14', goal };
    const { app } = phasedApp(p, schedule);
    LR_PHASES.forEach(phase => {
      const week = weekOfPhase(app, p, schedule, phase, 0);
      if (!week) return;
      for (let wn = 1; wn <= 8; wn++) {
        const plan = plain(app.generatePlan(p, wn, week));
        const longDay = plan.find(d => d.typeKey === 'long');
        cases++;
        if (plan.some(d => d.typeKey === 'hills' || d.typeKey === 'intervals')) withHigh++;
        if (!longDay) continue;
        // tope escalado por el pico de la persona (I6), nunca más de x1,5 el de la distancia
        const info = app.phaseForWeek(p, week, schedule);
        const peak = app.phasedWeeklyKm(p, app.trainingCaution(p), info, app.phaseEffectiveWeeklyKm(p, false)).peakKm;
        const cap = app.phaseLongCapKm(goal, peak);
        assert.ok(cap >= LR_CAP[goal] && cap <= Math.round(LR_CAP[goal] * 1.5), `${goal} ${km}: tope ${cap}`);
        assert.ok(longDay.dist <= cap, `${goal} ${trainingDays} ${km} km ${phase} semana ${wn}: tirada ${longDay.dist} > ${cap}`);
      }
    });
  })));
  assert.ok(withHigh > 50, `semanas con cuestas o series: ${withHigh} de ${cases}`);
});

// ---- Task 8: ritmo de carrera en las sesiones (racePaceSec / racePaceBlockKm) ----

const RP_GOAL_KM = { '5k': 5, '10k': 10, '15k': 15, '21k': 21.0975, '42k': 42.195 };
const RP_KEYS = ['desc_racepace_suffix', 'desc_racepace_long_suffix'];

// App con cronograma de la meta pedida (carrera 2027-03-14) y, si `withPrediction`, una marca de
// referencia de 10 km en 50:00 (predictRaceBase la usa como refRace cuando no hay carreras).
function racePaceApp(overrides, withPrediction) {
  const goal = (overrides && overrides.goal) || '21k';
  const p = racingProfile(Object.assign({ goal }, overrides || {}));
  if (withPrediction !== false) p.refRace = { distanceKm: 10, durationSec: 3000 };
  const schedule = { anchor: '2026-11-02', raceDate: '2027-03-14', goal };
  const { app } = phasedApp(p, schedule);
  return { app, p, schedule };
}
const expectedRacePace = (app, goal) => Math.round(plain(app.predictRaceTime(RP_GOAL_KM[goal])).predictedSec / RP_GOAL_KM[goal]);
// Los días de las semanas 1..8 de numeracion (cambia la rotacion) de la primera semana de una fase.
function rpPlans(app, p, schedule, phase) {
  const week = weekOfPhase(app, p, schedule, phase, 0);
  assert.ok(week, `hay una semana ${phase}`);
  const out = [];
  for (let wn = 1; wn <= 8; wn++) out.push(...plain(app.generatePlan(p, wn, week)));
  return out;
}
const isRpType = d => d.typeKey === 'tempo' || d.typeKey === 'intervals';
const NO_RP_TEXT = 'objetivo de tu carrera';

test('phaseRacePaceSec: seg/km a partir de predictRaceTime; null sin datos o con meta desconocida', () => {
  const { app } = racePaceApp({ goal: '10k' });
  Object.keys(RP_GOAL_KM).forEach(goal => {
    const km = RP_GOAL_KM[goal];
    assert.equal(app.phaseRacePaceSec(goal), plain(app.predictRaceTime(km)).predictedSec / km, goal);
  });
  assert.equal(app.phaseRacePaceSec('nope'), null);
  assert.equal(app.phaseRacePaceSec(undefined), null);
  const sin = racePaceApp({ goal: '10k' }, false).app;
  assert.equal(sin.phaseRacePaceSec('10k'), null, 'sin marcas no hay prediccion');
  // getGoalRaceKm sigue leyendo el perfil
  assert.equal(app.getGoalRaceKm(), 10);
});

test('racePaceSec: en specific con prediccion lo lleva la sesion de la distancia (= round(predicha / km)): series en 10k, tempo en 21k', () => {
  ['10k', '21k'].forEach(goal => {
    const { app, p, schedule } = racePaceApp({ goal });
    const want = expectedRacePace(app, goal);
    const hard = rpPlans(app, p, schedule, 'specific').filter(isRpType);
    // (la rotacion de 21k en specific solo usa tempo; la de 10k, tempo e intervals)
    assert.ok(hard.some(d => d.typeKey === 'tempo'), `${goal}: hay tempo`);
    if(goal === '10k') assert.ok(hard.some(d => d.typeKey === 'intervals'), '10k: hay intervals');
    const carrier = goal === '10k' ? 'intervals' : 'tempo';
    hard.forEach(d => {
      if (d.typeKey === carrier) assert.equal(d.racePaceSec, want, `${goal} ${d.typeKey}`);
      else assert.equal('racePaceSec' in d, false, `${goal} ${d.typeKey}`);
    });
  });
});

test('racePaceSec: sin prediccion no hay campos nuevos y el texto es el de siempre', () => {
  const { app, p, schedule } = racePaceApp({ goal: '21k' }, false);
  ['specific', 'peak', 'taper'].forEach(phase => {
    rpPlans(app, p, schedule, phase).forEach(d => {
      assert.equal('racePaceSec' in d, false, `${phase} ${d.typeKey}`);
      assert.equal('racePaceBlockKm' in d, false, `${phase} ${d.typeKey}`);
      assert.ok(!plain(app.planLabelBody(d)).desc.includes(NO_RP_TEXT), `${phase} ${d.typeKey}`);
    });
  });
});

test('racePaceSec: base y build nunca lo llevan (tampoco bloque en la tirada)', () => {
  const { app, p, schedule } = racePaceApp({ goal: '21k' });
  ['base', 'build'].forEach(phase => {
    const days = rpPlans(app, p, schedule, phase);
    assert.ok(days.length > 0);
    days.forEach(d => {
      assert.equal('racePaceSec' in d, false, `${phase} ${d.typeKey}`);
      assert.equal('racePaceBlockKm' in d, false, `${phase} ${d.typeKey}`);
    });
  });
});

test('racePaceSec: sin cronograma activo (v4) no hay campos nuevos', () => {
  const p = racingProfile({ goal: '21k' });
  p.refRace = { distanceKm: 10, durationSec: 3000 };
  const { app } = phasedApp(p, null);
  for (let wn = 1; wn <= 6; wn++) plain(app.generatePlan(p, wn, '2026-11-30')).forEach(d => {
    assert.equal('racePaceSec' in d, false);
    assert.equal('racePaceBlockKm' in d, false);
  });
});

test('racePaceSec: en taper la sesion de la distancia lo lleva pero la tirada no tiene bloque', () => {
  const { app, p, schedule } = racePaceApp({ goal: '10k' });
  const want = expectedRacePace(app, '10k');
  const days = rpPlans(app, p, schedule, 'taper');
  const hard = days.filter(d => d.typeKey === 'intervals');
  assert.ok(hard.length > 0, 'el taper conserva alguna sesion de ritmo');
  hard.forEach(d => assert.equal(d.racePaceSec, want, d.typeKey));
  days.filter(d => d.typeKey === 'tempo').forEach(d => assert.equal('racePaceSec' in d, false, '10k tempo'));
  // tampoco con 21k/42k
  ['10k', '21k', '42k'].forEach(goal => {
    const c = racePaceApp({ goal });
    rpPlans(c.app, c.p, c.schedule, 'taper').filter(d => d.typeKey === 'long').forEach(d => {
      assert.equal('racePaceBlockKm' in d, false, goal);
      assert.equal('racePaceSec' in d, false, goal);
    });
  });
});

test('racePaceBlockKm: tirada de specific/peak en 21k y 42k = max(1, round(dist x 0,3)) con el ritmo; 10k no', () => {
  ['21k', '42k'].forEach(goal => {
    const { app, p, schedule } = racePaceApp({ goal });
    const want = expectedRacePace(app, goal);
    ['specific', 'peak'].forEach(phase => {
      const longs = rpPlans(app, p, schedule, phase).filter(d => d.typeKey === 'long');
      assert.ok(longs.length > 0, `${goal} ${phase}`);
      longs.forEach(d => {
        assert.equal(d.racePaceBlockKm, Math.max(1, Math.round(d.dist * 0.3)), `${goal} ${phase} dist ${d.dist}`);
        assert.equal(d.racePaceSec, want, `${goal} ${phase}`);
      });
    });
  });
  const c = racePaceApp({ goal: '10k' });
  ['specific', 'peak'].forEach(phase => rpPlans(c.app, c.p, c.schedule, phase).filter(d => d.typeKey === 'long').forEach(d => {
    assert.equal('racePaceBlockKm' in d, false, '10k ' + phase);
    assert.equal('racePaceSec' in d, false, '10k ' + phase);
  }));
});

test('racePaceSec / racePaceBlockKm: no tocan dist, y las sesiones faciles no los llevan', () => {
  const a = racePaceApp({ goal: '21k' });
  const b = racePaceApp({ goal: '21k' }, false);
  const withP = rpPlans(a.app, a.p, a.schedule, 'specific');
  const without = rpPlans(b.app, b.p, b.schedule, 'specific');
  assert.deepEqual(withP.map(d => d.dist), without.map(d => d.dist));
  withP.filter(d => !isRpType(d) && d.typeKey !== 'long').forEach(d => assert.equal('racePaceSec' in d, false, d.typeKey));
});

test('racePaceSec: por tiempo, tempo e intervals de specific/peak/taper lo llevan; base/build no; la tirada no tiene bloque', () => {
  const { app, p, schedule } = racePaceApp({ goal: '21k', trainBy: 'time' });
  const want = expectedRacePace(app, '21k');
  ['specific', 'peak', 'taper'].forEach(phase => {
    const days = rpPlans(app, p, schedule, phase);
    days.filter(isRpType).forEach(d => { assert.equal(d.racePaceSec, want, `${phase} ${d.typeKey}`); assert.equal(d.timeBased, true); });
    days.filter(d => !isRpType(d)).forEach(d => {
      assert.equal('racePaceSec' in d, false, `${phase} ${d.typeKey}`);
      assert.equal('racePaceBlockKm' in d, false, `${phase} ${d.typeKey}`);
    });
  });
  assert.ok(rpPlans(app, p, schedule, 'specific').some(isRpType));
  ['base', 'build'].forEach(phase => rpPlans(app, p, schedule, phase).forEach(d => assert.equal('racePaceSec' in d, false, phase)));
  const sin = racePaceApp({ goal: '21k', trainBy: 'time' }, false);
  rpPlans(sin.app, sin.p, sin.schedule, 'specific').forEach(d => assert.equal('racePaceSec' in d, false));
});

test('planLabelBody: el sufijo del ritmo de carrera va al final, en tempo/intervals y en la tirada (con bloque)', () => {
  const { app, p, schedule } = racePaceApp({ goal: '21k' });
  const days = rpPlans(app, p, schedule, 'specific');
  const tempo = days.find(d => d.typeKey === 'tempo');
  const ten = racePaceApp({ goal: '10k' });
  const inter = rpPlans(ten.app, ten.p, ten.schedule, 'specific').find(d => d.typeKey === 'intervals');
  const long = days.find(d => d.typeKey === 'long');
  assert.ok(inter && tempo && long);
  const pace = app.fmtPace(tempo.racePaceSec / 60);
  const suffix = app.t('desc_racepace_suffix', { pace, unit: 'km' });
  assert.ok(suffix.includes(pace) && !suffix.includes('{'), suffix);
  assert.ok(plain(app.planLabelBody(tempo)).desc.endsWith(' ' + suffix));
  const interSuffix = ten.app.t('desc_racepace_suffix', { pace: ten.app.fmtPace(inter.racePaceSec / 60), unit: 'km' });
  assert.ok(plain(ten.app.planLabelBody(inter)).desc.endsWith(' ' + interSuffix));
  const longSuffix = app.t('desc_racepace_long_suffix', { km: app.fmtDist(long.racePaceBlockKm, 1), pace, unit: 'km' });
  assert.ok(longSuffix.includes(pace) && !longSuffix.includes('{'), longSuffix);
  assert.ok(plain(app.planLabelBody(long)).desc.endsWith(' ' + longSuffix));
  // con el test de nivel hecho: el tempo con ritmo de carrera NO suma el rango del test (un solo ritmo,
  // ver I2) y la tirada con bloque lleva primero su rango suave y al final el sufijo del bloque
  p.levelTest = { done: true, vdot: 45, paces: { easy: [5.8, 6.6], tempo: [4.7, 4.9], interval: [4.2, 4.4] } };
  const withHint = plain(app.planLabelBody(tempo)).desc;
  const hint = app.t('desc_pace_hint', { range: app.fmtPaceRange(p.levelTest.paces.tempo), unit: 'km' });
  assert.ok(!withHint.includes(hint), withHint);
  assert.ok(withHint.endsWith(suffix));
  const longHint = app.t('desc_pace_hint', { range: app.fmtPaceRange(p.levelTest.paces.easy), unit: 'km' });
  const longDesc = plain(app.planLabelBody(long)).desc;
  assert.ok(longDesc.indexOf(longHint) >= 0 && longDesc.indexOf(longHint) < longDesc.indexOf(longSuffix), longDesc);
});

test('planLabelBody: sin los campos nuevos (o en dias custom) el texto es el de siempre', () => {
  const { app, p, schedule } = racePaceApp({ goal: '21k' });
  const days = rpPlans(app, p, schedule, 'specific');
  const tempo = days.find(d => d.typeKey === 'tempo');
  const bare = Object.assign({}, tempo); delete bare.racePaceSec;
  assert.ok(!plain(app.planLabelBody(bare)).desc.includes(NO_RP_TEXT));
  // un dia custom no suma el sufijo aunque tenga el campo
  const custom = Object.assign({}, tempo, { custom: true, desc: 'Texto del coach', type: 'Tempo' });
  assert.equal(plain(app.planLabelBody(custom)).desc, 'Texto del coach');
  // una tirada con racePaceSec pero sin bloque no suma el sufijo largo
  const long = Object.assign({}, days.find(d => d.typeKey === 'long')); delete long.racePaceBlockKm;
  assert.ok(!plain(app.planLabelBody(long)).desc.includes(NO_RP_TEXT));
  // el ritmo de carrera solo se muestra en tempo/intervals/long
  const easy = { day: 'tue', typeKey: 'easy', dist: 6, zone: 2, terrain: 'asfalto', racePaceSec: 330 };
  assert.ok(!plain(app.planLabelBody(easy)).desc.includes(NO_RP_TEXT));
});

test('planLabelBody: en imperial el ritmo y la unidad se muestran por milla', () => {
  const { app, p, schedule } = racePaceApp({ goal: '21k', units: 'imperial' });
  const days = rpPlans(app, p, schedule, 'specific');
  const tempo = days.find(d => d.typeKey === 'tempo');
  const long = days.find(d => d.typeKey === 'long');
  const perMi = tempo.racePaceSec / 60 * 1.609344;
  const expectedPace = `${Math.floor(perMi)}:${String(Math.round((perMi % 1) * 60)).padStart(2, '0')}`;
  const desc = plain(app.planLabelBody(tempo)).desc;
  assert.ok(desc.endsWith(app.t('desc_racepace_suffix', { pace: expectedPace, unit: 'mi' })), desc);
  assert.ok(!desc.includes('/km'), desc);
  const longDesc = plain(app.planLabelBody(long)).desc;
  const miBlock = (long.racePaceBlockKm / 1.609344).toFixed(1);
  assert.equal(app.fmtDist(long.racePaceBlockKm, 1), miBlock, 'el bloque esta en millas');
  assert.ok(longDesc.endsWith(app.t('desc_racepace_long_suffix', { km: miBlock, pace: expectedPace, unit: 'mi' })), longDesc);
});

test('locales: las seis definen desc_racepace_suffix y desc_racepace_long_suffix con los mismos marcadores', () => {
  const vm = require('node:vm');
  ['es', 'en', 'pt', 'fr', 'it', 'de'].forEach(loc => {
    const sandbox = {}; sandbox.window = sandbox; vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'locales', loc + '.js'), 'utf8'), sandbox);
    const dict = sandbox.I18N[loc];
    RP_KEYS.forEach(k => assert.ok(typeof dict[k] === 'string' && dict[k].length > 10, `${loc}.${k}`));
    assert.deepEqual(dict.desc_racepace_suffix.match(/\{\w+\}/g).sort(), ['{pace}', '{unit}']);
    assert.deepEqual(dict.desc_racepace_long_suffix.match(/\{\w+\}/g).sort(), ['{km}', '{pace}', '{unit}', '{unit}']);
  });
});

// ---- Task 9: aviso de fase en la pantalla del plan y contexto de Zonda ----
const PHASE_KEYS = ['plan_phase_base', 'plan_phase_build', 'plan_phase_specific', 'plan_phase_peak', 'plan_phase_taper',
  'plan_phase_line', 'plan_phase_line_one', 'plan_phase_line_race', 'plan_peak_limited_note'];
const PHASE_NAMES = ['base', 'build', 'specific', 'peak', 'taper'];

// Una app con el reloj congelado y renderPlan listo para correr con elementos de mentira
// propios (uno por id), para poder leer lo que escribe en #plan-phase-note.
function planScreenApp(phaseNow, overrides) {
  const p = racingProfile(overrides);
  p.hrZones = { 1: { min: 100, max: 120 }, 2: { min: 120, max: 140 }, 3: { min: 140, max: 155 }, 4: { min: 155, max: 170 }, 5: { min: 170, max: 185 } };
  const { app } = phasedApp(p, plain(SCHEDULE));
  app.state.weekStart = BUILD_WEEK;
  app.state.weekNumber = 1;
  app.state.plan = plain(app.generatePlan(p, 1, BUILD_WEEK));
  app.state.phaseNow = phaseNow;
  const els = {};
  app.document.getElementById = (id) => {
    if (!els[id]) els[id] = { id, style: {}, textContent: '', innerHTML: '', disabled: false, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, querySelectorAll: () => [], querySelector: () => null, setAttribute() {}, addEventListener() {} };
    return els[id];
  };
  return { app, els };
}

test('plan en pantalla: con fase activa, #plan-phase-note muestra plan_phase_line con la fase y las semanas', () => {
  const { app, els } = planScreenApp({ phase: 'build', weeksToRace: 12, limited: false, peakKm: 50 });
  app.renderPlan();
  const note = els['plan-phase-note'];
  assert.equal(note.textContent, app.t('plan_phase_line', { phase: app.t('plan_phase_build'), weeks: 12 }));
  assert.notEqual(note.style.display, 'none');
  assert.ok(!note.textContent.includes(app.t('plan_peak_limited_note', { km: 50, unit: 'km' })), 'sin limited no hay nota del pico');
});

test('plan en pantalla: 1 semana usa plan_phase_line_one y la semana de la carrera plan_phase_line_race', () => {
  const one = planScreenApp({ phase: 'peak', weeksToRace: 1, limited: false, peakKm: 50 });
  one.app.renderPlan();
  assert.equal(one.els['plan-phase-note'].textContent, one.app.t('plan_phase_line_one', { phase: one.app.t('plan_phase_peak') }));
  const race = planScreenApp({ phase: 'taper', weeksToRace: 0, limited: false, peakKm: 50 });
  race.app.renderPlan();
  assert.equal(race.els['plan-phase-note'].textContent, race.app.t('plan_phase_line_race', { phase: race.app.t('plan_phase_taper') }));
});

test('plan en pantalla: con limited y peakKm finito se agrega plan_peak_limited_note (km redondeados)', () => {
  const { app, els } = planScreenApp({ phase: 'base', weeksToRace: 5, limited: true, peakKm: 42.4 });
  app.renderPlan();
  const text = els['plan-phase-note'].textContent;
  assert.ok(text.startsWith(app.t('plan_phase_line', { phase: app.t('plan_phase_base'), weeks: 5 })), text);
  assert.ok(text.includes(app.t('plan_peak_limited_note', { km: '42', unit: 'km' })), text);
});

test('plan en pantalla: la nota del pico sale en millas para un usuario imperial', () => {
  const { app, els } = planScreenApp({ phase: 'base', weeksToRace: 5, limited: true, peakKm: 40 }, { units: 'imperial' });
  app.renderPlan();
  const text = els['plan-phase-note'].textContent;
  assert.ok(text.includes(app.t('plan_peak_limited_note', { km: app.fmtDist(40, 0), unit: 'mi' })), text);
  assert.ok(text.includes('25 mi'), text);
});

test('plan en pantalla: limited con peakKm indefinido no imprime la nota ni rompe', () => {
  [undefined, NaN, null].forEach(peakKm => {
    const { app, els } = planScreenApp({ phase: 'base', weeksToRace: 5, limited: true, peakKm });
    app.renderPlan();
    assert.equal(els['plan-phase-note'].textContent, app.t('plan_phase_line', { phase: app.t('plan_phase_base'), weeks: 5 }), String(peakKm));
  });
});

test('plan en pantalla: en semanas no actuales (pasada, siguiente, futura) el aviso de fase y la nota del pico se ocultan', () => {
  ['past', 'next', 'future'].forEach(mode => {
    const { app, els } = planScreenApp({ phase: 'base', weeksToRace: 5, limited: true, peakKm: 42 });
    const real = app.getWeekData;
    app.getWeekData = (offset) => Object.assign({}, real(0), { mode, editable: false });
    app.renderPlan();
    assert.equal(els['plan-phase-note'].textContent, '', mode);
    assert.equal(els['plan-phase-note'].style.display, 'none', mode);
  });
});

test('plan en pantalla: en la semana actual (offset 0) el aviso sí se muestra (el filtro no lo oculta siempre)', () => {
  const { app, els } = planScreenApp({ phase: 'base', weeksToRace: 5, limited: true, peakKm: 42 });
  assert.equal(app.getWeekData(0).mode, 'current');
  app.renderPlan();
  assert.ok(els['plan-phase-note'].textContent.length > 0);
  assert.equal(els['plan-phase-note'].style.display, 'block');
});

test('index.html tiene el elemento #plan-phase-note que busca renderPlan (el DOM de mentira no detectaría un id distinto)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="plan-phase-note"/);
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').includes("getElementById('plan-phase-note')"));
});

test('plan en pantalla: sin fase activa (phaseNow null) no se muestra nada nuevo', () => {
  const { app, els } = planScreenApp(null);
  app.renderPlan();
  assert.equal(els['plan-phase-note'].textContent, '');
  assert.equal(els['plan-phase-note'].style.display, 'none');
});

// (contexto de Zonda con fase activa: ver la prueba M2 más abajo -- solo la fase, sin un segundo conteo de semanas)

test('contexto de Zonda: sin fase activa el texto es exactamente el de siempre (ni el volumen pico)', () => {
  const { app } = planScreenApp(null);
  const ctx = app.buildContext();
  assert.ok(!ctx.includes('Fase actual del plan'), 'no hay frase de fase');
  app.state.phaseNow = { phase: 'base', weeksToRace: 12, limited: true, peakKm: 77 };
  assert.ok(!app.buildContext().includes('77'), 'nunca se le pasa el pico');
});

test('locales: las seis definen las claves de fase del plan con sus marcadores', () => {
  const vm = require('node:vm');
  ['es', 'en', 'pt', 'fr', 'it', 'de'].forEach(loc => {
    const sandbox = {}; sandbox.window = sandbox; vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'locales', loc + '.js'), 'utf8'), sandbox);
    const dict = sandbox.I18N[loc];
    PHASE_KEYS.forEach(k => assert.ok(typeof dict[k] === 'string' && dict[k].length >= 3, `${loc}.${k}`));
    assert.deepEqual(dict.plan_phase_line.match(/\{\w+\}/g).sort(), ['{phase}', '{weeks}'], loc);
    assert.deepEqual(dict.plan_phase_line_one.match(/\{\w+\}/g), ['{phase}'], loc);
    assert.deepEqual(dict.plan_phase_line_race.match(/\{\w+\}/g), ['{phase}'], loc);
    assert.deepEqual(dict.plan_peak_limited_note.match(/\{\w+\}/g).sort(), ['{km}', '{unit}'], loc);
  });
});

// ---- Task 10: después de la carrera (recuperación y mantenimiento) ----
// Cronograma de 10k con el pico ya guardado (50 km): carrera el domingo 2027-03-14, lunes de la
// semana de la carrera 2027-03-08. Las semanas siguientes pasan a 'post' (2) y 'maintenance'.
const POST_SCHEDULE = { anchor: '2026-11-02', raceDate: '2027-03-14', goal: '10k', peakKm: 50, limited: false };
const POST_W1 = '2027-03-15';
const POST_W2 = '2027-03-22';
const MAINT_W1 = '2027-03-29';
const POST_HEAVY = ['intervals', 'tempo', 'hills', 'fartlek', 'progression', 'long'];
// 5 días: el rodaje suave reparte 30 y 40 km sin el redondeo de x,5 de 4 sesiones.
const postProfile = overrides => racingProfile(Object.assign({ goal: '10k', trainingDays: ['mon', 'tue', 'thu', 'fri', 'sun'] }, overrides || {}));
function postApp(overrides, schedule, nowIso) {
  return phasedApp(postProfile(overrides), schedule === undefined ? plain(POST_SCHEDULE) : schedule, nowIso || '2027-03-17T12:00:00');
}

test('phaseForWeek: con peakKm guardado, las 2 semanas después de la carrera son post y después maintenance', () => {
  const app = loadApp();
  const p = postProfile();
  const at = week => plain(app.phaseForWeek(p, week, POST_SCHEDULE));
  assert.deepEqual(at(POST_W1), { active: true, phase: 'post', weekIdx: 19, R: 16, weeksToRace: 0, weekInPhase: 1, phaseWeeks: 2, weeksAfter: 1, peakKm: 50 });
  assert.deepEqual(at(POST_W2), { active: true, phase: 'post', weekIdx: 20, R: 16, weeksToRace: 0, weekInPhase: 2, phaseWeeks: 2, weeksAfter: 2, peakKm: 50 });
  assert.deepEqual(at(MAINT_W1), { active: true, phase: 'maintenance', weekIdx: 21, R: 16, weeksToRace: 0, weekInPhase: 1, phaseWeeks: null, weeksAfter: 3, peakKm: 50 });
  // la semana de la carrera sigue siendo taper
  assert.equal(at('2027-03-08').phase, 'taper');
  // peakKm no numérico -> inactivo como antes
  [undefined, null, NaN, '50'].forEach(peakKm => {
    const s = Object.assign({}, POST_SCHEDULE, { peakKm });
    assert.deepEqual(plain(app.phaseForWeek(p, POST_W1, s)), { active: false }, String(peakKm));
  });
});

test('phasedWeeklyKm: post 1 = pico x 0,6 (30), post 2 = x 0,8 (40), maintenance = x 0,85 (42,5) con descarga cada 4 semanas', () => {
  const app = loadApp();
  const p = postProfile();
  const caution = app.trainingCaution(p);
  const km = week => plain(app.phasedWeeklyKm(p, caution, app.phaseForWeek(p, week, POST_SCHEDULE), 30));
  assert.deepEqual(km(POST_W1), { km: 30, peakKm: 50, limited: false });
  assert.deepEqual(km(POST_W2), { km: 40, peakKm: 50, limited: false });
  for (let i = 0; i < 20; i++) {
    const week = app.addDaysToIsoLocal(MAINT_W1, i * 7);
    const info = plain(app.phaseForWeek(p, week, POST_SCHEDULE));
    assert.equal(info.phase, 'maintenance', week);
    assert.equal(info.weeksAfter, 3 + i, week);
    // cada 4ta semana de mantenimiento es descarga (x0,75)
    const got = km(week);
    assert.deepEqual(Object.assign({}, got, { km: Math.round(got.km * 1e6) / 1e6 }), { km: (i + 1) % 4 === 0 ? 31.875 : 42.5, peakKm: 50, limited: false }, week);
  }
  // usa el pico del cronograma, no el que saldría de baseKm
  assert.equal(app.phasedWeeklyKm(p, caution, app.phaseForWeek(p, POST_W1, POST_SCHEDULE), 12).km, 30);
});

test('generatePlan: en post no hay sesiones fuertes ni tirada larga y el total es ~30 y ~40 km (sin descontar 0,6 dos veces)', () => {
  const { app } = postApp();
  const p = app.state.profile;
  [[POST_W1, 30], [POST_W2, 40]].forEach(([week, expected]) => {
    for (let wn = 1; wn <= 6; wn++) {
      const plan = plain(app.generatePlan(p, wn, week));
      const types = plan.map(d => d.typeKey);
      POST_HEAVY.forEach(k => assert.ok(!types.includes(k), `${week} semana ${wn}: ${types}`));
      assert.ok(Math.abs(sumDist(plan) - expected) <= 1.5, `${week} semana ${wn}: suma ${sumDist(plan)} vs ${expected}`);
    }
  });
});

test('generatePlan: en post la recuperación de "Próximos eventos" de la misma carrera tampoco se aplica encima', () => {
  const { app } = postApp();
  app.state.lastEventDate = '2027-03-14';
  const plan = plain(app.generatePlan(app.state.profile, 1, POST_W1));
  assert.ok(Math.abs(sumDist(plan) - 30) <= 1.5, `suma ${sumDist(plan)}`);
});

test('generatePlan: maintenance usa la rotación de v4 y el volumen de mantenimiento (42,5 km, +-10%)', () => {
  // 5 días: la tirada de v4 (~12 km) queda bajo el tope de 10k, así que el clamp no la toca.
  for (let wn = 1; wn <= 6; wn++) {
    [MAINT_W1, '2027-05-03'].forEach(week => {
      const got = postApp().app;
      const v4 = postApp({}, null).app;
      // v4 con el mismo volumen semanal: weekMultiplier forzado a 42,5 / 30; la descarga de intensidad
      // sigue a la del mantenimiento (ninguna de estas dos semanas lo es), no a weekNumber
      v4.weekMultiplier = () => 42.5 / 30;
      v4.isCutbackWeek = () => false;
      const a = plain(got.generatePlan(got.state.profile, wn, week));
      const b = plain(v4.generatePlan(v4.state.profile, wn, week));
      // mismas sesiones que v4 (rotación por meta); los km pueden moverse por el reparto de lo que
      // fartlek / cuestas no entregan (I5) y por los rodajes debajo de la tirada (I6)
      assert.deepEqual(a.map(d => d.typeKey), b.map(d => d.typeKey), `${week} semana ${wn}`);
      assert.ok(Math.abs(sumDist(a) - 42.5) <= 4.25, `${week} semana ${wn}: ${sumDist(a)}`);
      assert.ok(!a.some(d => 'racePaceSec' in d || 'racePaceBlockKm' in d), 'sin ritmo de carrera');
    });
  }
});

test('applyPhaseLongRun / applyPhaseRacePace no hacen nada en post ni maintenance; clampPhaseLongRun solo actúa en maintenance', () => {
  const app = loadApp();
  ['post', 'maintenance'].forEach(phase => {
    const info = { active: true, phase, weeksAfter: 3, peakKm: 50 };
    const used = ['easy', 'tempo', 'long'];
    const dm = { easy: 10, tempo: 9, long: 25, intervals: 0, fartlek: 0, hills: 0, progression: 0 };
    const before = JSON.stringify(dm);
    app.applyPhaseLongRun(dm, used, 44, info, '10k', false, LR_RATIO);
    assert.equal(JSON.stringify(dm), before, `applyPhaseLongRun ${phase}`);
    const days = [{ typeKey: 'tempo', dist: 9 }, { typeKey: 'intervals', dist: 8 }, { typeKey: 'long', dist: 25 }];
    const daysBefore = JSON.stringify(days);
    app.applyPhaseRacePace(days, info, '21k', false, true);
    assert.equal(JSON.stringify(days), daysBefore, `applyPhaseRacePace ${phase}`);
    app.clampPhaseLongRun(dm, used, info, '10k');
    if (phase === 'post') assert.equal(JSON.stringify(dm), before, 'clampPhaseLongRun post');
    else assert.deepEqual(plain(dm), { easy: 10, tempo: 9, long: 16, intervals: 0, fartlek: 0, hills: 0, progression: 0 }, 'clamp maintenance: tope 16 de 10k');
  });
  // semana corta en maintenance: las demás quedan por debajo de la tirada
  const dm2 = { easy: 20, tempo: 0, long: 30, intervals: 0, fartlek: 0, hills: 0, progression: 0 };
  app.clampPhaseLongRun(dm2, ['easy', 'long'], { active: true, phase: 'maintenance' }, '10k');
  assert.equal(dm2.long, 16);
  assert.equal(dm2.easy, 15);
});

test('generatePlan: maintenance con 2-3 días respeta el tope de la tirada y la deja como la sesión más larga (casos del review)', () => {
  const cases = [
    ['10k 2 días', { goal: '10k', trainingDays: ['wed', 'sun'] }, Object.assign({}, POST_SCHEDULE)],
    ['10k 3 días', { goal: '10k', trainingDays: ['tue', 'thu', 'sun'] }, Object.assign({}, POST_SCHEDULE)],
    ['42k 2 días pico 70', { goal: '42k', trainingDays: ['wed', 'sun'] }, Object.assign({}, POST_SCHEDULE, { goal: '42k', peakKm: 70 })],
    ['42k 3 días pico 70', { goal: '42k', trainingDays: ['tue', 'thu', 'sun'] }, Object.assign({}, POST_SCHEDULE, { goal: '42k', peakKm: 70 })],
  ];
  cases.forEach(([name, overrides, schedule]) => {
    const cap = loadApp().phaseLongCapKm(schedule.goal, schedule.peakKm); // escalado por el pico (I6)
    for (let wn = 1; wn <= 8; wn++) {
      [MAINT_W1, '2027-04-05', '2027-06-14'].forEach(week => {
        const { app } = postApp(overrides, plain(schedule));
        const plan = plain(app.generatePlan(app.state.profile, wn, week));
        const long = plan.find(d => d.typeKey === 'long');
        assert.ok(long, `${name} ${week} ${wn}: hay tirada`);
        assert.ok(long.dist <= cap, `${name} ${week} ${wn}: tirada ${long.dist} > ${cap}`);
        plan.filter(d => d.typeKey !== 'long' && d.typeKey !== 'rest').forEach(d =>
          assert.ok(d.dist < long.dist, `${name} ${week} ${wn}: ${d.typeKey} ${d.dist} >= tirada ${long.dist}`));
      });
    }
  });
});

test('generatePlan: sin peakKm guardado la semana posterior a la carrera es la de v4', () => {
  const sinPico = plain(POST_SCHEDULE);
  delete sinPico.peakKm;
  delete sinPico.limited;
  [POST_W1, POST_W2, MAINT_W1].forEach(week => {
    for (let wn = 1; wn <= 4; wn++) {
      const a = postApp({}, plain(sinPico)).app;
      const b = postApp({}, null).app;
      assert.deepEqual(plain(a.generatePlan(a.state.profile, wn, week)), plain(b.generatePlan(b.state.profile, wn, week)), `${week} ${wn}`);
    }
  });
});

test('generatePlan: por tiempo, una semana post no tiene sesiones fuertes y sigue el volumen por fases', () => {
  [[POST_W1, 30], [POST_W2, 40]].forEach(([week, km]) => {
    const { app } = postApp({ trainBy: 'time' });
    const p = app.state.profile;
    const pace = app.estimateBasePaceMinPerKm(p);
    const plan = plain(app.generatePlan(p, 1, week));
    const types = plan.map(d => d.typeKey);
    POST_HEAVY.forEach(k => assert.ok(!types.includes(k), `${week}: ${types}`));
    const minutes = plan.reduce((a, d) => a + (d.durMin || 0), 0);
    // 5 rodajes redondeados a 5 min (+-2,5 cada uno)
    assert.ok(Math.abs(minutes - km * pace) <= 12.5, `${week}: ${minutes} min vs ${km * pace}`);
  });
});

test('refreshPhaseNow: post y maintenance llegan a state.phaseNow (weeksToRace 0, limited false, weeksAfter)', () => {
  const { app } = postApp();
  app.state.weekStart = POST_W1;
  app.refreshPhaseNow();
  assert.deepEqual(plain(app.state.phaseNow), { phase: 'post', weeksToRace: 0, limited: false, peakKm: 50, weeksAfter: 1 });
  app.state.weekStart = '2027-04-19';
  app.refreshPhaseNow();
  assert.deepEqual(plain(app.state.phaseNow), { phase: 'maintenance', weeksToRace: 0, limited: false, peakKm: 50, weeksAfter: 6 });
});

// Cronograma de la carrera vieja con base guardada (para ver que prev.baseKm se copia).
const POST_SCHEDULE_B = Object.assign({}, POST_SCHEDULE, { baseKm: 30 });
const PREV_OF_B = { anchor: '2026-11-02', raceDate: '2027-03-14', goal: '10k', peakKm: 50, baseKm: 30 };

test('elegir una meta nueva en la semana de recuperación (botón del aviso): la recuperación de la carrera vieja se mantiene', () => {
  // el caso del review: semana post 1 (2027-03-15, miércoles 17), nueva carrera 2027-10-10
  const { app } = postApp({}, plain(POST_SCHEDULE_B));
  app.renderAll = () => {}; app.renderPerfil = () => {}; app.flashSaved = () => {};
  app.state.weekStart = POST_W1;
  app.state.weekNumber = 1;
  app.state.runs = [];
  app.state.plan = plain(app.generatePlan(app.state.profile, 1, POST_W1));
  app.refreshPhaseNow();
  assert.equal(app.state.phaseNow.phase, 'post');
  app.state.profile.raceDate = '2027-10-10';
  app.refreshPhaseSchedule();
  const s = app.state.phaseSchedule;
  assert.equal(s.raceDate, '2027-10-10');
  assert.equal(s.anchor, MAINT_W1, 'el ancla nuevo espera a que terminen las 2 semanas de recuperación');
  assert.deepEqual(plain(s.prev), PREV_OF_B);
  assert.ok(Number.isFinite(s.peakKm) && s.baseKm === 30);
  // la semana actual sigue siendo post (y "a partir de ahora" la deja así en state.plan)
  assert.deepEqual(plain(app.state.phaseNow), { phase: 'post', weeksToRace: 0, limited: false, peakKm: 50, weeksAfter: 1, fromPrev: true });
  const beforeChange = plain(app.state.plan);
  app.applyPersonalDataChangeNow();
  // hoy es miércoles: lunes y martes quedan como descanso (preserveLivedDays); de hoy en adelante
  // el plan de la semana es el mismo de recuperación que tenía antes del cambio
  assert.deepEqual(plain(app.state.plan).slice(2), beforeChange.slice(2));
  [[app.generatePlan(app.state.profile, 1, POST_W1), 30], [app.generatePlan(app.state.profile, 2, POST_W2), 40]].forEach(([plan, km]) => {
    plan = plain(plan);
    const types = plan.map(d => d.typeKey);
    POST_HEAVY.forEach(k => assert.ok(!types.includes(k), `${km}: ${types}`));
    assert.ok(Math.abs(sumDist(plan) - km) <= 1.5, `suma ${sumDist(plan)} vs ${km}`);
  });
  const w2 = plain(app.phaseForWeek(app.state.profile, POST_W2, s));
  assert.equal(w2.phase, 'post');
  assert.equal(w2.weeksAfter, 2);
  const a = plain(app.phaseForWeek(app.state.profile, MAINT_W1, s));
  assert.equal(a.phase, 'base');
  assert.equal(a.weekIdx, 0);
  assert.ok(!('fromPrev' in a));
});

test('meta nueva durante el mantenimiento: ancla = el lunes siguiente y la semana actual sigue en maintenance', () => {
  const { app } = postApp({}, plain(POST_SCHEDULE_B), '2027-04-14T12:00:00');
  app.state.weekStart = '2027-04-12'; // weeksAfter 5
  app.refreshPhaseNow();
  assert.equal(app.state.phaseNow.phase, 'maintenance');
  assert.equal(app.state.phaseNow.weeksAfter, 5);
  app.state.profile.raceDate = '2027-10-10';
  app.refreshPhaseSchedule();
  const s = app.state.phaseSchedule;
  assert.equal(s.anchor, '2027-04-19');
  assert.deepEqual(plain(s.prev), PREV_OF_B);
  assert.equal(app.state.phaseNow.phase, 'maintenance');
  assert.equal(app.state.phaseNow.fromPrev, true);
  assert.equal(app.state.phaseNow.weeksAfter, 5);
  const before = plain(app.phaseForWeek(app.state.profile, '2027-04-12', s));
  assert.equal(before.phase, 'maintenance');
  const at = plain(app.phaseForWeek(app.state.profile, '2027-04-19', s));
  assert.equal(at.weekIdx, 0);
  assert.ok(!app.isPostRacePhase(at.phase), at.phase);
  // la semana actual sale igual que antes del cambio (mismo volumen y sesiones de mantenimiento)
  const ref = postApp({}, plain(POST_SCHEDULE_B), '2027-04-14T12:00:00').app;
  assert.deepEqual(plain(app.generatePlan(app.state.profile, 3, '2027-04-12')), plain(ref.generatePlan(ref.state.profile, 3, '2027-04-12')));
});

test('meta nueva ANTES de que pase la carrera vieja (también en su misma semana): sin prev, ancla = lunes siguiente', () => {
  [['2027-02-17T12:00:00', '2027-02-15', '2027-02-22'], ['2027-03-10T12:00:00', '2027-03-08', POST_W1]].forEach(([now, week, nextMonday]) => {
    const { app } = postApp({}, plain(POST_SCHEDULE_B), now);
    app.state.weekStart = week;
    app.state.profile.raceDate = '2027-10-10';
    app.refreshPhaseSchedule();
    assert.equal(app.state.phaseSchedule.prev, undefined, now);
    assert.equal(app.state.phaseSchedule.anchor, nextMonday, now);
    assert.deepEqual(plain(app.phaseForWeek(app.state.profile, week, app.state.phaseSchedule)), { active: false }, now);
  });
});

test('dos cambios de meta seguidos en la recuperación conservan la carrera vieja; prev no se anida', () => {
  const { app } = postApp({}, plain(POST_SCHEDULE_B));
  app.state.weekStart = POST_W1;
  app.state.profile.raceDate = '2027-10-10';
  app.refreshPhaseSchedule();
  app.state.profile.raceDate = '2027-11-07';
  app.refreshPhaseSchedule();
  const s = app.state.phaseSchedule;
  assert.equal(s.raceDate, '2027-11-07');
  assert.equal(s.anchor, MAINT_W1);
  assert.deepEqual(plain(s.prev), PREV_OF_B);
  assert.equal(app.state.phaseNow.phase, 'post');
});

test('sin pico en la carrera vieja o sin prev, las semanas antes del ancla siguen inactivas', () => {
  const app = loadApp();
  const p = postProfile({ raceDate: '2027-10-10' });
  const s = { anchor: MAINT_W1, raceDate: '2027-10-10', goal: '10k', peakKm: 45, baseKm: 30 };
  assert.deepEqual(plain(app.phaseForWeek(p, POST_W1, s)), { active: false });
  const sinPico = Object.assign({}, s, { prev: { anchor: '2026-11-02', raceDate: '2027-03-14', goal: '10k' } });
  assert.deepEqual(plain(app.phaseForWeek(p, POST_W1, sinPico)), { active: false });
  // prev con pico pero semana anterior a la carrera vieja (weeksAfter < 1) -> inactivo
  const conPrev = Object.assign({}, s, { prev: PREV_OF_B });
  assert.deepEqual(plain(app.phaseForWeek(p, '2027-03-08', conPrev)), { active: false });
  assert.deepEqual(plain(app.phaseForWeek(p, '2027-02-15', conPrev)), { active: false });
  assert.equal(plain(app.phaseForWeek(p, POST_W1, conPrev)).phase, 'post');
  // principiante: generatePlan no aplica nada (guard de siempre)
  const beginner = postProfile({ raceDate: '2027-10-10', runnerType: 'new', weeklyKm: 0, currentWeeklyKm: 0, trainingDays: ['tue', 'thu', 'sun'] });
  const a = postApp({ raceDate: '2027-10-10', runnerType: 'new', weeklyKm: 0, currentWeeklyKm: 0, trainingDays: ['tue', 'thu', 'sun'] }, plain(conPrev)).app;
  const b = postApp({ raceDate: '2027-10-10', runnerType: 'new', weeklyKm: 0, currentWeeklyKm: 0, trainingDays: ['tue', 'thu', 'sun'] }, null).app;
  assert.deepEqual(plain(a.generatePlan(beginner, 1, POST_W1)), plain(b.generatePlan(beginner, 1, POST_W1)));
});

test('applyUndoLastChange: deshacer restaura el cronograma con su prev', () => {
  const vm = require('node:vm');
  const { app } = postApp({}, plain(POST_SCHEDULE_B));
  app.renderAll = () => {}; app.renderZones = () => {};
  app.state.weekStart = POST_W1;
  app.state.weekNumber = 1;
  app.state.plan = plain(app.generatePlan(app.state.profile, 1, POST_W1));
  app.applyProfileChange({ fecha_carrera: '2027-10-10' });
  const conPrev = plain(app.state.phaseSchedule);
  assert.deepEqual(conPrev.prev, PREV_OF_B);
  // otro turno del chat: otro cambio, y deshacerlo vuelve al cronograma con prev
  vm.runInContext('coachUndoTurnSnapshotTaken = false', app);
  app.applyProfileChange({ fecha_carrera: '2027-11-07' });
  assert.equal(app.state.phaseSchedule.raceDate, '2027-11-07');
  app.applyUndoLastChange();
  assert.deepEqual(plain(app.state.phaseSchedule), conPrev);
  assert.equal(app.state.phaseNow.phase, 'post');
});

test('fromPrev: sin aviso de meta nueva en el plan y Zonda no sugiere elegirla (ya la eligió)', () => {
  const { app, els } = planScreenApp({ phase: 'post', weeksToRace: 0, limited: false, peakKm: 50, weeksAfter: 1, fromPrev: true });
  app.renderPlan();
  assert.equal(els['plan-post-race'].style.display, 'none');
  assert.equal(els['plan-phase-note'].textContent, app.t('plan_phase_line_nogoal', { phase: app.t('plan_phase_post') }));
  const s = app.phaseCtxSentence(app.state.phaseNow);
  assert.ok(s.includes('ya pasó') && s.includes('recuperación'), s);
  assert.ok(!s.includes('sugerile'), s);
  assert.ok(!/\d/.test(s));
});

// ---- volumen post / maintenance según la carga real (baseKm) ----
test('postRaceWeeklyKm: escala por base de hoy / base del cronograma, entre 0,5 y 1; sin base guardada no cambia', () => {
  const app = loadApp();
  const p = postProfile();
  const caution = app.trainingCaution(p);
  const info = week => app.phaseForWeek(p, week, POST_SCHEDULE_B);
  const km = (week, base) => app.phasedWeeklyKm(p, caution, info(week), base).km;
  assert.equal(km(MAINT_W1, 30), 42.5);
  assert.ok(Math.abs(km(MAINT_W1, 27) - 42.5 * 0.9) < 1e-9, 'x0,9');
  assert.ok(Math.abs(km(POST_W1, 27) - 30 * 0.9) < 1e-9, 'post también');
  assert.equal(km(MAINT_W1, 10), 42.5 * 0.5, 'nunca baja de la mitad');
  assert.equal(km(MAINT_W1, 0), 42.5 * 0.5);
  assert.equal(km(MAINT_W1, 40), 42.5, 'nunca sube');
  assert.equal(km(POST_W2, 60), 40);
  // cronograma sin baseKm (viejo): factor 1
  const sinBase = app.phaseForWeek(p, MAINT_W1, POST_SCHEDULE);
  assert.equal(app.phasedWeeklyKm(p, caution, sinBase, 10).km, 42.5);
  [NaN, 0, -5].forEach(b => {
    const i = app.phaseForWeek(p, MAINT_W1, Object.assign({}, POST_SCHEDULE, { baseKm: b }));
    assert.equal(app.phasedWeeklyKm(p, caution, i, 10).km, 42.5, String(b));
  });
});

test('generatePlan: el ajuste semanal (vista previa con weeklyKm x 0,9) baja el mantenimiento a 0,9 x', () => {
  const { app } = postApp({}, plain(POST_SCHEDULE_B));
  const p = app.state.profile;
  const full = sumDist(plain(app.generatePlan(p, 1, '2027-04-05')));
  const preview = Object.assign({}, p, { weeklyKm: 27 }); // como getNextWeekPlan con factor 0,9
  const scaled = sumDist(plain(app.generatePlan(preview, 1, '2027-04-05')));
  assert.ok(Math.abs(full - 42.5) <= 1.5, `completo ${full}`);
  assert.ok(Math.abs(scaled - 42.5 * 0.9) <= 1.5, `x0,9 ${scaled}`);
  // vuelta de un parate largo (base a la mitad o menos): como mucho la mitad
  const back = sumDist(plain(app.generatePlan(Object.assign({}, p, { weeklyKm: 9 }), 1, '2027-04-05')));
  assert.ok(Math.abs(back - 42.5 * 0.5) <= 1.5, `vuelta ${back}`);
  // getNextWeekPlan usa ese mismo camino (factor del ajuste automático)
  app.state.weekStart = '2027-03-29';
  app.state.weekNumber = 2;
  app.state.plan = plain(app.generatePlan(p, 2, '2027-03-29'));
  app.state.nextWeekOverrides = {};
  app.computeWeekAdjustment = () => ({ factor: 0.9 });
  const nw = plain(app.getNextWeekPlan());
  assert.equal(nw.weekStart, '2027-04-05');
  assert.ok(Math.abs(sumDist(nw.plan) - 42.5 * 0.9) <= 1.5, `próxima ${sumDist(nw.plan)}`);
});

// ---- etiqueta de descarga según el plan por fases ----
// Pantalla del plan con el perfil/cronograma dados, mostrando la semana `weekStart` como la actual.
function tagScreen(profileOverrides, schedule, weekStart, weekNumber) {
  const p = racingProfile(profileOverrides);
  p.hrZones = { 1: { min: 100, max: 120 }, 2: { min: 120, max: 140 }, 3: { min: 140, max: 155 }, 4: { min: 155, max: 170 }, 5: { min: 170, max: 185 } };
  const { app } = phasedApp(p, schedule);
  app.state.weekStart = weekStart;
  app.state.weekNumber = weekNumber;
  app.state.plan = plain(app.generatePlan(p, weekNumber, weekStart));
  app.refreshPhaseNow();
  const els = {};
  app.document.getElementById = (id) => {
    if (!els[id]) els[id] = { id, style: {}, textContent: '', innerHTML: '', disabled: false, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, querySelectorAll: () => [], querySelector: () => null, setAttribute() {}, addEventListener() {} };
    return els[id];
  };
  app.renderPlan();
  const tag = `>${app.t('plan_cutback')}<`;
  return { tag: (els['plan-week-tags'].innerHTML || '').includes(tag), note: els['plan-cutback-note'].style.display === 'block' };
}

test('phaseIsCutbackWeek: coincide con las semanas 0,75 de phasedWeeklyKm, solo en la rampa', () => {
  const app = loadApp();
  const p = racingProfile();
  const caution = app.trainingCaution(p);
  for (let R = 4; R <= 30; R++) {
    const split = app.phaseSplit(R);
    for (let i = 0; i < R + 3; i++) {
      const phase = i >= R ? 'taper' : split[i];
      const info = { active: true, phase, weekIdx: i, R };
      const cut = app.phaseIsCutbackWeek(info);
      if (i > 0 && phase !== 'peak' && phase !== 'taper') {
        const prev = { active: true, phase: i - 1 >= R ? 'taper' : split[i - 1], weekIdx: i - 1, R };
        const km = app.phasedWeeklyKm(p, caution, info, 30).km;
        const kmPrev = app.phasedWeeklyKm(p, caution, prev, 30).km;
        assert.equal(cut, km < kmPrev, `R=${R} i=${i}`);
      }
      if (phase === 'peak' || phase === 'taper') assert.equal(cut, false, `R=${R} i=${i} ${phase}`);
    }
  }
  assert.equal(app.phaseIsCutbackWeek({ active: true, phase: 'post', weekIdx: 19, R: 16 }), false);
  assert.equal(app.phaseIsCutbackWeek({ active: true, phase: 'maintenance', weekIdx: 23, R: 16 }), false);
  assert.equal(app.phaseIsCutbackWeek({ active: false }), false);
});

test('plan en pantalla: con fases la etiqueta/nota de descarga va en las semanas de descarga de la rampa, no por weekNumber', () => {
  const sched = plain(SCHEDULE); // 21k, ancla 2026-11-02, R=16
  // weekIdx 3, 7, 11: descarga aunque weekNumber no sea múltiplo de 4
  ['2026-11-23', '2026-12-21', '2027-01-18'].forEach(week => {
    assert.deepEqual(tagScreen({}, sched, week, 1), { tag: true, note: true }, week);
  });
  // weekNumber múltiplo de 4 en semanas que no son descarga de la rampa (build, peak, taper)
  ['2026-11-30', '2027-02-15', '2027-03-01'].forEach(week => {
    assert.deepEqual(tagScreen({}, sched, week, 4), { tag: false, note: false }, week);
  });
  // post y maintenance: nunca
  const withPeak10 = plain(POST_SCHEDULE);
  // (la 4ta de mantenimiento, 2027-04-19, sí es descarga: ver la prueba de I1)
  [POST_W1, POST_W2, MAINT_W1, '2027-04-12'].forEach(week => {
    assert.deepEqual(tagScreen({ goal: '10k' }, withPeak10, week, 4), { tag: false, note: false }, week);
  });
});

test('plan en pantalla: sin fase activa (o principiante) la etiqueta de descarga sigue a weekNumber como siempre', () => {
  // sin cronograma
  assert.deepEqual(tagScreen({}, null, '2026-11-30', 4), { tag: true, note: true });
  assert.deepEqual(tagScreen({}, null, '2026-11-23', 3), { tag: false, note: false });
  // antes del ancla
  assert.deepEqual(tagScreen({}, plain(SCHEDULE), '2026-10-26', 8), { tag: true, note: true });
  // principiante con cronograma viejo: legacy
  const beg = { runnerType: 'new', weeklyKm: 0, currentWeeklyKm: 0, trainingDays: ['tue', 'thu', 'sun'] };
  assert.deepEqual(tagScreen(beg, plain(SCHEDULE), '2026-11-30', 4), { tag: true, note: true });
  assert.deepEqual(tagScreen(beg, plain(SCHEDULE), '2026-11-23', 3), { tag: false, note: false });
});

test('locales: fr y de usan Maintien / Erhaltungsphase para el mantenimiento', () => {
  const vm = require('node:vm');
  const dictOf = loc => {
    const sandbox = {}; sandbox.window = sandbox; vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'locales', loc + '.js'), 'utf8'), sandbox);
    return sandbox.I18N[loc];
  };
  assert.equal(dictOf('fr').plan_phase_maintenance, 'Maintien');
  assert.equal(dictOf('de').plan_phase_maintenance, 'Erhaltungsphase');
});

test('un cronograma creado con la fecha de carrera ya pasada nunca llega a post ni maintenance (no tiene peakKm)', () => {
  const { app } = postApp({}, undefined, '2027-03-17T12:00:00');
  app.state.phaseSchedule = null;
  app.state.weekStart = POST_W1;
  app.refreshPhaseSchedule(); // raceDate 2027-03-14 ya pasó
  const s = app.state.phaseSchedule;
  assert.ok(s, 'el cronograma existe (coincide con el perfil)');
  assert.equal(s.peakKm, undefined);
  assert.equal(app.state.phaseNow, null);
  [POST_W1, POST_W2, MAINT_W1, '2027-06-07'].forEach(week => {
    assert.deepEqual(plain(app.phaseForWeek(app.state.profile, week, s)), { active: false }, week);
  });
});

test('plan en pantalla: post y maintenance muestran la fase sin semanas y el aviso con el botón; nada más lo muestra', () => {
  ['post', 'maintenance'].forEach(phase => {
    const { app, els } = planScreenApp({ phase, weeksToRace: 0, limited: true, peakKm: 50, weeksAfter: 1 });
    app.renderPlan();
    assert.equal(els['plan-phase-note'].textContent, app.t('plan_phase_line_nogoal', { phase: app.t('plan_phase_' + phase) }), phase);
    assert.equal(els['plan-post-race'].style.display, 'block', phase);
  });
  // otras fases y sin fase: oculto
  [null, { phase: 'taper', weeksToRace: 0, limited: false, peakKm: 50 }, { phase: 'build', weeksToRace: 9, limited: false, peakKm: 50 }].forEach(pn => {
    const { app, els } = planScreenApp(pn);
    app.renderPlan();
    assert.equal(els['plan-post-race'].style.display, 'none', JSON.stringify(pn));
  });
  // semanas no actuales: oculto
  ['past', 'next', 'future'].forEach(mode => {
    const { app, els } = planScreenApp({ phase: 'post', weeksToRace: 0, limited: false, peakKm: 50, weeksAfter: 1 });
    const real = app.getWeekData;
    app.getWeekData = () => Object.assign({}, real(0), { mode, editable: false });
    app.renderPlan();
    assert.equal(els['plan-post-race'].style.display, 'none', mode);
    assert.equal(els['plan-phase-note'].style.display, 'none', mode);
  });
});

test('phaseLineText: post / maintenance no rompen con peakKm indefinido y nunca muestran la nota del pico', () => {
  const app = loadApp();
  ['post', 'maintenance'].forEach(phase => {
    [undefined, NaN, 50].forEach(peakKm => {
      assert.equal(app.phaseLineText({ phase, weeksToRace: 0, limited: true, peakKm }), app.t('plan_phase_line_nogoal', { phase: app.t('plan_phase_' + phase) }));
    });
  });
});

test('index.html: #plan-post-race con el texto, y el botón abre el editor de meta y fecha (Datos personales)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const m = html.match(/<div[^>]*id="plan-post-race"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(m, 'existe #plan-post-race');
  assert.match(m[0], /display:none/);
  assert.match(m[1], /data-i18n="plan_post_race_banner"/);
  const btn = m[1].match(/<button[^>]*data-i18n="plan_post_race_cta"[^>]*>/);
  assert.ok(btn, 'botón con plan_post_race_cta');
  const onclick = btn[0].match(/onclick="([^"]+)"/)[1];
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').includes("getElementById('plan-post-race')"));
  // el handler llama a la función que abre el panel donde se eligen meta y fecha de carrera
  const app = loadApp();
  let opened = 0;
  app.openPersonalDataOverlay = () => { opened++; };
  require('node:vm').runInContext(onclick, app);
  assert.equal(opened, 1);
  // y ese panel es el que tiene los campos de meta y fecha de carrera
  const overlay = html.slice(html.indexOf('id="personal-data-overlay"'));
  const end = overlay.indexOf('class="overlay overlay-sheet"');
  assert.ok(overlay.indexOf('id="perfil-goal"') > 0 && overlay.indexOf('id="perfil-goal"') < end);
  assert.ok(overlay.indexOf('id="perfil-racedate"') > 0 && overlay.indexOf('id="perfil-racedate"') < end);
});

test('contexto de Zonda: post / maintenance dicen que la carrera pasó y sugieren nueva meta, sin números de volumen', () => {
  [['post', 'recuperación'], ['maintenance', 'mantenimiento']].forEach(([phase, label]) => {
    const { app } = planScreenApp(null);
    const before = app.buildContext();
    app.state.phaseNow = { phase, weeksToRace: 0, limited: false, peakKm: 77, weeksAfter: 1 };
    const sentence = app.phaseCtxSentence(app.state.phaseNow);
    assert.ok(sentence.includes('La carrera objetivo ya pasó'), sentence);
    assert.ok(sentence.includes('fase de ' + label), sentence);
    assert.ok(sentence.includes('nueva meta'), sentence);
    assert.ok(!/\d/.test(sentence), 'sin números');
    const after = app.buildContext();
    assert.equal(after.replace(sentence, ''), before);
    assert.ok(!after.includes('77'));
    assert.equal(app.phaseCtxSentence({ phase, weeksToRace: 0, limited: false }), sentence, 'peakKm indefinido no rompe');
  });
  assert.equal(loadApp().phaseCtxSentence(null), '');
});

test('locales: las seis definen las claves de después de la carrera', () => {
  const vm = require('node:vm');
  const dictOf = loc => {
    const sandbox = {}; sandbox.window = sandbox; vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'locales', loc + '.js'), 'utf8'), sandbox);
    return sandbox.I18N[loc];
  };
  ['es', 'en', 'pt', 'fr', 'it', 'de'].forEach(loc => {
    const dict = dictOf(loc);
    ['plan_phase_post', 'plan_phase_maintenance', 'plan_post_race_banner', 'plan_post_race_cta', 'plan_phase_line_nogoal']
      .forEach(k => assert.ok(typeof dict[k] === 'string' && dict[k].length >= 3, `${loc}.${k}`));
    assert.deepEqual(dict.plan_phase_line_nogoal.match(/\{\w+\}/g), ['{phase}'], loc);
    ['plan_phase_post', 'plan_phase_maintenance', 'plan_post_race_banner', 'plan_post_race_cta']
      .forEach(k => assert.equal(/\{\w+\}/.test(dict[k]), false, `${loc}.${k}`));
  });
  const es = dictOf('es');
  assert.equal(es.plan_post_race_banner, 'Tu carrera ya pasó. Elegí una nueva meta para seguir con un plan por fases.');
  assert.equal(es.plan_post_race_cta, 'Elegir nueva meta');
  assert.equal(es.plan_phase_post, 'Recuperación');
  assert.equal(es.plan_phase_maintenance, 'Mantenimiento');
});

// ---- prev solo sobrevive hasta que arranca el plan nuevo (ruling 25) ----
// Elige B (`raceDate`) el miércoles 2027-03-17, en la semana post 1 de A (2027-03-14). Devuelve la app.
function appWithB(raceDate) {
  const { app } = postApp({}, plain(POST_SCHEDULE_B));
  app.state.weekStart = POST_W1;
  app.state.profile.raceDate = raceDate;
  app.refreshPhaseSchedule();
  return app;
}

test('ya en el plan de B, mover su fecha no revive el mantenimiento de A en la semana actual', () => {
  const app = appWithB('2027-10-10');
  assert.equal(app.state.phaseSchedule.anchor, MAINT_W1);
  assert.deepEqual(plain(app.state.phaseSchedule.prev), PREV_OF_B);
  // 2027-06-16 (miércoles): semana de build de B (descarga de su rampa, weekIdx 11)
  app.Date = makeFrozenDate('2027-06-16T12:00:00');
  app.state.weekStart = '2027-06-14';
  app.refreshPhaseNow();
  assert.equal(app.state.phaseNow.phase, 'build');
  assert.ok(!('fromPrev' in app.state.phaseNow));
  const buildKm = sumDist(plain(app.generatePlan(app.state.profile, 16, '2027-06-14')));
  // se corre la carrera una semana
  app.state.profile.raceDate = '2027-10-17';
  app.refreshPhaseSchedule();
  const s = app.state.phaseSchedule;
  assert.equal(s.raceDate, '2027-10-17');
  assert.equal(s.prev, undefined, 'sin prev: el plan de B ya había arrancado');
  assert.equal(s.anchor, '2027-06-21');
  // la semana actual queda fuera de fases (como cualquier cambio de plazo "desde la semana que
  // viene"), nunca en el mantenimiento de A con su pico
  assert.equal(app.state.phaseNow, null);
  assert.deepEqual(plain(app.phaseForWeek(app.state.profile, '2027-06-14', s)), { active: false });
  const ref = postApp({ raceDate: '2027-10-17' }, null, '2027-06-16T12:00:00').app;
  const now = plain(app.generatePlan(app.state.profile, 16, '2027-06-14'));
  assert.deepEqual(now, plain(ref.generatePlan(ref.state.profile, 16, '2027-06-14')));
  // el volumen sale de la curva de v4 (weekNumber), no del pico de A: con weekNumber 1 v4 da ~30 km,
  // mientras que el mantenimiento de A daría 42,5 km con cualquier weekNumber. (Con weekNumber 16 la
  // curva de v4 da justo 45 km y coincide en sesiones con el mantenimiento de A: por eso esta prueba.)
  assert.ok(Math.abs(sumDist(plain(app.generatePlan(app.state.profile, 1, '2027-06-14'))) - 30) <= 1.5, `build era ${buildKm} km`);
  const maintA = postApp({}, plain(POST_SCHEDULE_B), '2027-06-16T12:00:00').app;
  // (2027-06-14 es la 12da semana de mantenimiento de A: descarga, 42,5 x 0,75)
  assert.ok(maintA.phaseIsCutbackWeek(maintA.phaseForWeek(maintA.state.profile, '2027-06-14', maintA.state.phaseSchedule)));
  assert.ok(Math.abs(sumDist(plain(maintA.generatePlan(maintA.state.profile, 1, '2027-06-14'))) - 42.5 * 0.75) <= 1.5, 'referencia: mantenimiento de A');
  // y desde el ancla nuevo, el plan por fases de B
  const next = plain(app.phaseForWeek(app.state.profile, '2027-06-21', s));
  assert.equal(next.weekIdx, 0);
  assert.ok(!app.isPostRacePhase(next.phase) && !('fromPrev' in next), next.phase);
});

test('B sin pico (R<4 tras correr el ancla): después de su carrera, cambiar de meta no revive el mantenimiento de A', () => {
  const app = appWithB('2027-05-02'); // ancla 2027-03-29, semana de carrera 2027-04-26 -> R = 2
  const b = app.state.phaseSchedule;
  assert.equal(b.anchor, MAINT_W1);
  assert.equal(b.peakKm, undefined);
  assert.deepEqual(plain(b.prev), PREV_OF_B);
  // la recuperación de A igual se sirve
  assert.equal(plain(app.phaseForWeek(app.state.profile, POST_W2, b)).phase, 'post');
  // pasada la carrera de B
  app.Date = makeFrozenDate('2027-06-16T12:00:00');
  app.state.weekStart = '2027-06-14';
  app.refreshPhaseNow();
  assert.equal(app.state.phaseNow, null);
  app.state.profile.raceDate = '2027-10-10';
  app.refreshPhaseSchedule();
  assert.equal(app.state.phaseSchedule.prev, undefined);
  assert.equal(app.state.phaseNow, null);
  const ref = postApp({ raceDate: '2027-10-10' }, null, '2027-06-16T12:00:00').app;
  assert.deepEqual(plain(app.generatePlan(app.state.profile, 16, '2027-06-14')), plain(ref.generatePlan(ref.state.profile, 16, '2027-06-14')));
});

test('el prev se arrastra hasta el domingo anterior al ancla y se corta exactamente el lunes del ancla', () => {
  // domingo 2027-03-28: el plan de B todavía no arrancó -> se conserva
  const a = appWithB('2027-10-10');
  a.Date = makeFrozenDate('2027-03-28T20:00:00');
  a.state.weekStart = POST_W2;
  a.state.profile.raceDate = '2027-11-07';
  a.refreshPhaseSchedule();
  assert.deepEqual(plain(a.state.phaseSchedule.prev), PREV_OF_B);
  assert.equal(a.state.phaseSchedule.anchor, MAINT_W1);
  assert.equal(a.state.phaseNow.phase, 'post');
  // lunes 2027-03-29 (el ancla de B): ya arrancó -> sin prev, ancla el lunes siguiente
  const b = appWithB('2027-10-10');
  b.Date = makeFrozenDate('2027-03-29T08:00:00');
  b.state.weekStart = MAINT_W1;
  b.state.profile.raceDate = '2027-11-07';
  b.refreshPhaseSchedule();
  assert.equal(b.state.phaseSchedule.prev, undefined);
  assert.equal(b.state.phaseSchedule.anchor, '2027-04-05');
  assert.deepEqual(plain(b.phaseForWeek(b.state.profile, MAINT_W1, b.state.phaseSchedule)), { active: false });
  assert.equal(b.state.phaseNow, null);
});

// ---- scripts/plan-examples.js: los ejemplos que se le muestran al dueño ----

const { buildExamples, renderExamples } = require('../scripts/plan-examples');

let EXAMPLES_CACHE = null;
function examples() {
  if (!EXAMPLES_CACHE) EXAMPLES_CACHE = buildExamples();
  return EXAMPLES_CACHE;
}
function allRuns() { return examples().flatMap(g => g.runs); }
const RAMP_PHASES = ['base', 'build', 'specific', 'peak'];

test('plan-examples: devuelve los 11 grupos de ejemplos (6 originales + 5 de transiciones) con semanas y cronograma', () => {
  const groups = examples();
  assert.deepEqual(groups.map(g => g.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(groups.map(g => g.runs.length), [1, 1, 2, 1, 1, 1, 1, 2, 1, 2, 1]);
  allRuns().forEach(run => {
    assert.ok(run.rows.length >= 7, run.label);
    assert.ok(Number.isFinite(run.peakKm), run.label);
    assert.ok(run.rows.some(r => r.phase !== 'v4'), `${run.label}: tiene que haber fases activas`);
    assert.ok(run.racePace, `${run.label}: la marca de referencia tiene que dar ritmo de carrera`);
  });
  // la carrera ya pasada trae las dos semanas de recuperacion y despues mantenimiento
  const past = groups[4].runs[0].rows.map(r => r.phase);
  assert.deepEqual(past.slice(-8), ['post', 'post', 'maintenance', 'maintenance', 'maintenance', 'maintenance', 'maintenance', 'maintenance']);
});

test('plan-examples: el volumen que se propone el motor respeta el crecimiento maximo y el pico', () => {
  allRuns().forEach(run => {
    let prevFull = null;
    run.rows.forEach((row, i) => {
      if (!RAMP_PHASES.includes(row.phase)) return;
      const target = row.plan.targetKm;
      assert.ok(Number.isFinite(target), `${run.label} semana ${row.weekNumber}`);
      assert.ok(target <= run.peakKm * 1.0001, `${run.label} semana ${row.weekNumber}: objetivo ${target} pasa el pico ${run.peakKm}`);
      if (row.cutback) return; // la descarga no es referencia: la semana siguiente sube sobre la ultima completa
      // la primera semana de rampa es la unica exenta: sube desde el volumen actual, no desde una semana del plan
      if (prevFull !== null && i > 0) {
        assert.ok(target <= prevFull * 1.06 + 0.1, `${run.label} semana ${row.weekNumber}: objetivo ${target} vs ${prevFull} (x${(target / prevFull).toFixed(3)})`);
      }
      prevFull = target;
    });
  });
});

test('plan-examples: las semanas impresas no pasan el pico en mas de 7% ni la tirada el tope de la distancia', () => {
  allRuns().forEach(run => {
    run.rows.forEach(row => {
      assert.ok(row.plan.km <= run.peakKm * 1.07, `${run.label} semana ${row.weekNumber}: ${row.plan.km} km con pico ${run.peakKm}`);
      if (row.phase !== 'v4') {
        assert.ok(row.plan.longKm <= run.longCapKm, `${run.label} semana ${row.weekNumber}: tirada ${row.plan.longKm} km, tope ${run.longCapKm}`);
      }
    });
  });
});

// Los km que SUMAN las sesiones ya armadas (fartlek/cuestas/series se recalculan por su estructura)
// quedaban por debajo del objetivo y la semana siguiente "se ponía al día" (+22%). Con el reparto de
// I5 (spreadPhaseShortfall) el salto entre semanas impresas completas queda <= 1,10: el objetivo del
// motor sube como mucho 6% y el resto es el redondeo a km enteros por sesión (en el ejemplo de 10 km
// de base, 11 -> 12 km = +9%). 1,06 exacto no se alcanza por ese redondeo.
test('plan-examples: ninguna semana impresa pasa 1,10 x la anterior completa', () => {
  // Salvo con 2 días: la tirada tiene tope y la otra sesión (de calidad, que el reparto no toca) queda
  // por debajo de la tirada, así que lo que entregan fartlek/cuestas mueve todo el total (16,6 -> 23 km
  // en el 5k de 2 días). Ese caso lo acota la regla de tirada más larga, no el reparto.
  allRuns().filter(run => run.trainingDays.split('/').length > 2).forEach(run => {
    let prevFull = null;
    run.rows.forEach((row, i) => {
      if (!RAMP_PHASES.includes(row.phase) || row.cutback) return;
      if (prevFull !== null && i > 0) {
        assert.ok(row.plan.km <= prevFull * 1.10, `${run.label} semana ${row.weekNumber}: ${row.plan.km} vs ${prevFull}`);
      }
      prevFull = row.plan.km;
    });
  });
});

test('plan-examples: la salida es determinista (dos corridas dan el mismo texto)', () => {
  const again = buildExamples();
  assert.equal(renderExamples(again, false), renderExamples(examples(), false));
  assert.equal(renderExamples(again, true), renderExamples(examples(), true));
});

// ---- Fix wave (revisión final): transiciones de volumen, descargas, ritmo de carrera, reparto ----

// App con reloj congelado en `nowIso`, persist() espiado y el corredor `p` sin carreras cargadas.
function fwApp(p, nowIso) {
  const app = loadApp();
  app.Date = makeFrozenDate(nowIso || '2026-10-14T12:00:00');
  app.persist = () => Promise.resolve();
  app.renderAll = () => {}; app.renderZones = () => {}; app.renderChat = () => {};
  app.state.profile = p;
  app.state.event = null;
  app.state.lastEventDate = null;
  app.state.phaseSchedule = null;
  app.state.runs = [];
  app.state.chat = [];
  return app;
}
// Volumen que el motor se propone para la semana `ws` con el cronograma actual (null si es v4).
function engineKm(app, p, ws) {
  const info = app.phaseForWeek(p, ws, app.state.phaseSchedule);
  return info.active ? app.phasedWeeklyKm(p, app.trainingCaution(p), info, app.phaseEffectiveWeeklyKm(p, false)).km : null;
}
const fwProfile = overrides => baseProfile(Object.assign({ goal: '10k' }, overrides || {}));

test('C2: entrar al plan por fases desde v4 sigue la curva de v4 (no vuelve a la base declarada)', () => {
  [1, 6, 13, 25].forEach(wn => ['10k', '21k'].forEach(goal => {
    const p = fwProfile({ goal });
    const app = fwApp(p);
    const caution = app.trainingCaution(p);
    const thisMonday = app.getMondayISO(new app.Date());
    const anchor = app.addDaysToIsoLocal(thisMonday, 7);
    p.raceDate = app.addDaysToIsoLocal(anchor, 12 * 7 + 6);
    app.state.weekStart = thisMonday;
    app.state.weekNumber = wn;
    app.refreshPhaseSchedule();
    const label = `${goal} semana v4 ${wn}`;
    const v4Next = 30 * app.weekMultiplier(wn + 1, caution, true);
    const v4Now = 30 * app.weekMultiplier(wn, caution, true);
    assert.ok(Math.abs(app.state.phaseSchedule.rampStartKm - v4Next) < 1e-9, label);
    const first = engineKm(app, p, anchor);
    assert.ok(Math.abs(first - v4Next) < 1e-9, `${label}: primera semana ${first} vs v4 ${v4Next}`);
    // contra la semana v4 en curso: nunca baja y sube como mucho un paso de crecimiento
    assert.ok(first >= v4Now - 1e-9 && first <= v4Now * 1.06 + 1e-9, `${label}: ${first} vs ${v4Now}`);
  }));
});

test('C2: mover la carrera a mitad del plan no baja el volumen (la rampa nueva arranca en la continuación)', () => {
  const p = fwProfile({ goal: '21k', weeklyKm: 35, currentWeeklyKm: 35 });
  const app = fwApp(p);
  app.state.weekNumber = 1;
  app.state.weekStart = app.getMondayISO(new app.Date());
  const anchor = app.addDaysToIsoLocal(app.state.weekStart, 7);
  p.raceDate = app.addDaysToIsoLocal(anchor, 16 * 7 + 6);
  app.refreshPhaseSchedule();
  const growth = app.growthParams(app.trainingCaution(p)).growth;
  [2, 5, 6, 8, 10].forEach(k => {
    const saved = plain(app.state.phaseSchedule), savedRace = p.raceDate;
    const wk = app.addDaysToIsoLocal(anchor, k * 7);
    const nextWs = app.addDaysToIsoLocal(wk, 7);
    app.Date = makeFrozenDate(app.addDaysToIsoLocal(wk, 2) + 'T12:00:00');
    app.state.weekStart = wk;
    app.state.weekNumber = k + 2;
    const info = app.phaseForWeek(p, nextWs, app.state.phaseSchedule);
    const before = engineKm(app, p, nextWs) / (app.phaseIsCutbackWeek(info) ? 0.75 : 1); // semana completa
    const current = engineKm(app, p, wk);
    p.raceDate = app.addDaysToIsoLocal(p.raceDate, 7); // una semana más tarde
    app.refreshPhaseSchedule();
    assert.equal(app.state.phaseSchedule.anchor, nextWs, `idx ${k}`);
    const after = engineKm(app, p, nextWs);
    assert.ok(Math.abs(after - before) < 1e-9, `idx ${k}: ${after} vs ${before}`);
    assert.ok(after >= current * 0.75 - 1e-9 && after <= current / 0.75 * growth + 1e-9, `idx ${k}: ${after} vs semana actual ${current}`);
    app.state.phaseSchedule = saved; p.raceDate = savedRace;
  });
});

test('C2: mover la carrera dentro de la misma semana conserva el cronograma entero (ancla, rampa y pico)', () => {
  const p = fwProfile({ goal: '21k', weeklyKm: 35, currentWeeklyKm: 35 });
  const app = fwApp(p);
  app.state.weekNumber = 1;
  app.state.weekStart = app.getMondayISO(new app.Date());
  const anchor = app.addDaysToIsoLocal(app.state.weekStart, 7);
  p.raceDate = app.addDaysToIsoLocal(anchor, 16 * 7 + 6); // domingo
  app.refreshPhaseSchedule();
  const before = plain(app.state.phaseSchedule);
  const wk = app.addDaysToIsoLocal(anchor, 7 * 7);
  app.Date = makeFrozenDate(app.addDaysToIsoLocal(wk, 2) + 'T12:00:00');
  app.state.weekStart = wk;
  p.raceDate = app.addDaysToIsoLocal(p.raceDate, -1); // sábado de la misma semana
  app.refreshPhaseSchedule();
  assert.deepEqual(plain(app.state.phaseSchedule), Object.assign({}, before, { raceDate: p.raceDate }));
});

test('phasedWeeklyKm con rampStartKm: arranca ahí, llega al pico en la última semana completa, sube <= growth y escala con la base de hoy', () => {
  const app = loadApp();
  [[30, 31.8, '10k'], [30, 40, '21k'], [30, 54, '10k'], [20, 18, '42k'], [35, 60, '5k']].forEach(([baseKm, start, goal]) => [0, 2].forEach(level => [4, 7, 12, 16, 26].forEach(R => {
    const caution = { level };
    const { growth, cap } = app.growthParams(caution);
    const steps = app.phaseRampSteps(R);
    const split = Array.from(app.phaseSplit(R));
    const at = (i, now) => {
      const info = Object.assign(infoAt(app, R, i), { rampStartKm: start, baseKm });
      return plain(app.phasedWeeklyKm({ goal }, caution, info, now === undefined ? baseKm : now));
    };
    const label = `base ${baseKm} inicio ${start} ${goal} nivel ${level} R=${R}`;
    const peak = at(0).peakKm;
    assert.ok(peak >= start - 1e-9, label);
    assert.ok(peak <= Math.max(start, baseKm * cap) + 1e-9, `${label}: el techo por cautela es sobre la base declarada`);
    assert.ok(Math.abs(at(0).km - start) < 1e-9, `${label}: la primera semana vale rampStartKm`);
    let prevFull = start;
    for (let i = 1; i < R + 3; i++) {
      const w = at(i);
      const cut = i < R && split[i] !== 'peak' && i % 4 === 3;
      if (cut) { assert.ok(Math.abs(w.km - 0.75 * prevFull) < 1e-9, `${label} descarga ${i}`); continue; }
      assert.ok(w.km >= prevFull - 1e-9 && w.km <= prevFull * growth + 1e-9, `${label} semana ${i}: ${w.km} / ${prevFull}`);
      prevFull = w.km;
    }
    const lastRamp = split.indexOf('peak') - 1;
    const lastFull = lastRamp % 4 === 3 ? lastRamp - 1 : lastRamp;
    assert.ok(Math.abs(at(lastFull).km - peak) < 1e-9, `${label}: la última semana completa de rampa es el pico`);
    // escala por base de hoy / base del cronograma (ajuste automático o parate), con piso 0,5
    assert.ok(Math.abs(at(0, baseKm * 0.9).km - start * 0.9) < 1e-9, `${label}: x0,9`);
    assert.ok(Math.abs(at(0, baseKm * 0.2).km - start * 0.5) < 1e-9, `${label}: piso 0,5`);
  })));
  // si arranca por encima del pico de la distancia, se sostiene ahí (nunca baja en la rampa)
  const hold = Array.from({ length: 19 }, (_, i) => plain(app.phasedWeeklyKm({ goal: '10k' }, { level: 0 }, Object.assign(infoAt(app, 16, i), { rampStartKm: 54, baseKm: 30 }), 30)));
  hold.forEach((w, i) => assert.ok(Math.abs(w.km - (i < 14 && i % 4 === 3 ? 0.75 * 54 : 54)) < 1e-9, `semana ${i}: ${w.km}`));
});

// Corredor de 21k (35 km/sem) con cronograma creado el 2026-10-14 (ancla 2026-10-19, carrera 18
// semanas después); su última carrera fue el miércoles de la semana `lastIdx` del plan y vuelve a
// abrir la app el miércoles de la semana `backIdx`.
function breakApp(goal, base, lastIdx, backIdx) {
  const p = fwProfile({ goal, weeklyKm: base, currentWeeklyKm: base });
  const app = fwApp(p);
  app.state.onboarded = true;
  app.state.weekNumber = 1;
  app.state.weekStart = app.getMondayISO(new app.Date());
  const anchor = app.addDaysToIsoLocal(app.state.weekStart, 7);
  p.raceDate = app.addDaysToIsoLocal(anchor, 18 * 7 + 6);
  app.refreshPhaseSchedule();
  const lastWeek = app.addDaysToIsoLocal(anchor, lastIdx * 7);
  // historia: 8 semanas corriendo ~base km hasta la última carrera
  for (let w = 0; w < 8; w++) {
    const d = app.addDaysToIsoLocal(lastWeek, -7 * w + 2);
    app.state.runs.push({ id: 'r' + w, date: d + 'T08:00:00', distanceKm: base, durationSec: base * 330 });
  }
  app.state.weekStart = lastWeek;
  app.state.weekNumber = lastIdx + 2;
  app.state.plan = plain(app.generatePlan(p, app.state.weekNumber, lastWeek));
  const back = app.addDaysToIsoLocal(anchor, backIdx * 7);
  app.Date = makeFrozenDate(app.addDaysToIsoLocal(back, 2) + 'T12:00:00');
  return { app, p, back };
}

test('C1: volver de un parate de 4+ semanas a mitad del plan reinicia la rampa desde la base reducida (rollover)', () => {
  [['21k', 35, 7, 12], ['42k', 40, 4, 12], ['10k', 30, 6, 11]].forEach(([goal, base, lastIdx, backIdx]) => {
    const { app, p, back } = breakApp(goal, base, lastIdx, backIdx);
    app.checkWeekRollover();
    const label = `${goal} base ${base}`;
    assert.equal(app.state.weekStart, back, label);
    const reset = app.state.weekNumber;
    assert.ok(reset === 1 || reset === 2, `${label}: weekNumber reiniciado (${reset})`);
    const reduced = p.weeklyKm;
    assert.ok(reduced < base, label);
    // el plan de v4 con el mismo perfil reducido y el weekNumber reiniciado: la referencia segura
    const sched = app.state.phaseSchedule;
    app.state.phaseSchedule = null;
    const v4Target = reduced * app.weekMultiplier(reset, app.trainingCaution(p), true);
    const v4Printed = sumDist(plain(app.generatePlan(p, reset, back)));
    app.state.phaseSchedule = sched;
    const target = engineKm(app, p, back);
    if (target !== null) {
      assert.equal(sched.anchor, back, `${label}: la rampa arranca en la semana de la vuelta`);
      assert.ok(Math.abs(target - v4Target) < 1e-9, `${label}: objetivo ${target} vs v4 ${v4Target}`);
    }
    const printed = sumDist(app.state.plan);
    assert.ok(printed <= v4Printed * 1.06 + 1, `${label}: primera semana ${printed} km vs v4 ${v4Printed}`);
    // y la semana siguiente sigue subiendo de a un paso, no salta al volumen de antes del parate
    const nextWs = app.addDaysToIsoLocal(back, 7);
    const next = engineKm(app, p, nextWs);
    if (next !== null && target !== null) assert.ok(next <= target * 1.06 + 1e-9, `${label}: semana siguiente ${next} vs ${target}`);
  });
});

test('C1: "Armar plan de regreso" (applyReturnPlan) con un parate largo reinicia la rampa igual', () => {
  const { app, p, back } = breakApp('21k', 35, 6, 12);
  // la app ya pasó el lunes (rollover hecho sin detectar parate: el corredor lo pide desde la tarjeta)
  app.state.weekStart = back;
  app.state.weekNumber = 14;
  app.state.breakAdjLastRunMs = null;
  app.state.plan = plain(app.generatePlan(p, 14, back));
  const before = sumDist(app.state.plan);
  app.applyReturnPlan();
  assert.equal(p.returningFromBreak, true);
  const reset = app.state.weekNumber;
  assert.equal(reset, 2);
  const sched = app.state.phaseSchedule;
  app.state.phaseSchedule = null;
  const v4Printed = sumDist(plain(app.generatePlan(p, reset, back)));
  app.state.phaseSchedule = sched;
  const after = sumDist(app.state.plan);
  assert.ok(after <= v4Printed * 1.06 + 1, `vuelta ${after} km vs v4 ${v4Printed} (antes ${before})`);
  assert.equal(sched.anchor, back);
  assert.ok(Math.abs(engineKm(app, p, back) - p.weeklyKm * app.weekMultiplier(2, app.trainingCaution(p), true)) < 1e-9);
});

test('C1: si desde la vuelta ya no quedan 4 semanas útiles, el plan vuelve a v4 con el weekNumber reiniciado', () => {
  const { app, p, back } = breakApp('10k', 30, 10, 16);
  app.checkWeekRollover();
  assert.equal(app.state.weekStart, back);
  assert.equal(app.phaseForWeek(p, back, app.state.phaseSchedule).active, false);
  const reset = app.state.weekNumber;
  app.state.phaseSchedule = null;
  assert.deepEqual(plain(app.state.plan), plain(app.generatePlan(p, reset, back)));
});

// Corredor con cronograma creado en la semana v4 `wn0` y el reloj en el miércoles de la semana `idx`
// del plan (weekNumber = wn0 + idx + 1, como lo deja el rollover).
function midPlanApp(goal, base, weeksToRace, idx, wn0) {
  const p = fwProfile({ goal, weeklyKm: base, currentWeeklyKm: base });
  const app = fwApp(p);
  app.state.onboarded = true;
  app.state.weekNumber = wn0 || 1;
  app.state.weekStart = app.getMondayISO(new app.Date());
  const anchor = app.addDaysToIsoLocal(app.state.weekStart, 7);
  p.raceDate = app.addDaysToIsoLocal(anchor, weeksToRace * 7 + 6);
  app.refreshPhaseSchedule();
  const wk = app.addDaysToIsoLocal(anchor, idx * 7);
  app.Date = makeFrozenDate(app.addDaysToIsoLocal(wk, 2) + 'T12:00:00');
  app.state.weekStart = wk;
  app.state.weekNumber = (wn0 || 1) + idx + 1;
  app.state.plan = plain(app.generatePlan(p, app.state.weekNumber, wk));
  return { app, p, wk, next: app.addDaysToIsoLocal(wk, 7) };
}
// Volumen v4 (objetivo del motor) de la semana número n para el perfil.
const v4Km = (app, p, n) => Math.max(9, app.phaseEffectiveWeeklyKm(p, false)) * app.weekMultiplier(n, app.trainingCaution(p), true);

// Empalme: la semana que viene de v4 alcanza la continuación y sube como mucho un paso más (dos si la
// actual se corrió para no caer en una descarga de v4); ni la actual ni la siguiente son descarga de v4.
function assertBridge(app, nextV4, cont, growth, msg) {
  const wn = app.state.weekNumber;
  const limit = (wn % 4 === 1 && wn > 1) ? growth * growth : growth;
  assert.ok(nextV4 >= cont - 1e-9 && nextV4 <= cont * limit + 1e-9, msg);
  assert.ok(wn % 4 !== 0 && (wn + 1) % 4 !== 0, 'sin descarga de v4 en la semana actual ni en la siguiente: ' + wn);
}

test('I4: dejar el plan por fases (meta general en mantenimiento) no salta al volumen de v4 de weekNumber alto', () => {
  const { app, p, wk, next } = midPlanApp('10k', 30, 10, 16); // carrera en la semana 10: idx 16 = mantenimiento
  assert.equal(app.phaseForWeek(p, wk, app.state.phaseSchedule).phase, 'maintenance');
  const growth = app.growthParams(app.trainingCaution(p)).growth;
  const cont = engineKm(app, p, next) / (app.phaseIsCutbackWeek(app.phaseForWeek(p, next, app.state.phaseSchedule)) ? 0.75 : 1);
  app.applyProfileChange({ objetivo: 'general' });
  assert.equal(app.state.phaseSchedule, null);
  const nextV4 = v4Km(app, p, app.state.weekNumber + 1);
  assertBridge(app, nextV4, cont, growth, `semana siguiente v4 ${nextV4} vs mantenimiento ${cont}`);
  // lo que se imprime también: la semana que viene (getNextWeekPlan) no salta
  const printed = sumDist(app.getNextWeekPlan().plan);
  assert.ok(printed <= cont * growth * 1.1 + 1, `impresa ${printed} vs ${cont}`);
});

test('I4: una carrera nueva con menos de 4 semanas útiles empalma la curva de v4 con el volumen que venía', () => {
  const { app, p, wk, next } = midPlanApp('5k', 30, 16, 9); // pico 35; v4 en weekNumber 11 daría ~45
  const growth = app.growthParams(app.trainingCaution(p)).growth;
  const info = app.phaseForWeek(p, next, app.state.phaseSchedule);
  const cont = engineKm(app, p, next) / (app.phaseIsCutbackWeek(info) ? 0.75 : 1);
  app.applyProfileChange({ fecha_carrera: app.addDaysToIsoLocal(wk, 3 * 7 + 6) }); // R < 4
  assert.equal(app.phaseForWeek(p, next, app.state.phaseSchedule).active, false);
  const nextV4 = v4Km(app, p, app.state.weekNumber + 1);
  assertBridge(app, nextV4, cont, growth, `v4 ${nextV4} vs ${cont}`);
});

test('I4: reemplazar el cronograma a mitad de plan ("a partir de ahora") no salta la semana actual a v4', () => {
  // 5k (pico 35) en la semana 10 del plan: v4 en weekNumber 12 daría ~48 km
  const { app, p, wk } = midPlanApp('5k', 30, 14, 10);
  const growth = app.growthParams(app.trainingCaution(p)).growth;
  const current = engineKm(app, p, wk) / (app.phaseIsCutbackWeek(app.phaseForWeek(p, wk, app.state.phaseSchedule)) ? 0.75 : 1);
  p.raceDate = app.addDaysToIsoLocal(p.raceDate, 14);
  app.refreshPhaseSchedule();
  app.applyPersonalDataChangeNow(); // "a partir de ahora": regenera la semana actual
  assert.equal(app.phaseForWeek(p, wk, app.state.phaseSchedule).active, false, 'la semana actual queda fuera del cronograma nuevo');
  const nowV4 = v4Km(app, p, app.state.weekNumber);
  assert.ok(nowV4 <= current * growth + 1e-9 && nowV4 >= current / growth / growth - 1e-9, `semana actual v4 ${nowV4} vs ${current}`);
});

test('I4: el empalme no toca weekNumber si no había plan por fases o si la semana actual sigue cubierta', () => {
  const p = fwProfile({ goal: '10k' });
  const app = fwApp(p);
  app.state.onboarded = true;
  app.state.weekNumber = 20;
  app.state.weekStart = app.getMondayISO(new app.Date());
  p.raceDate = app.addDaysToIsoLocal(app.state.weekStart, 7 + 12 * 7 + 6);
  app.refreshPhaseSchedule(); // entrada desde v4: weekNumber queda igual
  assert.equal(app.state.weekNumber, 20);
  p.goal = 'general';
  const fresh = fwApp(p);
  fresh.state.weekNumber = 20;
  fresh.state.weekStart = app.state.weekStart;
  fresh.refreshPhaseSchedule(); // sin cronograma antes: nada que empalmar
  assert.equal(fresh.state.weekNumber, 20);
});

test('I4: deshacer el cambio que terminó el plan por fases devuelve también el weekNumber', () => {
  const { app, p } = midPlanApp('10k', 30, 10, 16);
  const wn = app.state.weekNumber;
  const sched = plain(app.state.phaseSchedule);
  app.applyProfileChange({ objetivo: 'general' });
  assert.notEqual(app.state.weekNumber, wn);
  app.applyUndoLastChange();
  assert.equal(app.state.weekNumber, wn);
  assert.deepEqual(plain(app.state.phaseSchedule), sched);
  assert.equal(app.state.profile.goal, '10k');
});

const HARD_KEYS = ['tempo', 'intervals', 'hills', 'fartlek', 'progression'];
const hardCount = plan => plan.filter(d => HARD_KEYS.includes(d.typeKey)).length;

test('I1: con fases, la descarga de intensidad y de tirada sigue a phaseIsCutbackWeek, no a weekNumber', () => {
  ['distance', 'time'].forEach(trainBy => {
    const p = racingProfile({ trainBy }); // 21k, 4 días, ancla 2026-11-02, R=16
    const { app } = phasedApp(p);
    for (let idx = 0; idx < 16; idx++) {
      const week = app.addDaysToIsoLocal('2026-11-02', idx * 7);
      const info = app.phaseForWeek(p, week, app.state.phaseSchedule);
      const cut = app.phaseIsCutbackWeek(info);
      const longs = [];
      for (let wn = 1; wn <= 8; wn++) {
        const plan = plain(app.generatePlan(p, wn, week));
        // 4 días, cautela 0: 2 sesiones fuertes, 1 en la semana de descarga del plan por fases
        assert.equal(hardCount(plan), cut ? 1 : 2, `${trainBy} idx ${idx} (${info.phase}) weekNumber ${wn}`);
        longs.push(plan.find(d => d.typeKey === 'long')[trainBy === 'time' ? 'durMin' : 'dist']);
      }
      if (trainBy === 'distance') {
        const total = app.phasedWeeklyKm(p, app.trainingCaution(p), info, 30).km;
        const share = { base: 0.28, build: 0.30, specific: 0.32, peak: 0.33 }[info.phase];
        const want = Math.min(24, Math.round(total * share * (cut ? 0.8 : 1)));
        // nunca la tirada x0,8 en una semana completa (el reparto de I5 sí puede agrandarla)
        longs.forEach((l, i) => assert.ok(l >= want - 1.5 && l <= 24, `idx ${idx} weekNumber ${i + 1}: tirada ${l} vs ${want}`));
      }
    }
  });
});

test('I1: una semana peak de 5k (3+ días) siempre tiene sesión fuerte, sea cual sea weekNumber', () => {
  [['tue', 'thu', 'sun'], ['tue', 'wed', 'fri', 'sun']].forEach(days => {
    const p = racingProfile({ goal: '5k', trainingDays: days });
    const { app } = phasedApp(p, Object.assign(plain(SCHEDULE), { goal: '5k' }));
    ['2027-02-08', '2027-02-15'].forEach(week => {
      assert.equal(app.phaseForWeek(p, week, app.state.phaseSchedule).phase, 'peak');
      for (let wn = 1; wn <= 8; wn++) assert.ok(hardCount(plain(app.generatePlan(p, wn, week))) >= 1, `${days.length} días ${week} weekNumber ${wn}`);
    });
  });
});

test('I1: mantenimiento tiene descarga cada 4ta semana (x0,75 y etiqueta); post nunca', () => {
  const app = loadApp();
  const p = postProfile();
  const caution = app.trainingCaution(p);
  [POST_W1, POST_W2].forEach(w => assert.equal(app.phaseIsCutbackWeek(app.phaseForWeek(p, w, POST_SCHEDULE)), false, w));
  for (let i = 0; i < 12; i++) {
    const week = app.addDaysToIsoLocal(MAINT_W1, i * 7);
    const info = app.phaseForWeek(p, week, POST_SCHEDULE);
    const cut = (i + 1) % 4 === 0;
    assert.equal(app.phaseIsCutbackWeek(info), cut, week);
    assert.ok(Math.abs(app.phasedWeeklyKm(p, caution, info, 30).km - (cut ? 42.5 * 0.75 : 42.5)) < 1e-9, week);
  }
  // la etiqueta de la pantalla la sigue: la 4ta semana de mantenimiento (2027-04-19) es descarga
  assert.deepEqual(tagScreen({ goal: '10k' }, plain(POST_SCHEDULE), '2027-04-19', 3), { tag: true, note: true });
  assert.deepEqual(tagScreen({ goal: '10k' }, plain(POST_SCHEDULE), '2027-04-12', 4), { tag: false, note: false });
});

test('I7: modificar_perfil con carrera y km nuevos a la vez calcula el cronograma con el weeklyKm nuevo', () => {
  const p = racingProfile();
  const { app } = phasedApp(p);
  app.renderAll = () => {}; app.renderZones = () => {};
  app.state.weekStart = '2026-10-26';
  app.state.weekNumber = 1;
  app.state.plan = plain(app.generatePlan(p, 1, '2026-10-26'));
  app.applyProfileChange({ fecha_carrera: '2027-04-04', km_actuales: 20 });
  assert.equal(app.state.profile.weeklyKm, 20);
  const s = app.state.phaseSchedule;
  assert.equal(s.baseKm, 20, 'la base del cronograma es la nueva');
  const caution = app.trainingCaution(app.state.profile);
  const want = app.phasePeakFromStart('21k', 20, s.rampStartKm, caution, app.phaseRampSteps(app.phaseScheduleR(s)));
  assert.equal(s.peakKm, want.peakKm);
  assert.ok(s.peakKm <= 20 * 1.8 + 1e-9, `pico ${s.peakKm} con base 20`);
});

// Carreras: una de Strava (rapidísima, 10 km en 40:00) y, opcionalmente, una propia (10 km en 55:00).
function stravaRuns(withOwn) {
  const runs = [{ id: 's1', source: 'strava', date: '2026-10-04T08:00:00', distanceKm: 10, durationSec: 2400 }];
  if (withOwn) runs.push({ id: 'o1', source: 'manual', date: '2026-10-05T08:00:00', distanceKm: 10, durationSec: 3300 });
  return runs;
}

test('I3: el ritmo de carrera del plan por fases no usa carreras de Strava (marcas propias o refRace)', () => {
  const p = racingProfile({ goal: '10k' });
  const { app } = phasedApp(p, null, '2026-10-14T12:00:00');
  app.state.runs = stravaRuns(true);
  // predictRaceTime del resto de la app sigue igual: con la de Strava, 40:00
  assert.ok(Math.abs(plain(app.predictRaceTime(10)).predictedSec - 2400) < 60, 'Perfil sigue viendo todas las carreras');
  // el plan por fases solo ve la propia (55:00)
  const pace = app.phaseRacePaceSec('10k');
  const own = app.predictRaceBase(10, app.state.runs.filter(r => r.source !== 'strava'));
  assert.ok(Math.abs(pace - own.predictedSec / 10) < 1e-6, `${pace} vs ${own.predictedSec / 10}`);
  assert.ok(pace > 300, `ritmo ${pace} s/km no sale de la de Strava (240 s/km)`);
});

test('I3: solo con carreras de Strava el ritmo sale del test de nivel; sin datos, null', () => {
  const p = racingProfile({ goal: '21k' });
  const { app } = phasedApp(p, null, '2026-10-14T12:00:00');
  app.state.runs = stravaRuns(false);
  assert.equal(app.phaseRacePaceSec('21k'), null, 'sin refRace, sin propias y sin test: null');
  p.levelTest = { required: true, done: true, vdot: 45, distanceM: 2900, date: '2026-10-01', paces: { easy: [5.8, 6.6], tempo: [4.7, 4.9], interval: [4.2, 4.4] } };
  const want = app.raceSecFromVdot(45, 21097.5) / 21.0975;
  assert.ok(Math.abs(app.phaseRacePaceSec('21k') - want) < 1e-6, `${app.phaseRacePaceSec('21k')} vs ${want}`);
  // y las sesiones lo llevan
  const { app: a2 } = phasedApp(Object.assign({}, p), Object.assign(plain(SCHEDULE), { goal: '21k' }), '2026-10-14T12:00:00');
  a2.state.runs = stravaRuns(false);
  const week = weekOfPhase(a2, a2.state.profile, a2.state.phaseSchedule, 'specific', 0);
  const days = [];
  for (let wn = 1; wn <= 4; wn++) days.push(...plain(a2.generatePlan(a2.state.profile, wn, week)));
  assert.ok(days.some(d => d.racePaceSec === Math.round(want)), 'specific con el ritmo del test');
});

test('M6: GOAL_RACE_KM es la tabla única de km por meta (getGoalRaceKm y phaseRacePaceSec)', () => {
  const app = loadApp();
  const vm = require('node:vm');
  assert.deepEqual(plain(vm.runInContext('GOAL_RACE_KM', app)), { '5k': 5, '10k': 10, '15k': 15, '21k': 21.0975, '42k': 42.195 });
  app.state.profile = { goal: '42k' };
  assert.equal(app.getGoalRaceKm(), 42.195);
  app.state.profile = { goal: 'general' };
  assert.equal(app.getGoalRaceKm(), null);
});

test('I2: 5k y 10k llevan el ritmo de carrera solo en series; 15k, 21k y 42k solo en tempo (+ bloque de la tirada en 21k/42k)', () => {
  ['5k', '10k', '15k', '21k', '42k'].forEach(goal => ['distance', 'time'].forEach(trainBy => {
    const { app, p, schedule } = racePaceApp({ goal, trainBy, trainingDays: ['mon', 'tue', 'thu', 'fri', 'sun'] });
    const want = expectedRacePace(app, goal);
    const short = goal === '5k' || goal === '10k';
    const carrier = short ? 'intervals' : 'tempo';
    let carried = 0;
    ['specific', 'peak', 'taper'].forEach(phase => rpPlans(app, p, schedule, phase).forEach(d => {
      const label = `${goal} ${trainBy} ${phase} ${d.typeKey}`;
      if (d.typeKey === carrier) { assert.equal(d.racePaceSec, want, label); carried++; }
      else if (d.typeKey === 'long' && d.racePaceBlockKm) assert.ok(!short && trainBy === 'distance' && phase !== 'taper', label);
      else assert.equal('racePaceSec' in d, false, label);
    }));
    assert.ok(carried > 0, `${goal} ${trainBy}: alguna sesión lleva el ritmo`);
  }));
});

test('I2: una sesión con ritmo de carrera no muestra además el rango del test de nivel (un solo ritmo objetivo)', () => {
  [['10k', 'intervals'], ['21k', 'tempo']].forEach(([goal, type]) => {
    const { app, p, schedule } = racePaceApp({ goal });
    p.levelTest = { done: true, vdot: 45, paces: { easy: [5.8, 6.6], tempo: [4.7, 4.9], interval: [4.2, 4.4] } };
    const days = rpPlans(app, p, schedule, 'specific');
    const d = days.find(x => x.typeKey === type && x.racePaceSec);
    assert.ok(d, `${goal}: hay ${type} con ritmo`);
    const desc = plain(app.planLabelBody(d)).desc;
    const range = app.fmtPaceRange(type === 'tempo' ? p.levelTest.paces.tempo : p.levelTest.paces.interval);
    assert.ok(!desc.includes(range), `${goal}: ${desc}`);
    assert.ok(desc.includes(app.fmtPace(d.racePaceSec / 60)), desc);
    // la misma sesión sin ritmo de carrera sí muestra el rango del test
    const bare = Object.assign({}, d); delete bare.racePaceSec;
    assert.ok(plain(app.planLabelBody(bare)).desc.includes(range));
    // la tirada con bloque conserva el rango suave para el resto de la tirada (otro tramo, otro ritmo)
    const long = days.find(x => x.typeKey === 'long' && x.racePaceBlockKm);
    if (long) assert.ok(plain(app.planLabelBody(long)).desc.includes(app.fmtPaceRange(p.levelTest.paces.easy)));
  });
});

// Barrido de corredores con fases (cronograma creado el 2026-10-14) para I5/I6: llama a fn(app, p, ws, info, plan, label)
// en cada semana activa (ancla .. carrera + 5 semanas) con varios weekNumber.
const FW_DAYS = { 2: ['wed', 'sun'], 3: ['tue', 'thu', 'sun'], 4: ['tue', 'wed', 'fri', 'sun'], 5: ['mon', 'tue', 'thu', 'fri', 'sun'], 6: ['mon', 'tue', 'wed', 'thu', 'fri', 'sun'] };
function sweepPhaseWeeks({ goals, bases, days, Ws, offs, trainBy }, fn) {
  const app = fwApp(null);
  goals.forEach(goal => bases.forEach(base => days.forEach(nd => Ws.forEach(W => {
    const p = fwProfile({ goal, weeklyKm: base, currentWeeklyKm: base, trainingDays: FW_DAYS[nd], trainBy: trainBy || 'distance' });
    app.state.profile = p; app.state.phaseSchedule = null; app.state.weekNumber = 1;
    app.state.weekStart = app.getMondayISO(new app.Date());
    const anchor = app.addDaysToIsoLocal(app.state.weekStart, 7);
    p.raceDate = app.addDaysToIsoLocal(anchor, W * 7 + 6);
    app.refreshPhaseSchedule();
    for (let idx = 0; idx <= W + 5; idx++) {
      const ws = app.addDaysToIsoLocal(anchor, idx * 7);
      const info = app.phaseForWeek(p, ws, app.state.phaseSchedule);
      if (!info.active) continue;
      (offs || [0]).forEach(off => fn(app, p, ws, info, plain(app.generatePlan(p, idx + 1 + off, ws)), `${goal} ${base} km ${nd} días W${W} idx${idx} ${info.phase} wn+${off}`));
    }
  }))));
}

test('I5: con fases (modo distancia) cada semana impresa queda a +-10% del volumen que busca el motor', () => {
  // Dominio donde las reglas de sesión lo permiten: 20-50 km/semana, 4-6 días. Fuera de él hay casos que
  // las propias reglas impiden (2-3 días con mucho volumen: tirada <= tope y las demás <= tirada - 1;
  // menos de ~15 km en 5-7 días: el mínimo de 4 repeticiones de una estructura ya pasa su parte).
  let weeks = 0;
  sweepPhaseWeeks({ goals: ALL_GOALS, bases: [20, 30, 40, 50], days: [4, 5, 6], Ws: [9, 18], offs: [0, 1, 2, 3] }, (app, p, ws, info, plan, label) => {
    const target = Math.max(9, app.phasedWeeklyKm(p, app.trainingCaution(p), info, app.phaseEffectiveWeeklyKm(p, false)).km * app.taperMultiplier(p, ws));
    const got = sumDist(plan);
    weeks++;
    assert.ok(Math.abs(got - target) <= target * 0.10, `${label}: ${got} km vs ${target.toFixed(1)}`);
  });
  assert.ok(weeks > 2000, `semanas: ${weeks}`);
});

test('I5: el reparto solo suma a rodajes y tirada (las sesiones de calidad no cambian) y respeta rodaje <= tirada - 1', () => {
  sweepPhaseWeeks({ goals: ['5k', '21k'], bases: [30, 50], days: [4, 5], Ws: [12], offs: [0, 1] }, (app, p, ws, info, plan, label) => {
    const long = plan.find(d => d.typeKey === 'long');
    if (!long) return;
    plan.filter(d => d.typeKey === 'easy').forEach(d => assert.ok(d.dist <= long.dist - 1, `${label}: rodaje ${d.dist} vs tirada ${long.dist}`));
    plan.filter(d => d.interval && d.typeKey !== 'easy').forEach(d => {
      if (d.typeKey === 'intervals') assert.equal(d.dist, app.intervalActualKm(d.interval), label);
      if (d.typeKey === 'hills') assert.equal(d.dist, app.hillActualKm(d.interval), label);
      if (d.typeKey === 'fartlek') assert.equal(d.dist, app.fartlekActualKm(d.interval, p), label);
    });
  });
});

test('I5: por tiempo (mejor esfuerzo) el reparto también llega: semanas de 4-5 días con 25-40 km a +-10% de los minutos buscados', () => {
  sweepPhaseWeeks({ goals: ['10k', '21k'], bases: [25, 40], days: [4, 5], Ws: [12], offs: [0, 1], trainBy: 'time' }, (app, p, ws, info, plan, label) => {
    const km = app.phasedWeeklyKm(p, app.trainingCaution(p), info, app.phaseEffectiveWeeklyKm(p, false)).km * app.taperMultiplier(p, ws);
    const target = Math.max(9, km) * app.estimateBasePaceMinPerKm(p);
    const got = plan.reduce((a, d) => a + (d.durMin || 0), 0);
    assert.ok(Math.abs(got - target) <= target * 0.10 + 5, `${label}: ${got} min vs ${target.toFixed(0)}`);
  });
});

test('I6: la tirada es la sesión más larga: tope escalado por el pico y rodajes <= tirada - 1 en cualquier cantidad de días', () => {
  const app = loadApp();
  assert.equal(app.phaseLongCapKm('5k', 35), 12);
  assert.equal(app.phaseLongCapKm('5k', 65), 18); // 12 x min(1,5, 65/35)
  assert.equal(app.phaseLongCapKm('10k', 50), 18); // round(16 x 50/45)
  assert.equal(app.phaseLongCapKm('42k', 20), 32);
  assert.equal(app.phaseLongCapKm('general', 50), undefined);
  // casos de la revisión: 5k a 65 km (largas de 12 con rodajes de 14-19), base 15 con 4 días, descargas
  sweepPhaseWeeks({ goals: ['5k', '10k', '21k'], bases: [15, 30, 65], days: [4, 5], Ws: [12, 18], offs: [0, 1, 2, 3] }, (app2, p, ws, info, plan, label) => {
    if (info.phase === 'post') return;
    const long = plan.find(d => d.typeKey === 'long');
    if (!long) return;
    plan.filter(d => d.typeKey === 'easy').forEach(d => assert.ok(d.dist < long.dist, `${label}: rodaje ${d.dist} >= tirada ${long.dist}`));
    const peak = app2.phasedWeeklyKm(p, app2.trainingCaution(p), info, app2.phaseEffectiveWeeklyKm(p, false)).peakKm;
    assert.ok(long.dist <= app2.phaseLongCapKm(p.goal, peak), `${label}: tirada ${long.dist}`);
  });
});

test('M8: en la recuperación (post) con 2-3 días ningún rodaje pasa el tope de la tirada', () => {
  [['5k', 80, 2], ['10k', 80, 2], ['21k', 50, 3]].forEach(([goal, base, nd]) => {
    let seen = 0;
    sweepPhaseWeeks({ goals: [goal], bases: [base], days: [nd], Ws: [6] }, (app, p, ws, info, plan, label) => {
      if (info.phase !== 'post') return;
      seen++;
      const cap = app.phaseLongCapKm(goal, app.state.phaseSchedule.peakKm);
      plan.filter(d => d.typeKey === 'easy').forEach(d => assert.ok(d.dist <= cap, `${label}: rodaje ${d.dist} > ${cap}`));
    });
    assert.equal(seen, 2, goal);
  });
});

test('I5: en la rampa (20-50 km, 4-6 días) ninguna semana impresa completa pasa 1,10 x la anterior completa', () => {
  const prev = {};
  let pairs = 0;
  sweepPhaseWeeks({ goals: ALL_GOALS, bases: [20, 30, 40, 50], days: [4, 5, 6], Ws: [9, 18], offs: [0, 1, 2, 3] }, (app, p, ws, info, plan, label) => {
    const key = label.replace(/ idx\d+ \w+ /, ' ');
    if (!RAMP_PHASES.includes(info.phase)) { delete prev[key]; return; }
    if (app.phaseIsCutbackWeek(info)) return;
    const km = sumDist(plan);
    if (prev[key] !== undefined) { pairs++; assert.ok(km <= prev[key] * 1.10, `${label}: ${prev[key]} -> ${km}`); }
    prev[key] = km;
  });
  assert.ok(pairs > 3000, `pares: ${pairs}`);
});

// ---- Fix wave: menores ----

test('M2: el contexto de Zonda nombra la fase sin un segundo conteo de semanas (el de la carrera ya está)', () => {
  [['base', 'base'], ['build', 'desarrollo'], ['specific', 'específica'], ['peak', 'pico'], ['taper', 'reducción final']].forEach(([phase, label]) => {
    const { app } = planScreenApp(null);
    const before = app.buildContext();
    app.state.phaseNow = { phase, weeksToRace: 7, limited: false, peakKm: 50 };
    const after = app.buildContext();
    const sentence = ` Fase actual del plan: ${label}.`;
    assert.ok(after.includes(sentence), after.slice(0, 400));
    assert.equal(after.replace(sentence, ''), before, 'solo agrega esa frase');
    assert.ok(!after.includes('faltan 7 semanas para la carrera objetivo'));
  });
});

test('M3: al refrescar el estado desde el servidor, phaseNow se recalcula (no queda el guardado)', async () => {
  const vm = require('node:vm');
  const p = racingProfile();
  const sched = withPeak(loadApp(), p, SCHEDULE);
  const { app } = phasedApp(p, sched);
  app.setCurrentUserId('u1');
  const server = { onboarded: true, profile: plain(p), phaseSchedule: plain(sched), weekStart: BUILD_WEEK, weekNumber: 5, runs: [], plan: [], chat: [],
    phaseNow: { phase: 'base', weeksToRace: 99, limited: false, peakKm: 1 } };
  vm.runInContext('supabaseClient', app).from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { data: server, updated_at: '2026-10-28T00:00:00Z' } }) }) }) });
  await app.refreshStateFromServer();
  const now = vm.runInContext('state.phaseNow', app);
  assert.equal(now.phase, 'build');
  assert.equal(now.weeksToRace, 14);
});

test('M4: una versión del plan más nueva que la de este build no se regenera (build viejo instalado)', () => {
  const { app } = phasedApp(racingProfile(), null);
  app.state.onboarded = true;
  app.state.weekStart = BUILD_WEEK;
  const plan = [{ day: 'tue', typeKey: 'easy', dist: 7, zone: 2 }];
  app.state.plan = plan;
  app.state.planAlgoVersion = 6;
  app.checkPlanAlgoVersion();
  assert.equal(app.state.plan, plan);
  assert.equal(app.state.planAlgoVersion, 6);
});

test('M5: la nota del pico limitado solo sale si el pico queda por debajo del 90% del de la distancia', () => {
  // 21k: pico de la distancia 55 -> umbral 49,5
  const close = planScreenApp({ phase: 'base', weeksToRace: 5, limited: true, peakKm: 52 });
  close.app.renderPlan();
  assert.equal(close.els['plan-phase-note'].textContent, close.app.t('plan_phase_line', { phase: close.app.t('plan_phase_base'), weeks: 5 }));
  const far = planScreenApp({ phase: 'base', weeksToRace: 5, limited: true, peakKm: 49 });
  far.app.renderPlan();
  assert.ok(far.els['plan-phase-note'].textContent.includes(far.app.t('plan_peak_limited_note', { km: '49', unit: 'km' })));
  // 10k con 42,6 de 45 (el caso de la revisión): sin nota
  const ten = planScreenApp({ phase: 'base', weeksToRace: 5, limited: true, peakKm: 42.6 }, { goal: '10k' });
  ten.app.renderPlan();
  assert.ok(!ten.els['plan-phase-note'].textContent.includes('\n'), ten.els['plan-phase-note'].textContent);
});

test('M7: phaseRampCount / phaseRampSteps / phaseRampCutback no tiran con R < 4', () => {
  const app = loadApp();
  [3, 2, 0, -1, NaN].forEach(R => {
    assert.doesNotThrow(() => app.phaseRampCount(R), String(R));
    assert.equal(app.phaseRampCount(R), 0, String(R));
    assert.equal(app.phaseRampSteps(R), 1, String(R));
    assert.equal(app.phaseRampCutback(3, R), false, String(R));
  });
});

test('M11: t() reemplaza un marcador repetido y no interpreta $& en los valores', () => {
  const app = loadApp();
  const out = app.t('desc_racepace_long_suffix', { km: '5', pace: '$&', unit: 'km' });
  assert.ok(!out.includes('{'), out);
  assert.ok(out.split('km').length - 1 >= 2, out);
  assert.ok(out.includes('$&'), out);
});

test('M11: finishOnboard crea el cronograma con la rampa que arranca en lo de v4 para la semana 2', async () => {
  const vm = require('node:vm');
  const app = loadApp();
  app.Date = makeFrozenDate('2026-10-28T12:00:00');
  app.persist = () => Promise.resolve();
  app.renderChat = () => {}; app.seedCoachGreeting = () => {};
  const vals = { 'ob-name': 'Ana', 'ob-weight': '60', 'ob-height': '165', 'ob-birth': '1990-01-01', 'ob-currentkm': '30', 'ob-goal': '21k', 'ob-racedate': '2027-03-14' };
  const choice = { '#ob-runnertype': 'active', '#ob-terrain': 'asfalto', '#ob-trainby': 'distance', '#ob-gender': 'f' };
  const days = ['tue', 'wed', 'fri', 'sun'];
  app.document.getElementById = id => ({ id, value: vals[id] || '', checked: false, style: {}, textContent: '', innerHTML: '', dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, querySelectorAll: () => [], querySelector: () => null, setAttribute() {}, addEventListener() {}, focus() {}, appendChild() {}, insertAdjacentHTML() {}, getAttribute() { return null; } });
  app.document.querySelector = sel => {
    for (const k in choice) if (sel.startsWith(k)) return { dataset: { v: choice[k] } };
    const m = sel.match(/data-v="(\w+)"/);
    return m ? { classList: { contains: () => days.includes(m[1]) } } : null;
  };
  try { await app.finishOnboard(); } catch (e) { /* lo que viene después del cronograma (saludo, pantallas) no importa acá */ }
  const st = vm.runInContext('state', app);
  assert.equal(st.weekNumber, 1);
  assert.equal(st.phaseSchedule.anchor, '2026-11-02');
  assert.equal(st.phaseSchedule.raceDate, '2027-03-14');
  assert.ok(Math.abs(st.phaseSchedule.rampStartKm - 30 * 1.06) < 1e-9, String(st.phaseSchedule.rampStartKm));
  assert.equal(st.phaseSchedule.baseKm, 30);
});

test('M11: guardar Datos personales con fecha nueva ("a partir de ahora") reemplaza el cronograma y regenera la semana', () => {
  const p = racingProfile();
  const { app } = phasedApp(p, withPeak(loadApp(), p, SCHEDULE), '2026-12-02T12:00:00');
  app.renderAll = () => {}; app.renderPerfil = () => {}; app.flashSaved = () => {};
  app.state.weekStart = '2026-11-30';
  app.state.weekNumber = 6;
  app.state.plan = plain(app.generatePlan(p, 6, '2026-11-30'));
  app.openPlanChangeTimingModal('personal', { raceDate: p.raceDate });
  p.raceDate = '2027-04-04';
  app.resolvePlanChangeTiming('now');
  assert.equal(app.state.phaseSchedule.raceDate, '2027-04-04');
  assert.equal(app.state.phaseSchedule.anchor, '2026-12-07');
  assert.equal(app.state.plan.length, 7);
});

test('M11: plan por fases con cautela >= 2 (60+ años): sin series ni cuestas, un día fuerte, crecimiento <= 4% y pico <= 1,5 x base', () => {
  const p = fwProfile({ goal: '21k', birth: '1960-01-01' });
  const app = fwApp(p);
  assert.equal(app.trainingCaution(p).level, 2);
  app.state.weekNumber = 1;
  app.state.weekStart = app.getMondayISO(new app.Date());
  const anchor = app.addDaysToIsoLocal(app.state.weekStart, 7);
  p.raceDate = app.addDaysToIsoLocal(anchor, 16 * 7 + 6);
  app.refreshPhaseSchedule();
  const s = app.state.phaseSchedule;
  assert.ok(s.peakKm <= 30 * 1.5 + 1e-9, `pico ${s.peakKm}`);
  let prevFull = null;
  for (let idx = 0; idx <= 18; idx++) {
    const ws = app.addDaysToIsoLocal(anchor, idx * 7);
    const info = app.phaseForWeek(p, ws, s);
    for (let wn = 1; wn <= 4; wn++) {
      const plan = plain(app.generatePlan(p, idx + wn, ws));
      assert.ok(!plan.some(d => d.typeKey === 'intervals' || d.typeKey === 'hills'), `idx ${idx} ${info.phase}`);
      assert.ok(hardCount(plan) <= 1, `idx ${idx} ${info.phase}: ${hardCount(plan)} días fuertes`);
    }
    if (['base', 'build', 'specific', 'peak'].includes(info.phase) && !app.phaseIsCutbackWeek(info)) {
      const km = engineKm(app, p, ws);
      if (prevFull !== null) assert.ok(km <= prevFull * 1.04 + 1e-9, `idx ${idx}: ${km} / ${prevFull}`);
      prevFull = km;
    }
  }
});

test('plan-examples: en las semanas con fases los rodajes quedan por debajo de la tirada y el 5k de 3+ días tiene sesión fuerte en peak', () => {
  allRuns().forEach(run => run.rows.forEach(row => {
    if (row.phase === 'v4' || row.phase === 'parate' || row.phase === 'post') return;
    if (row.plan.longKm > 0) assert.ok(row.plan.maxEasyKm < row.plan.longKm, `${run.label} semana ${row.weekNumber}: rodaje ${row.plan.maxEasyKm} vs tirada ${row.plan.longKm}`);
    if (run.goal === '5k' && row.phase === 'peak' && run.trainingDays.split('/').length >= 3) assert.ok(row.plan.hard.length >= 1, `${run.label} semana ${row.weekNumber}`);
  }));
});

test('plan-examples: transiciones sin saltos (entrada desde v4, cambio de fecha, vuelta de un parate)', () => {
  const [entry] = examples()[6].runs;
  assert.equal(entry.rows[0].phase, 'v4');
  assert.ok(entry.rows[1].plan.targetKm >= entry.rows[0].v4.km * 0.75, 'la primera semana por fases no cae');
  const [edit, sameWeek] = examples()[7].runs;
  const i = edit.rows.findIndex(r => r.weekStart === '2026-12-07');
  assert.ok(edit.rows[i].plan.targetKm >= edit.rows[i - 1].plan.targetKm - 0.1, 'después del cambio de fecha sigue desde donde venía');
  assert.equal(sameWeek.anchor, edit.anchor);
  const brk = examples()[8].runs[0];
  const back = brk.rows.find((r, k) => k > 0 && brk.rows[k - 1].phase === 'parate' && r.phase !== 'parate');
  assert.ok(back.plan.km <= back.v4.km * 1.06 + 1, `vuelta del parate: ${back.plan.km} vs v4 ${back.v4.km}`);
});
