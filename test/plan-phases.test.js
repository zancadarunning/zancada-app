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
