// Combinaciones COMPLETAS de las opciones que ofrece la app. Dos redes:
//  1) Núcleo exhaustivo: objetivo (8) x nivel (6) x por tiempo/distancia (2) x las 127 combinaciones de días = 12.192 perfiles, cada uno en las 30 primeras semanas (365.760 planes).
//  2) Todas las parejas del resto de las opciones: para CADA par de valores de dos opciones cualesquiera (edad, peso, terreno, género, pausa larga, posparto, sin cuestas, minutos por sesión,
//     deporte de impacto o no, días de ese deporte, test de nivel, carrera cercana/lejana/pasada, meta semanal, unidades, molestia activa, objetivo, nivel, tiempo/distancia, días) hay al menos un perfil
//     que lo combina, y cada uno se prueba en las 30 primeras semanas.
// En todos: el plan no lanza errores, no tiene números inválidos, respeta los días elegidos, la tirada es la más larga, nunca dos días fuertes seguidos y las reglas del principiante.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');
const { DAY_KEYS, MONDAY, addDays, subsets, checkWeek } = require('./support/plan-checks');

// Reloj congelado el lunes de la semana 1: el resultado no depende del día en que se corren las pruebas (el test de nivel pendiente solo entra en la semana actual y la que viene).
function frozenDate(iso) { const f = new Date(iso).getTime(); return class F extends Date { constructor(...a) { if (a.length === 0) super(f); else super(...a); } static now() { return f; } }; }
function newApp() { const a = loadApp(); a.Date = frozenDate(MONDAY + 'T12:00:00'); return a; }

const GOALS = ['start', '5k', '10k', '15k', '21k', '42k', 'ultra', 'lifestyle'];
const LEVELS = {
  nuevo0: { runnerType: 'new', currentWeeklyKm: 0 }, nuevo3: { runnerType: 'new', currentWeeklyKm: 3 },
  activo10: { runnerType: 'active', currentWeeklyKm: 10 }, activo25: { runnerType: 'active', currentWeeklyKm: 25 },
  activo45: { runnerType: 'active', currentWeeklyKm: 45 }, activo80: { runnerType: 'active', currentWeeklyKm: 80 },
};
const SPORTS = ['futbol', 'basquet', 'voley', 'criquet', 'tenis_padel', 'beisbol', 'rugby', 'futbol_americano', 'handball', 'hockey_cesped', 'hockey_hielo', 'golf', 'boxeo', 'artes_marciales', 'natacion', 'ciclismo', 'remo', 'escalada', 'surf', 'esqui_snowboard', 'patin_skate', 'yoga_pilates', 'otro'];

function baseProfile(core) {
  const lv = LEVELS[core.level];
  const p = { name: 'x', goal: core.goal, runnerType: lv.runnerType, currentWeeklyKm: lv.currentWeeklyKm, weeklyGoalKm: 0, trainingDays: core.days, trainBy: core.trainBy, terrain: 'asfalto', units: 'metric', gender: 'f', weight: 65, height: 170, birth: '1990-06-15', createdAt: MONDAY, availableMinPerSession: 0, crossTrainingSports: [], crossTrainingDays: [] };
  p.weeklyKm = lv.runnerType === 'new' ? 0 : lv.currentWeeklyKm;
  return p;
}

// ---- Opciones secundarias: cada una es una lista de [nombre del valor, función que modifica el perfil] ----
const BIRTH = { 'sin-edad': null, 22: '2004-06-15', 35: '1991-06-15', 47: '1979-06-15', 62: '1964-06-15', 72: '1954-06-15' };
const BMI = { 'sin-peso': [null, null], normal: [65, 170], sobrepeso: [80, 170], obeso: [100, 170], bajo: [45, 175] };
const SECOND = {
  terrain: ['asfalto', 'mixto', 'trail'].map(v => [v, p => { p.terrain = v; }]),
  gender: ['f', 'm', 'x'].map(v => [v, p => { p.gender = v; }]),
  age: Object.keys(BIRTH).map(k => [k, p => { p.birth = BIRTH[k]; }]),
  bmi: Object.keys(BMI).map(k => [k, p => { p.weight = BMI[k][0]; p.height = BMI[k][1]; }]),
  pausa: [false, true].map(v => ['pausa-' + v, p => { p.returningFromBreak = v; }]),
  posparto: [false, true].map(v => ['posparto-' + v, p => { p.pregnancyPostpartum = v; }]),
  cuestas: [['cuestas-ok', () => {}], ['sin-cuestas', p => { p.avoidHills = true; }], ['sin-cuestas-nota', p => { p.coachNotes = ['no puedo hacer cuestas']; }]],
  minutos: [0, 20, 30, 45, 60, 90, 150].map(v => ['min-' + v, p => { p.availableMinPerSession = v; }]),
  deporte: [['sin-deporte', () => {}], ['impacto', p => { p.crossTrainingSports = ['futbol']; }], ['sin-impacto', p => { p.crossTrainingSports = ['natacion']; }], ['varios', p => { p.crossTrainingSports = ['rugby', 'yoga_pilates', 'otro']; }]],
  diasDeporte: [['dd-ninguno', () => {}], ['dd-2', p => { p.crossTrainingDays = ['mon', 'thu']; }], ['dd-4', p => { p.crossTrainingDays = ['tue', 'wed', 'sat', 'sun']; }]],
  test: [['test-no', () => {}], ['test-pendiente', p => { p.levelTest = { required: true, done: false }; }], ['test-continuo', p => { p.levelTest = { required: true, done: true, continuousOk: true }; }], ['test-con-pausas', p => { p.levelTest = { required: true, done: true, continuousOk: false }; }]],
  carrera: [['sin-carrera', () => {}], ['carrera-2sem', p => { p.raceDate = addDays(MONDAY, 14 + 6); }], ['carrera-5sem', p => { p.raceDate = addDays(MONDAY, 35 + 6); }], ['carrera-12sem', p => { p.raceDate = addDays(MONDAY, 84 + 6); }], ['carrera-30sem', p => { p.raceDate = addDays(MONDAY, 210 + 6); }], ['carrera-pasada', p => { p.raceDate = addDays(MONDAY, -21); }]],
  metaSemanal: [0, 8, 25, 70].map(v => ['meta-' + v, p => { p.weeklyGoalKm = v; }]),
  unidades: ['metric', 'imperial'].map(v => [v, p => { p.units = v; }]),
  molestia: [['sin-molestia', () => {}], ['con-molestia', p => { p.__pain = true; }]],
};
// Opciones de núcleo (también entran en las parejas)
const CORE = {
  goal: GOALS.map(v => ['obj-' + v, p => { p.goal = v; }]),
  level: Object.keys(LEVELS).map(v => ['nivel-' + v, p => { Object.assign(p, LEVELS[v]); p.weeklyKm = LEVELS[v].runnerType === 'new' ? 0 : LEVELS[v].currentWeeklyKm; }]),
  trainBy: ['time', 'distance'].map(v => ['por-' + v, p => { p.trainBy = v; }]),
  days: subsets.map(d => ['dias-' + d.join(''), p => { p.trainingDays = d; }]),
};
const ALL = Object.assign({}, CORE, SECOND);

// Todas las parejas (greedy determinista): devuelve una lista de combinaciones {dim: índice de valor}.
function pairwise(dims, seed) {
  const names = Object.keys(dims); const size = names.map(n => dims[n].length);
  let s = seed >>> 0; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const key = (i, a, j, b) => i + ':' + a + '|' + j + ':' + b;
  const uncovered = new Set();
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) for (let a = 0; a < size[i]; a++) for (let b = 0; b < size[j]; b++) uncovered.add(key(i, a, j, b));
  const cases = [];
  while (uncovered.size) {
    let best = null, bestGain = -1;
    // semilla: un par sin cubrir al azar; después se completa cada dimensión con el valor que más pares nuevos cubre
    const arr = Array.from(uncovered); const seedPair = arr[Math.floor(rnd() * arr.length)].split('|').map(x => x.split(':').map(Number));
    for (let attempt = 0; attempt < 6; attempt++) {
      const vals = new Array(names.length).fill(-1);
      vals[seedPair[0][0]] = seedPair[0][1]; vals[seedPair[1][0]] = seedPair[1][1];
      const order = names.map((_, i) => i).filter(i => vals[i] < 0).sort(() => rnd() - 0.5);
      for (const i of order) {
        let bv = 0, bg = -1;
        const start = Math.floor(rnd() * size[i]);
        for (let t = 0; t < size[i]; t++) {
          const v = (start + t) % size[i]; let g = 0;
          for (let j = 0; j < names.length; j++) if (vals[j] >= 0 && j !== i) { if (j < i ? uncovered.has(key(j, vals[j], i, v)) : uncovered.has(key(i, v, j, vals[j]))) g++; }
          if (g > bg) { bg = g; bv = v; }
        }
        vals[i] = bv;
      }
      let gain = 0;
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (uncovered.has(key(i, vals[i], j, vals[j]))) gain++;
      if (gain > bestGain) { bestGain = gain; best = vals; }
    }
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) uncovered.delete(key(i, best[i], j, best[j]));
    cases.push(best);
  }
  return { names, cases };
}

function buildProfile(names, vals, dims) {
  dims = dims || ALL;
  const p = baseProfile({ goal: 'start', level: 'nuevo0', trainBy: 'distance', days: ['mon', 'wed', 'sat'] });
  const labels = [];
  names.forEach((n, i) => { const [label, fn] = dims[n][vals[i]]; labels.push(label); fn(p); });
  if (p.crossTrainingSports.length === 0) p.crossTrainingDays = p.crossTrainingDays;   // los días de otro deporte sin deporte son legales: no hay nada que validar
  return { p, label: labels.join(' ') };
}

const WEEKS_ALL = Array.from({ length: 30 }, (_, i) => i + 1);   // las 30 primeras semanas, todas

test('todas las PAREJAS de opciones: cada par de valores de dos opciones cualesquiera, en 30 semanas', () => {
  const a = newApp();
  const { names, cases } = pairwise(ALL, Number(process.env.FUZZ_SEED) || 20261118);
  assert.ok(cases.length > 100, "se generaron combinaciones: " + cases.length); console.log("PAREJAS:", cases.length, "combinaciones,", names.length, "opciones");
  // se verifica que de verdad quedaron cubiertas todas las parejas
  const seen = new Set();
  cases.forEach(c => { for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) seen.add(i + ':' + c[i] + '|' + j + ':' + c[j]); });
  let expected = 0; for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) expected += ALL[names[i]].length * ALL[names[j]].length;
  assert.equal(seen.size, expected, 'todas las parejas cubiertas');
  const today = new Date().toISOString().slice(0, 10);
  cases.forEach((vals, n) => {
    const { p, label } = buildProfile(names, vals);
    a.state.profile = p; a.state.onboarded = true; a.state.weekStart = MONDAY;
    a.state.painLog = p.__pain ? [{ id: 'p1', date: today, bodyPart: 'rodilla', active: true }] : [];
    delete p.__pain;
    let prev = null;
    WEEKS_ALL.forEach(w => {
      a.state.weekNumber = w;
      const L = `combinación ${n} [${label}] semana ${w}`;
      let plan;
      assert.doesNotThrow(() => { plan = Array.from(a.generatePlan(p, w, addDays(MONDAY, 7 * (w - 1)))); }, L);
      const tot = checkWeek(a, p, plan, w, L);
      a.state.plan = plan;
      if (w % 5 === 1) assert.doesNotThrow(() => a.renderPlan(), L + ': dibujar el plan');
      prev = tot;
    });
  });
});

test('NÚCLEO exhaustivo: 8 objetivos x 6 niveles x tiempo/distancia x 127 combinaciones de días x las 30 primeras semanas', () => {
  const a = newApp();
  let count = 0;
  for (const goal of GOALS) for (const level of Object.keys(LEVELS)) for (const trainBy of ['time', 'distance']) for (const days of subsets) {
    const p = baseProfile({ goal, level, trainBy, days });
    a.state.profile = p; a.state.onboarded = true; a.state.weekStart = MONDAY; a.state.painLog = [];
    for (const w of WEEKS_ALL) {
      a.state.weekNumber = w;
      const L = `${goal}/${level}/${trainBy}/${days.join('')} semana ${w}`;
      checkWeek(a, p, Array.from(a.generatePlan(p, w, addDays(MONDAY, 7 * (w - 1)))), w, L);
      count++;
    }
  }
  assert.equal(count, 8 * 6 * 2 * 127 * 30);
});

test('cada uno de los 23 deportes de Perfil, con y sin días de ese deporte, en todos los niveles y los dos modos', () => {
  const a = newApp();
  for (const sport of SPORTS) for (const level of Object.keys(LEVELS)) for (const trainBy of ['time', 'distance']) for (const cd of [[], ['tue', 'thu']]) {
    const p = baseProfile({ goal: '10k', level, trainBy, days: ['tue', 'thu', 'sat', 'sun'] });
    p.crossTrainingSports = [sport]; p.crossTrainingDays = cd;
    a.state.profile = p; a.state.onboarded = true; a.state.weekStart = MONDAY; a.state.painLog = [];
    for (const w of [1, 3, 5, 9]) { a.state.weekNumber = w; checkWeek(a, p, Array.from(a.generatePlan(p, w, addDays(MONDAY, 7 * (w - 1)))), w, `${sport}/${level}/${trainBy}/${cd.length} semana ${w}`); }
  }
});

test('secuencia de semanas: la descarga no sube y el volumen no salta (todas las parejas sin carrera ni meta semanal propia)', () => {
  const a = newApp();
  // sin las opciones que cambian el volumen a propósito (carrera, meta semanal, minutos, pausa, molestia, test, posparto) y con 3+ días (con 2 el total depende del tipo de sesión de calidad)
  const SEQ = {}; ['goal', 'level', 'trainBy', 'days', 'terrain', 'gender', 'age', 'bmi', 'cuestas', 'deporte', 'diasDeporte', 'unidades'].forEach(k => { SEQ[k] = ALL[k]; });
  SEQ.days = SEQ.days.filter(([label]) => label.length - 'dias-'.length >= 9);
  const { names, cases } = pairwise(SEQ, 777);
  let checked = 0;
  cases.forEach((vals, n) => {
    const { p, label } = buildProfile(names, vals, SEQ);
    a.state.profile = p; a.state.onboarded = true; a.state.weekStart = MONDAY; a.state.painLog = [];
    const tot = w => { a.state.weekNumber = w; return checkWeek(a, p, Array.from(a.generatePlan(p, w, addDays(MONDAY, 7 * (w - 1)))), w, `secuencia ${n} [${label}] semana ${w}`); };
    let prev = tot(1);
    for (let w = 2; w <= 26; w++) {
      const cur = tot(w);
      if (w % 4 === 0 && prev > 0) assert.ok(cur <= prev * 1.06 + 5, `[${label}] semana ${w}: la descarga sube (${prev} -> ${cur})`);
      if (w % 4 !== 0 && (w - 1) % 4 !== 0 && prev > 0) assert.ok(cur <= prev * 1.5 + 3, `[${label}] semana ${w}: el volumen salta (${prev} -> ${cur})`);
      prev = cur;
    }
    checked++;
  });
  assert.ok(checked > 20, 'se revisaron secuencias: ' + checked);
});

test('vida completa con las combinaciones de opciones: la app rehace el plan cada lunes durante 30 semanas, la persona cumple o se salta sesiones', () => {
  const { names, cases } = pairwise(ALL, 4242);
  let lives = 0;
  cases.forEach((vals, n) => {
    if (n % 5 !== 0) return;
    const { p, label } = buildProfile(names, vals);
    const a = newApp();
    a.persist = () => Promise.resolve(); a.renderAll = () => {};
    a.state.profile = p; a.state.onboarded = true; a.state.weekNumber = 1; a.state.weekStart = MONDAY; a.state.runs = []; a.state.shoes = []; a.state.chat = []; a.state.event = null; a.state.planHistory = [];
    a.state.painLog = p.__pain ? [{ id: 'p1', date: MONDAY, bodyPart: 'rodilla', active: true }] : [];
    delete p.__pain;
    a.state.plan = a.generatePlan(p, 1, MONDAY);
    a.state.planAlgoVersion = a.PLAN_ALGO_VERSION;
    let s = 1000 + n; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const adherence = 0.4 + rnd() * 0.6;
    for (let w = 0; w < 30; w++) {
      const monday = addDays(MONDAY, 7 * w);
      a.Date = frozenDate(addDays(monday, 2) + 'T10:00:00');
      const L = `vida ${n} [${label}] semana ${w + 1}`;
      if (w > 0) assert.doesNotThrow(() => a.checkWeekRollover(), L + ': cambio de semana');
      const plan = Array.from(a.state.plan);
      assert.equal(plan.length, 7, L + ': 7 días');
      assert.equal(a.state.weekStart, monday, L + ': la semana avanza');
      plan.forEach((d, i) => {
        ['dist', 'durMin', 'zone'].forEach(k => { if (typeof d[k] === 'number') assert.ok(Number.isFinite(d[k]) && d[k] >= 0, `${L}: ${k} inválido (${d[k]})`); });
        if (d.typeKey !== 'rest' && d.typeKey !== 'test' && d.typeKey !== 'race' && !d.cancelled) assert.ok(d.dist > 0 || d.durMin > 0, `${L}: sesión sin tamaño (${d.typeKey})`);
        if (d.typeKey !== 'rest' && d.typeKey !== 'race' && rnd() < adherence) {
          const km = p.trainBy === 'time' ? Math.max(1, (d.durMin || 20) / 6.5) : (d.dist || 3);
          a.state.runs.push({ id: `r${n}_${w}_${i}`, date: addDays(monday, i) + 'T08:00:00', distanceKm: km * (0.9 + rnd() * 0.2), durationSec: Math.round(km * 360), origin: 'manual' });
          d.status = 'done';
        }
      });
      assert.doesNotThrow(() => { a.checkBeginnerGraduation(); a.maybeBeginnerBaseNote(); const sug = a.startUpgradeSuggestion(); if (sug) a.applyStartUpgrade(sug); a.checkPlanAlgoVersion(); }, L + ': revisiones periódicas');
      if (w % 6 === 0) assert.doesNotThrow(() => a.renderPlan(), L + ': dibujar el plan');
    }
    lives++;
  });
  assert.ok(lives > 150, 'vidas simuladas: ' + lives);
});
