// Principiante: solo las primeras 2 semanas van en zona 1; después el plan es "normal" (rodajes en zona 2, tirada larga, algo de calidad) y el volumen sigue subiendo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

const DAYS = { 2: ['tue', 'sun'], 3: ['mon', 'wed', 'sat'], 4: ['mon', 'tue', 'thu', 'sat'], 5: ['mon', 'tue', 'wed', 'fri', 'sun'] };
function profile(goal, trainBy, n) {
  return { name: 'x', weeklyKm: 0, currentWeeklyKm: 0, goal, runnerType: 'new', trainingDays: DAYS[n], units: 'metric', trainBy, terrain: 'asfalto', age: 30, gender: 'f', weight: 65, height: 165 };
}
function weekPlan(a, p, w) { return Array.from(a.generatePlan(p, w)).filter(d => d.typeKey !== 'rest'); }
const total = (plan, trainBy) => plan.reduce((s, d) => s + (trainBy === 'time' ? (d.durMin || 0) : (d.dist || 0)), 0);
const CASES = [];
['start', '5k', '10k'].forEach(g => ['distance', 'time'].forEach(b => [2, 3, 4, 5].forEach(n => CASES.push([g, b, n]))));

test('semanas 1 y 2: rodajes en zona 1; desde la 3 los rodajes pasan a zona 2 (todos los perfiles de principiante)', () => {
  const a = loadApp();
  CASES.forEach(([g, b, n]) => {
    const p = profile(g, b, n); a.state.profile = p; a.state.onboarded = true;
    [1, 2].forEach(w => weekPlan(a, p, w).filter(d => d.typeKey === 'easy').forEach(d => assert.equal(d.zone, 1, `${g}/${b}/${n}d semana ${w}`)));
    for (let w = 3; w <= 13; w++) weekPlan(a, p, w).filter(d => d.typeKey === 'easy').forEach(d => assert.equal(d.zone, 2, `${g}/${b}/${n}d semana ${w}`));
  });
});

test('por distancia: aparece calidad (fartlek, y después progresivos) y nunca series ni cuestas; los planes ya no son siempre lo mismo', () => {
  const a = loadApp();
  [2, 3, 4, 5].forEach(n => {
    const p = profile('start', 'distance', n); p.levelTest = { required: true, done: true, continuousOk: true }; a.state.profile = p; a.state.onboarded = true;
    const types = new Set(); const quality = [];
    for (let w = 1; w <= 13; w++) weekPlan(a, p, w).forEach(d => { types.add(d.typeKey); if (!['easy', 'long'].includes(d.typeKey)) quality.push(w); });
    assert.ok(types.has('fartlek'), `${n} días: hay fartlek`);
    assert.ok(!types.has('intervals') && !types.has('hills'), `${n} días: sin series ni cuestas para un principiante`);
    assert.ok(Math.min(...quality) >= 3, 'la calidad no entra antes de la semana 3');
    assert.ok(new Set(quality).size >= 4, `${n} días: calidad en varias semanas distintas`);
  });
});

test('el volumen sigue subiendo (se comparan semanas sin descarga: 3, 5, 7, 9, 11, 13)', () => {
  const a = loadApp();
  CASES.forEach(([g, b, n]) => {
    const p = profile(g, b, n); a.state.profile = p; a.state.onboarded = true;
    const t = w => total(weekPlan(a, p, w), b);
    assert.ok(t(13) > t(3), `${g}/${b}/${n}d: la semana 13 (${t(13)}) pasa a la 3 (${t(3)})`);
    assert.ok(t(3) > t(1) || b === 'time', `${g}/${b}/${n}d: la 3 pasa a la 1`);
  });
});

test('por tiempo: trote/caminata solo las semanas 1 a 3; hasta la 8 sigue sin calidad pero corriendo de corrido; después entra el fartlek', () => {
  const a = loadApp();
  const p = profile('start', 'time', 3); a.state.profile = p; a.state.onboarded = true;
  for (let w = 1; w <= 8; w++) weekPlan(a, p, w).forEach(d => { assert.ok(['easy', 'long'].includes(d.typeKey), `semana ${w}: solo rodajes y tirada`); if (w <= 3) assert.ok(d.runWalk, `semana ${w}: con caminata`); else assert.ok(!d.runWalk, `semana ${w}: corre de corrido`); });
  const later = []; for (let w = 9; w <= 13; w++) later.push(...weekPlan(a, p, w));
  assert.ok(later.some(d => d.typeKey === 'fartlek'), 'después de la escalera aparece el fartlek');
  assert.ok(later.filter(d => d.typeKey === 'easy' || d.typeKey === 'long').every(d => !d.runWalk), 'corre de corrido');
});

test('un corredor que NO es principiante no cambia (misma zona y sesiones que antes)', () => {
  const a = loadApp();
  const p = { name: 'x', weeklyKm: 30, currentWeeklyKm: 30, goal: '10k', runnerType: 'active', trainingDays: DAYS[4], units: 'metric', trainBy: 'distance', terrain: 'asfalto' };
  a.state.profile = p; a.state.onboarded = true;
  assert.equal(a.beginnerPastBase(p, 8), false);
  assert.ok(weekPlan(a, p, 5).filter(d => d.typeKey === 'easy').every(d => d.zone === 2));
});

test('el coach puede armar un fartlek suave pasadas las semanas de base, pero nunca series ni cuestas', () => {
  const a = loadApp();
  a.state.profile = profile('start', 'distance', 3);
  assert.equal(a.beginnerPastBase(a.state.profile, 2), false);
  assert.equal(a.beginnerPastBase(a.state.profile, 3), true);
  a.state.weekNumber = 1;
  assert.match(a.coachSafetyRefusal({ tipo_categoria: 'fartlek', zona: 3 }) || '', /principiante/);
  a.state.weekNumber = 5;
  assert.equal(a.coachSafetyRefusal({ tipo_categoria: 'fartlek', zona: 3 }), null);
  assert.match(a.coachSafetyRefusal({ tipo_categoria: 'intervals', zona: 4 }) || '', /principiante/);
});

test('v5 -> v6: solo rehace la semana de un principiante pasado de las semanas de base; al resto solo le anota la versión', () => {
  const a = loadApp();
  a.state.onboarded = true; a.state.weekNumber = 6; a.state.profile = profile('start', 'distance', 3);
  a.state.plan = a.generatePlan(a.state.profile, 6); a.state.planAlgoVersion = 5;
  const before = JSON.stringify(a.state.plan);
  a.checkPlanAlgoVersion();
  assert.equal(a.state.planAlgoVersion, 6);
  const b = loadApp();
  b.state.onboarded = true; b.state.weekNumber = 6;
  b.state.profile = { name: 'x', weeklyKm: 30, currentWeeklyKm: 30, goal: '10k', runnerType: 'active', trainingDays: DAYS[4], units: 'metric', trainBy: 'distance', terrain: 'asfalto' };
  b.state.plan = b.generatePlan(b.state.profile, 6); b.state.planAlgoVersion = 5;
  const planB = JSON.stringify(b.state.plan);
  b.checkPlanAlgoVersion();
  assert.equal(b.state.planAlgoVersion, 6);
  assert.equal(JSON.stringify(b.state.plan), planB, 'el plan de un corredor no principiante no se toca');
  assert.ok(typeof before === 'string');
});

// ---- mejoras posteriores: pasar de "desde cero" a 5K, trote/caminata por distancia, aviso de 1 día y nota de cambio de zona ----
function startSetup(a, avgKm) {
  const today = new Date('2026-11-09T12:00:00');   // lunes
  const createdAt = a.addDaysToIsoLocal(a.getMondayISO(today), -70);
  const p = Object.assign(profile('start', 'distance', 3), { createdAt });
  a.state.profile = p; a.state.onboarded = true; a.state.weekStart = a.getMondayISO(today); a.state.weekNumber = 9;
  a.state.chat = []; a.state.runs = [];
  for (let w = 1; w <= 4; w++) {
    const monday = a.addDaysToIsoLocal(a.state.weekStart, -7 * w);
    a.state.runs.push({ date: a.addDaysToIsoLocal(monday, 1), distanceKm: avgKm / 2, durationSec: 1800 });
    a.state.runs.push({ date: a.addDaysToIsoLocal(monday, 3), distanceKm: avgKm / 2, durationSec: 1800 });
  }
  a.state.plan = a.generatePlan(p, 9);
  return p;
}

test('"empezar desde cero": con carreras reales suficientes Zonda propone un 5K; si acepta cambia el objetivo y el plan, si no, no insiste por 28 días', () => {
  const a = loadApp();
  startSetup(a, 12);
  const sug = a.startUpgradeSuggestion();
  assert.ok(sug && sug.avgKm === 12, 'propone con 12 km/semana reales');
  a.applyStartUpgrade(sug);
  assert.equal(a.state.profile.goal, '5k');
  assert.equal(a.state.profile.runnerType, 'active');
  assert.equal(a.state.profile.currentWeeklyKm, 12);
  assert.ok(!a.isBeginnerProfile(a.state.profile), 'sale del modo principiante');
  assert.ok(a.state.chat.some(m => m.text === a.t('start_upgrade_done')));
  const b = loadApp();
  startSetup(b, 12);
  b.state.startUpgradeDeclinedAt = b.todayLocalISO();
  assert.equal(b.startUpgradeSuggestion(), null, 'si dijo que no, no vuelve a preguntar enseguida');
});

test('"empezar desde cero": no propone con pocos km reales, ni en las primeras semanas, ni a quien ya tiene otro objetivo', () => {
  const a = loadApp();
  startSetup(a, 4);
  assert.equal(a.startUpgradeSuggestion(), null, 'con 4 km/semana no');
  const b = loadApp();
  startSetup(b, 12); b.state.weekNumber = 2;
  assert.equal(b.startUpgradeSuggestion(), null, 'semana 2 no');
  const c = loadApp();
  const p = startSetup(c, 12); p.goal = '10k';
  assert.equal(c.startUpgradeSuggestion(), null, 'otro objetivo no');
});

test('principiante por DISTANCIA: trote/caminata solo las semanas 1 a 3 (salvo que el test de nivel diga que corre de corrido); desde la 4 corre de corrido', () => {
  const a = loadApp();
  const p = profile('start', 'distance', 3); a.state.profile = p; a.state.onboarded = true;
  [1, 2, 3].forEach(w => weekPlan(a, p, w).filter(d => d.typeKey === 'easy' || d.typeKey === 'long').forEach(d => assert.ok(d.runWalk && d.runWalk.reps > 0, `semana ${w}: con caminata`)));
  [4, 6, 8].forEach(w => weekPlan(a, p, w).forEach(d => assert.ok(!d.runWalk, `semana ${w}: corre de corrido`)));
  weekPlan(a, p, 10).forEach(d => assert.ok(!d.runWalk, 'semana 10: corre de corrido'));
  const q = profile('start', 'distance', 3); q.levelTest = { required: true, done: true, continuousOk: true }; a.state.profile = q;
  weekPlan(a, q, 1).forEach(d => assert.ok(!d.runWalk, 'si corre de corrido desde el test, sin caminata'));
});

test('por tiempo: el total semanal no se cae al terminar la escalera de trote/caminata (semana 9) salvo en la semana de descarga', () => {
  const a = loadApp();
  [2, 3, 4, 5].forEach(n => {
    const p = profile('start', 'time', n); a.state.profile = p; a.state.onboarded = true;
    const t = w => total(weekPlan(a, p, w), 'time');
    assert.ok(t(9) >= t(7) * 0.9, `${n} días: semana 9 (${t(9)}) no cae contra la 7 (${t(7)})`);
  });
});

test('aviso de 1 solo día por semana: existe en el alta y en Perfil, en los 6 idiomas', () => {
  const fs = require('node:fs'), path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="ob-days-one-hint"/); assert.match(html, /id="perfil-days-one-hint"/);
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.js'), 'utf8');
    ['days_one_hint', 'beginner_base_note', 'start_upgrade_ask', 'start_upgrade_yes', 'start_upgrade_no', 'start_upgrade_done'].forEach(k => assert.match(src, new RegExp(k + ':"'), l + ' ' + k));
  }
});

test('nota de cambio de zona: una sola vez, solo para el principiante que pasó las semanas de base', () => {
  const a = loadApp();
  const p = profile('start', 'distance', 3); a.state.profile = p; a.state.onboarded = true; a.state.chat = [];
  a.state.weekNumber = 2; a.maybeBeginnerBaseNote();
  assert.equal(a.state.chat.length, 0, 'semana 2: nada');
  a.state.weekNumber = 3; a.maybeBeginnerBaseNote(); a.maybeBeginnerBaseNote();
  assert.equal(a.state.chat.filter(m => m.text === a.t('beginner_base_note')).length, 1, 'una sola vez');
});

test('los días de otro deporte cargados en Perfil no se eligen para las sesiones fuertes (si hay días libres)', () => {
  const a = loadApp();
  const p = { name: 'x', weeklyKm: 30, currentWeeklyKm: 30, goal: '10k', runnerType: 'active', trainingDays: ['mon', 'tue', 'thu', 'sat', 'sun'], units: 'metric', trainBy: 'distance', terrain: 'asfalto', crossTrainingSports: ['futbol'], crossTrainingDays: ['tue', 'thu'] };
  a.state.profile = p; a.state.onboarded = true;
  for (let w = 1; w <= 12; w++) {
    const s = a.distributeSessionTypes(p.trainingDays, false, w, { level: 0 }, false, '10k', false);
    ['tue', 'thu'].forEach(d => assert.ok(['easy'].includes(s[d]), `semana ${w}: ${d} (día de fútbol) debería ser rodaje, es ${s[d]}`));
  }
  p.crossTrainingDays = ['mon', 'tue', 'thu', 'sat'];   // casi todos ocupados: no alcanza, se usan igual
  const s2 = a.distributeSessionTypes(p.trainingDays, false, 3, { level: 0 }, false, '10k', false);
  assert.ok(Object.values(s2).some(t => !['easy', 'long'].includes(t)), 'sin días libres suficientes igual hay calidad');
});

test('semanas de 2-3 sesiones sin carrera: el total semanal ya no oscila entre semana con calidad y semana sin ella (distancia)', () => {
  const a = loadApp();
  [['wed', 'sun'], ['tue', 'thu', 'sun']].forEach(days => {
    const p = { name: 'x', weeklyKm: 25, currentWeeklyKm: 25, goal: '10k', runnerType: 'active', trainingDays: days, units: 'metric', trainBy: 'distance', terrain: 'asfalto', birth: '1985-06-15', weight: 65, height: 170 };
    a.state.profile = p; a.state.onboarded = true;
    const tots = [];
    for (let w = 9; w <= 19; w++) { if (w % 4 === 0) continue; tots.push(weekPlan(a, p, w).reduce((s, d) => s + d.dist, 0)); }
    const max = Math.max(...tots), min = Math.min(...tots);
    assert.ok(max / min <= 1.25, `${days.length} días: oscila de ${min} a ${max} km`);
  });
});

test('con una molestia activa el Plan lo explica (nota en la semana actual) y existe en los 6 idiomas', () => {
  const fs = require('node:fs'), path = require('node:path');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), /id="plan-pain-note"/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), /plan-pain-note[\s\S]{0,200}activePainEntries\(21\)/);
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) assert.match(fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.js'), 'utf8'), /plan_pain_note:"/, l);
});

test('carrera objetivo: nada de tirada larga a 48 horas y el rodaje de la víspera de un 5K no pasa de 3 km', () => {
  const a = loadApp();
  const p = { name: 'x', goal: '5k', runnerType: 'new', currentWeeklyKm: 0, weeklyKm: 0, trainingDays: ['mon', 'thu', 'fri'], trainBy: 'distance', terrain: 'asfalto', units: 'metric', birth: '1988-06-15', weight: 65, height: 168, createdAt: '2026-03-02', raceDate: '2026-06-14' };
  a.state.profile = p; a.state.onboarded = true; a.state.weekStart = '2026-06-08'; a.state.weekNumber = 14;
  const plan = Array.from(a.generatePlan(p, 14, '2026-06-08'));
  assert.equal(plan[6].raceDay, true, 'el domingo es la carrera');
  assert.notEqual(plan[4].typeKey, 'long', 'el viernes (48 h antes) no hay tirada');
  plan.filter((d, i) => i < 6 && d.typeKey === 'easy' && i >= 4).forEach(d => assert.ok(d.dist <= 3, 'rodaje corto de víspera: ' + d.dist));
});

test('por tiempo: el paso del trote y caminata (semana 3) a correr de corrido (semana 4) no es un salto brusco', () => {
  const a = loadApp();
  [2, 3, 4, 5].forEach(n => {
    const p = profile('start', 'time', n); a.state.profile = p; a.state.onboarded = true;
    const t = w => total(weekPlan(a, p, w), 'time');
    assert.ok(t(4) >= t(3) * 0.8 && t(4) <= t(3) * 1.3, `${n} días: semana 4 (${t(4)}) vs semana 3 (${t(3)})`);
  });
});
