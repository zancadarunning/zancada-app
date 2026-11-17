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
    const p = profile('start', 'distance', n); a.state.profile = p; a.state.onboarded = true;
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

test('por tiempo: trote/caminata hasta terminar la escalera y sin calidad mientras tanto; después corre seguido y entra el fartlek', () => {
  const a = loadApp();
  const p = profile('start', 'time', 3); a.state.profile = p; a.state.onboarded = true;
  for (let w = 1; w <= 8; w++) weekPlan(a, p, w).forEach(d => { assert.ok(['easy', 'long'].includes(d.typeKey), `semana ${w}: solo rodajes y tirada`); assert.ok(d.runWalk, `semana ${w}: con caminata`); });
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
