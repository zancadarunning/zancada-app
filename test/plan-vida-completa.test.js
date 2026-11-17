// Simula la vida completa de una persona con la app: 30 semanas, cumple o se salta sesiones, y cada lunes la app rehace el plan (checkWeekRollover), gradúa al principiante, propone pasar a 5K, etc.
// El plan no puede romperse en ningún momento: 7 días, sin números inválidos, sin sesiones sin tamaño, la semana avanza y se puede dibujar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');
function rng(seed) { let s = seed >>> 0; return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function frozen(iso) { const f = new Date(iso).getTime(); class F extends Date { constructor(...a) { if (a.length === 0) super(f); else super(...a); } static now() { return f; } } return F; }
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const GOALS = ['start', '5k', '10k', '21k', '42k', 'lifestyle'];
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const subsets = []; for (let m = 1; m < 128; m++) if (m.toString(2).split('1').length - 1 >= 2) subsets.push(DAY_KEYS.filter((_, i) => m & (1 << i)));
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const START = '2026-03-02'; // lunes
const problems = {}; const ex = {};
function flag(k, info) { problems[k] = (problems[k] || 0) + 1; if (!ex[k]) ex[k] = info; }
const N = 80; const seed = Number(process.env.FUZZ_SEED) || 3;
function run() {
const r = rng(seed);
for (let n = 0; n < N; n++) {
  const beginner = r() < 0.5;
  const p = { name: 'x', goal: pick(r, GOALS), runnerType: beginner ? 'new' : 'active', currentWeeklyKm: beginner ? 0 : Math.round(8 + r() * 50), weeklyGoalKm: 0, trainingDays: pick(r, subsets), trainBy: r() < 0.5 ? 'time' : 'distance', terrain: 'asfalto', units: 'metric', gender: 'f', weight: 65, height: 168, birth: '1988-06-15', createdAt: START, availableMinPerSession: 0 };
  p.weeklyKm = beginner ? 0 : p.currentWeeklyKm;
  if (r() < 0.35) { p.raceDate = addDays(START, 7 * (8 + Math.floor(r() * 18)) + 6); if (p.goal === 'start' || p.goal === 'lifestyle') delete p.raceDate; }
  const label = JSON.stringify({ n, goal: p.goal, by: p.trainBy, days: p.trainingDays.join(''), rt: p.runnerType, km: p.currentWeeklyKm, race: p.raceDate });
  const a = loadApp();
  a.Date = frozen(START + 'T09:00:00');
  a.persist = () => Promise.resolve(); a.renderAll = () => {};
  a.state.profile = p; a.state.onboarded = true; a.state.weekNumber = 1; a.state.weekStart = START; a.state.runs = []; a.state.shoes = []; a.state.chat = []; a.state.painLog = []; a.state.event = null; a.state.planHistory = [];
  a.state.plan = a.generatePlan(p, 1, START);
  a.state.planAlgoVersion = a.PLAN_ALGO_VERSION || 6;
  const adherence = 0.4 + r() * 0.6;
  try {
    for (let w = 0; w < 30; w++) {
      const monday = addDays(START, 7 * w);
      a.Date = frozen(addDays(monday, 2) + 'T10:00:00');
      if (w > 0) { a.checkWeekRollover(); }
      const plan = Array.from(a.state.plan);
      // sanity del plan que quedó
      if (plan.length !== 7) flag('plan-no-tiene-7-dias', label + ' w' + w);
      plan.forEach(d => {
        if (!d) { flag('dia-vacio', label + ' w' + w); return; }
        ['dist', 'durMin', 'zone'].forEach(k => { if (typeof d[k] === 'number' && !Number.isFinite(d[k])) flag('numero-invalido-' + k, label + ' w' + w + ' ' + d.typeKey); });
        if (d.typeKey !== 'rest' && d.typeKey !== 'test' && d.typeKey !== 'race' && !d.cancelled && !(d.dist > 0 || d.durMin > 0)) flag('sesion-sin-tamano', label + ' w' + w + ' ' + d.typeKey);
      });
      if (a.state.weekStart !== monday) flag('weekStart-no-avanza', label + ' w' + w + ' got ' + a.state.weekStart + ' esperado ' + monday);
      // la persona corre segun adherencia
      plan.forEach((d, i) => {
        if (d.typeKey === 'rest' || d.typeKey === 'race' || d.cancelled) return;
        if (r() < adherence) {
          const km = p.trainBy === 'time' ? Math.max(1, (d.durMin || 20) / 6.5) : (d.dist || 3);
          a.state.runs.push({ id: 'r' + n + '_' + w + '_' + i, date: addDays(monday, i) + 'T08:00:00', distanceKm: km * (0.9 + r() * 0.2), durationSec: Math.round(km * 6 * 60), origin: 'manual' });
          d.status = 'done';
        }
      });
      // funciones periodicas
      try { a.checkBeginnerGraduation(); } catch (e) { flag('checkBeginnerGraduation-lanza', label + ' ' + e.message); }
      try { a.maybeBeginnerBaseNote && a.maybeBeginnerBaseNote(); } catch (e) { flag('maybeBeginnerBaseNote-lanza', label + ' ' + e.message); }
      try { const sug = a.startUpgradeSuggestion(); if (sug) { a.applyStartUpgrade(sug); } } catch (e) { flag('startUpgrade-lanza', label + ' ' + e.stack.split('\n').slice(0, 2).join('|')); }
      try { a.checkPlanAlgoVersion(); } catch (e) { flag('checkPlanAlgoVersion-lanza', label + ' ' + e.message); }
      try { a.renderPlan(); } catch (e) { flag('renderPlan-lanza', label + ' w' + w + ' ' + e.message); }
    }
  } catch (e) { flag('excepcion', label + ' ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
}
}

test('vida completa: 80 personas x 30 semanas, sin errores en el plan', () => {
  run();
  assert.deepEqual(problems, {}, JSON.stringify(ex).slice(0, 1500));
});
