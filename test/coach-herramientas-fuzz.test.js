// Las herramientas del coach de IA (cambiar, mover, cancelar sesiones, ajustar el volumen, deshacer) reciben datos que pueden venir mal formados: 100 planes x 12 operaciones al azar, con entradas validas e invalidas.
// Nunca pueden lanzar un error ni dejar el plan roto (7 dias, numeros validos, textos completos).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');
function rng(seed) { let s = seed >>> 0; return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function frozen(iso) { const f = new Date(iso).getTime(); class F extends Date { constructor(...a) { if (a.length === 0) super(f); else super(...a); } static now() { return f; } } return F; }
const DK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const subs = []; for (let m = 1; m < 128; m++) if (m.toString(2).split('1').length - 1 >= 2) subs.push(DK.filter((_, i) => m & (1 << i)));
const problems = {}; const ex = {};
function flag(k, i) { problems[k] = (problems[k] || 0) + 1; if (!ex[k]) ex[k] = i; }
const N = 100;
function run() { const r = rng(Number(process.env.FUZZ_SEED) || 1);
const a0 = loadApp();
const TYPES = Array.from(a0.COACH_TYPE_KEYS || ['easy', 'long', 'tempo', 'intervals', 'fartlek', 'hills', 'progression', 'rest']);
for (let n = 0; n < N; n++) {
  const beginner = r() < 0.3;
  const p = { name: 'x', goal: pick(r, ['start', '5k', '10k', '21k', '42k']), runnerType: beginner ? 'new' : 'active', currentWeeklyKm: beginner ? 0 : Math.round(8 + r() * 50), weeklyGoalKm: 0, trainingDays: pick(r, subs), trainBy: r() < 0.5 ? 'time' : 'distance', terrain: 'asfalto', units: 'metric', gender: 'f', weight: 65, height: 168, birth: '1988-06-15', createdAt: '2026-03-02', availableMinPerSession: 0 };
  p.weeklyKm = beginner ? 0 : p.currentWeeklyKm;
  const a = loadApp();
  const wk = 3 + Math.floor(r() * 14);
  const monday = '2026-06-08'; // lunes
  a.Date = frozen('2026-06-10T10:00:00'); // miercoles
  a.persist = () => Promise.resolve(); a.renderAll = () => {}; a.renderPlan = () => {}; a.renderChat = () => {}; a.renderHome = () => {};
  a.state.profile = p; a.state.onboarded = true; a.state.weekNumber = wk; a.state.weekStart = monday; a.state.runs = []; a.state.shoes = []; a.state.chat = []; a.state.painLog = []; a.state.planHistory = [];
  a.state.plan = a.generatePlan(p, wk, monday);
  const label = JSON.stringify({ n, goal: p.goal, by: p.trainBy, days: p.trainingDays.join(''), rt: p.runnerType, wk });
  const check = (where) => {
    const plan = Array.from(a.state.plan || []);
    if (plan.length !== 7) { flag('plan-no-tiene-7-dias', label + ' ' + where); return; }
    plan.forEach(d => {
      if (!d) { flag('dia-vacio', label + ' ' + where); return; }
      ['dist', 'durMin', 'zone'].forEach(k => { if (d[k] !== undefined && d[k] !== null && (typeof d[k] !== 'number' || !Number.isFinite(d[k]) || d[k] < 0)) flag('numero-invalido-' + k, label + ' ' + where + ' ' + d.typeKey + ' ' + k + '=' + d[k]); });
      if (d.dist > 120) flag('distancia-absurda', label + ' ' + where + ' ' + d.dist);
      try { const lb = a.planLabel(d); const txt = (lb.type || '') + (lb.desc || ''); if (/undefined|NaN|\[object/.test(txt)) flag('texto-roto', label + ' ' + where + ' ' + txt.slice(0, 120)); } catch (e) { flag('planLabel-lanza', label + ' ' + where + ' ' + e.message); }
    });
    ['nextWeekOverrides'].forEach(k => { const o = a.state[k]; if (o) Object.keys(o).forEach(dk => { if (!DK.includes(dk)) flag('override-dia-invalido', label + ' ' + dk); }); });
  };
  for (let op = 0; op < 12; op++) {
    const kind = Math.floor(r() * 7);
    const dia = r() < 0.05 ? 'xx' : pick(r, DK);
    const semana = r() < 0.4 ? 'siguiente' : 'actual';
    let res;
    try {
      if (kind === 0) res = a.applyVolumeAdjust({ porcentaje: pick(r, [-50, -30, -10, 0, 10, 20, 40, 150, 'x', NaN]), semana });
      else if (kind === 1) res = a.applyMoveSession({ dia_origen: dia, dia_destino: pick(r, DK), semana });
      else if (kind === 2) res = a.applyCancelSession({ dia, semana });
      else if (kind === 3) res = a.applyPlanChange({ dia, semana, tipo_categoria: pick(r, TYPES.concat(['zzz'])), distancia_km: pick(r, [0, 1, 3, 5, 10, 16, 25, 60, -2, 'x']), zona: pick(r, [1, 2, 3, 4, 5, 9, 0]), terreno: pick(r, ['asfalto', 'trail', 'mixto']), tipo: 'Sesión', descripcion: 'desc' });
      else if (kind === 4) res = a.applyUndoLastChange();
      else if (kind === 5) res = a.lowerRemainingIntensity(pick(r, [10, 20, 30]));
      else { const i = Math.floor(r() * 7); a.markSession(i, pick(r, ['done', 'skipped', 'pending'])); }
    } catch (e) { flag('lanza-' + ['volumen', 'mover', 'cancelar', 'cambiar', 'deshacer', 'bajar-intensidad', 'marcar'][kind], label + ' op' + op + ' ' + e.stack.split('\n').slice(0, 2).join('|')); }
    check('op' + op + '/' + kind);
  }
}
}

test('herramientas del coach: 100 planes x 12 operaciones al azar sin romper el plan', () => {
  run();
  assert.deepEqual(problems, {}, JSON.stringify(ex).slice(0, 1500));
});
