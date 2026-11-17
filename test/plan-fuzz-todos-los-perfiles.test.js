// El plan NUNCA debe fallar, sea cual sea el corredor: se arman miles de perfiles combinando TODAS las variables que permite la app (objetivo, nivel, volumen, días, por tiempo o distancia,
// terreno, edad/peso/altura, deportes de impacto, pausa larga, posparto, sin cuestas, molestias, carrera objetivo, test de nivel, minutos disponibles...) durante muchas semanas, y se revisan
// las reglas que no pueden romperse (sin errores, sin NaN, zonas válidas, solo los días elegidos, límites de distancia/tiempo, reglas de principiante).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const GOALS = ['start', '5k', '10k', '15k', '21k', '42k', 'ultra', 'lifestyle'];
const TYPES = new Set(['rest', 'test', 'race', 'easy', 'long', 'intervals', 'tempo', 'fartlek', 'hills', 'progression']);
const SPORTS = ['futbol', 'basquet', 'rugby', 'natacion', 'ciclismo', 'tenis_padel', 'gimnasio', 'yoga'];
const MONDAY = '2026-09-07';
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const subsets = []; for (let m = 1; m < 128; m++) subsets.push(DAY_KEYS.filter((_, i) => m & (1 << i)));

function randomProfile(r) {
  const goal = pick(r, GOALS), beginner = r() < 0.45;
  const days = pick(r, subsets);
  const p = {
    name: 'x', goal, runnerType: beginner ? 'new' : 'active', currentWeeklyKm: beginner ? (r() < 0.5 ? 0 : Math.round(r() * 6)) : Math.round(3 + r() * 90),
    weeklyGoalKm: r() < 0.25 ? Math.round(5 + r() * 100) : 0, trainingDays: days, trainBy: r() < 0.5 ? 'time' : 'distance', terrain: pick(r, ['asfalto', 'mixto', 'trail']),
    units: r() < 0.2 ? 'imperial' : 'metric', gender: pick(r, ['f', 'm', 'x']), weight: r() < 0.8 ? Math.round(45 + r() * 70) : null, height: r() < 0.8 ? Math.round(150 + r() * 45) : null,
    birth: r() < 0.85 ? (1950 + Math.floor(r() * 62)) + '-06-15' : null, returningFromBreak: r() < 0.15, pregnancyPostpartum: r() < 0.05, avoidHills: r() < 0.12,
    availableMinPerSession: r() < 0.3 ? pick(r, [20, 30, 45, 60, 90]) : 0, crossTrainingSports: r() < 0.3 ? [pick(r, SPORTS), pick(r, SPORTS)] : [], crossTrainingDays: r() < 0.3 ? ['mon', 'thu'] : [],
    createdAt: MONDAY,
  };
  p.weeklyKm = p.runnerType === 'new' ? 0 : p.currentWeeklyKm;
  if (r() < 0.2) p.raceDate = addDays(MONDAY, 7 * (2 + Math.floor(r() * 40)));
  if (r() < 0.15) p.levelTest = pick(r, [{ required: true, done: false }, { required: true, done: true, continuousOk: true }, { required: true, done: true, continuousOk: false }]);
  if (r() < 0.1) p.coachNotes = ['no puedo hacer cuestas', 'rodilla'];
  return p;
}

function checkPlan(a, p, plan, w, label) {
  assert.equal(plan.length, 7, label + ': 7 días');
  const used = new Set();
  plan.forEach((d, i) => {
    assert.equal(d.day, DAY_KEYS[i], label + ': día ' + i);
    assert.ok(TYPES.has(d.typeKey), `${label}: tipo desconocido ${d.typeKey}`);
    (function walk(v, path) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${label}: ${path} no es un número válido (${v})`);
      else if (Array.isArray(v)) v.forEach((x, k) => walk(x, path + '[' + k + ']'));
      else if (v && typeof v === 'object') Object.keys(v).forEach(k => { assert.notEqual(v[k], undefined, `${label}: ${path}.${k} undefined`); walk(v[k], path + '.' + k); });
    })(d, 'dia' + i);
    if (d.typeKey === 'rest') return;
    used.add(d.day);
    if (d.typeKey === 'test' || d.typeKey === 'race') return;   // test de nivel de 12 min y día de carrera: sin zona
    assert.ok(Number.isInteger(d.zone) && d.zone >= 1 && d.zone <= 5, `${label}: zona ${d.zone}`);
    assert.ok(d.dist >= 0 && d.dist <= 75, `${label}: distancia ${d.dist}`);
    if (p.trainBy === 'time') assert.ok(d.durMin > 0 && d.durMin <= 400, `${label}: duración ${d.durMin}`);
    if (a.avoidsHills(p)) assert.notEqual(d.typeKey, 'hills', label + ': sin cuestas');
  });
  assert.ok(used.size >= 1 || p.raceDate, label + ': al menos una sesión');
  a.state.plan = plan; a.state.weekNumber = w;
  assert.doesNotThrow(() => a.renderPlan(), label + ': dibujar el plan');
  assert.ok(used.size <= p.trainingDays.length || p.raceDate, `${label}: más sesiones (${used.size}) que días elegidos (${p.trainingDays.length})`);
  if (!p.raceDate) used.forEach(d => assert.ok(p.trainingDays.includes(d), `${label}: sesión en un día no elegido (${d})`));
  // reglas del principiante
  if (a.isBeginnerProfile(p)) {
    const base = a.hasRunningImpactBase(p);
    plan.filter(d => d.typeKey !== 'rest').forEach(d => {
      assert.ok(!['intervals', 'hills'].includes(d.typeKey), `${label}: un principiante no hace ${d.typeKey}`);
      if (w <= 2 && !base && !p.raceDate && d.typeKey === 'easy') assert.equal(d.zone, 1, `${label}: semanas 1-2 en zona 1`);
      if (w >= 3 && d.typeKey === 'easy') assert.equal(d.zone, 2, `${label}: desde la semana 3 los rodajes son zona 2`);
    });
  }
}

test('el plan no falla nunca: 3000 perfiles al azar con todas las variables x 18 semanas', () => {
  const a = loadApp();
  const r = rng(Number(process.env.FUZZ_SEED) || 20261117);
  for (let n = 0; n < 3000; n++) {
    const p = randomProfile(r);
    a.state.profile = p; a.state.onboarded = true; a.state.weekNumber = 1; a.state.weekStart = MONDAY;
    for (const w of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24]) {
      a.state.weekNumber = w;
      const label = `perfil ${n} (${JSON.stringify(p)}) semana ${w}`;
      let plan;
      assert.doesNotThrow(() => { plan = Array.from(a.generatePlan(p, w, addDays(MONDAY, 7 * (w - 1)))); }, label);
      checkPlan(a, p, plan, w, label);
    }
  }
});

test('todas las combinaciones de días de la semana (127) x objetivos x por tiempo/distancia x principiante/activo', () => {
  const a = loadApp();
  for (const days of subsets) for (const goal of GOALS) for (const trainBy of ['time', 'distance']) for (const beginner of [true, false]) {
    const p = { name: 'x', goal, runnerType: beginner ? 'new' : 'active', currentWeeklyKm: beginner ? 0 : 25, weeklyKm: beginner ? 0 : 25, trainingDays: days, trainBy, terrain: 'asfalto', units: 'metric', createdAt: MONDAY };
    a.state.profile = p; a.state.onboarded = true; a.state.weekStart = MONDAY;
    for (const w of [1, 3, 4, 9, 13]) {
      a.state.weekNumber = w;
      const label = `${days.join('')}/${goal}/${trainBy}/${beginner ? 'nuevo' : 'activo'}/sem${w}`;
      checkPlan(a, p, Array.from(a.generatePlan(p, w, addDays(MONDAY, 7 * (w - 1)))), w, label);
    }
  }
});

test('el volumen del principiante no se cae de golpe ni se dispara (semanas sin descarga, 13 semanas)', () => {
  const a = loadApp();
  const r = rng(77);
  for (let n = 0; n < 400; n++) {
    const p = randomProfile(r); p.runnerType = 'new'; p.currentWeeklyKm = 0; p.weeklyKm = 0; p.weeklyGoalKm = 0; delete p.raceDate; p.returningFromBreak = false; p.pregnancyPostpartum = false; p.availableMinPerSession = 0; delete p.levelTest;
    a.state.profile = p; a.state.onboarded = true; a.state.weekStart = MONDAY;
    const tot = w => { a.state.weekNumber = w; return Array.from(a.generatePlan(p, w, addDays(MONDAY, 7 * (w - 1)))).reduce((s, d) => s + (p.trainBy === 'time' ? (d.durMin || 0) : (d.dist || 0)), 0); };
    for (const w of [5, 7, 9, 11, 13]) {   // impares: nunca son de descarga (4, 8, 12)
      const prev = tot(w - 2), cur = tot(w);
      assert.ok(cur <= prev * 1.6 + 1, `perfil ${n} semana ${w}: salto de ${prev} a ${cur}`);
    }
    assert.ok(tot(13) > 0 && tot(13) <= (p.trainBy === 'time' ? 1500 : 160), `perfil ${n}: total semanal razonable`);
  }
});

test('coherencia del plan sin carrera: la tirada es la más larga, nunca dos días fuertes seguidos, la descarga no sube y toda sesión tiene tamaño', () => {
  const a = loadApp();
  const r = rng(Number(process.env.FUZZ_SEED) || 5150);
  const HARD = ['intervals', 'tempo', 'fartlek', 'hills', 'progression'];
  for (let n = 0; n < 700; n++) {
    const p = randomProfile(r); delete p.raceDate; delete p.levelTest; p.availableMinPerSession = 0;
    a.state.profile = p; a.state.onboarded = true; a.state.weekStart = MONDAY;
    const size = d => (p.trainBy === 'time' ? d.durMin : d.dist) || 0;
    let prev = null;
    for (let w = 1; w <= 24; w++) {
      a.state.weekNumber = w;
      const plan = Array.from(a.generatePlan(p, w, addDays(MONDAY, 7 * (w - 1))));
      const sess = plan.filter(d => d.typeKey !== 'rest' && d.typeKey !== 'test');
      const label = `perfil ${n} ${p.goal}/${p.trainBy}/${p.trainingDays.join('')} semana ${w}`;
      sess.forEach(d => assert.ok(size(d) > 0, `${label}: sesión sin tamaño (${d.typeKey})`));
      const longs = sess.filter(d => d.typeKey === 'long');
      if (longs.length && sess.length > 1) assert.ok(Math.max(...longs.map(size)) >= Math.max(...sess.map(size)) - 1e-9, `${label}: la tirada no es la más larga (${sess.map(d => d.typeKey[0] + size(d)).join(" ")}) ${JSON.stringify(p)}`);
      for (let i = 0; i < 6; i++) assert.ok(!(HARD.includes(plan[i].typeKey) && HARD.includes(plan[i + 1].typeKey)), `${label}: dos días fuertes seguidos (${plan[i].day})`);
      const tot = sess.reduce((s, d) => s + size(d), 0);
      if (prev !== null && w % 4 === 0 && prev > 0) assert.ok(tot <= prev * 1.06 + 5, `${label}: la semana de descarga sube (${prev} -> ${tot})`);
      prev = tot;
    }
  }
});

test('los textos de todas las sesiones salen completos en los 6 idiomas (sin undefined, NaN ni claves sin traducir)', () => {
  const a = loadApp();
  const r = rng(Number(process.env.FUZZ_SEED) || 909);
  for (let n = 0; n < 150; n++) {
    const p = randomProfile(r); delete p.raceDate;
    a.state.profile = p; a.state.onboarded = true; a.state.weekStart = MONDAY;
    for (const w of [1, 3, 5, 9, 13]) {
      a.state.weekNumber = w;
      const plan = Array.from(a.generatePlan(p, w, addDays(MONDAY, 7 * (w - 1))));
      for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
        a.setLangValue(l);
        plan.forEach(d => {
          const lb = a.planLabel(d); const txt = (lb.type || '') + '\n' + (lb.desc || '');
          assert.doesNotMatch(txt, /undefined|NaN|\[object|\{[a-z_]+\}|\b(desc|type|plan)_[a-z_]+\b/, `${l} ${d.typeKey}: ${txt.slice(0, 140)}`);
          if (d.typeKey !== 'rest') assert.ok(lb.type, `${l} ${d.typeKey}: sin tipo`);
        });
      }
      a.setLangValue('es');
    }
  }
});
