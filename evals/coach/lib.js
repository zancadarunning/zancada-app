// evals/coach/lib.js
//
// Pruebas de Zonda (el coach de IA) con conversaciones de ejemplo. Arma, para cada caso, EXACTAMENTE lo que arma la app en producción (contexto + texto de instrucciones + herramientas),
// ejecuta las herramientas que el modelo pida sobre una copia de la app, y evalúa lo que pasó. No llama a ninguna API por sí solo: eso lo hace run.js (con una clave de quien lo corre).
// El modo de ensayo (sin API) corre dentro de `npm test` para que los casos no se rompan con el tiempo.

const fs = require('fs');
const path = require('path');
const { loadApp } = require('../../test/support/load-app');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function loadCases() { return JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8')); }

// Las herramientas reales de app.js (el array TOOLS), sin tocar nada del archivo.
function realTools() {
  const start = SRC.indexOf('const TOOLS = [');
  const end = SRC.indexOf('\n];', start) + 3;
  if (start < 0 || end < 3) throw new Error('No encuentro TOOLS en app.js');
  return new Function('DAY_KEYS', SRC.slice(start, end).replace('const TOOLS = ', 'return '))(DAYS);
}
// Las reglas fijas del servidor (api/chat.js) que van antes del texto de la app.
function serverRules() {
  const txt = fs.readFileSync(path.join(ROOT, 'api', 'chat.js'), 'utf8');
  const start = txt.indexOf('const SERVER_RULES = [');
  const endMark = '].join(String.fromCharCode(10));';
  const end = txt.indexOf(endMark, start);
  if (start < 0 || end < 0) throw new Error('No encuentro SERVER_RULES en api/chat.js');
  return new Function(txt.slice(start, end + endMark.length).replace('const SERVER_RULES = ', 'return ').replace(/;$/, ''))();
}

// Congela la hora en el día de la semana pedido (10:00 de esa fecha, dentro de la semana actual) para que "hoy" sea siempre el mismo.
function freezeAt(dayKey) {
  const Real = Date;
  const now = new Real();
  const monday = new Real(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7), 10, 0, 0);
  const fixed = new Real(monday.getFullYear(), monday.getMonth(), monday.getDate() + Math.max(0, DAYS.indexOf(dayKey || 'mon')), 10, 0, 0).getTime();
  class Fixed extends Real {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  }
  global.Date = Fixed;
  return () => { global.Date = Real; };
}

const BASE_PROFILE = { name: 'Ana', weight: 60, height: 165, birth: '1990-05-01', gender: 'f', weeklyKm: 40, currentWeeklyKm: 35, goal: 'half', runnerType: 'active', trainingDays: ['mon', 'tue', 'thu', 'sat', 'sun'], units: 'metric', trainBy: 'distance', terrain: 'asfalto' };

// Deja una app lista para el caso. Devuelve todo lo que hace falta para hablar con el modelo.
function prepareCase(c) {
  const setup = c.setup || {};
  const restoreDate = freezeAt(setup.hoy || 'mon');
  try {
    const app = loadApp();
    const profile = Object.assign({}, BASE_PROFILE, { units: setup.units || 'metric', trainBy: setup.trainBy || 'distance' }, setup.perfil || {});
    profile.hrZones = app.computeZones(190); profile.hrMax = 190;
    app.state.profile = profile;
    app.state.onboarded = true;
    app.state.weekNumber = 7;
    app.state.weekStart = app.getMondayISO(new Date());
    app.state.runs = []; app.state.shoes = []; app.state.painLog = []; app.state.chat = []; app.state.planHistory = [];
    app.state.plan = app.generatePlan(profile, 7);
    Object.entries(setup.plan || {}).forEach(([day, patch]) => {
      const i = DAYS.indexOf(day);
      app.state.plan[i] = Object.assign({}, app.state.plan[i], { day }, patch, { status: undefined });
    });
    if (setup.evento) app.state.event = { name: setup.evento.name, type: 'road', date: app.addDaysToIsoLocal(app.state.weekStart, DAYS.indexOf(setup.evento.dia)), distanceKm: setup.evento.distanceKm };
    const ctx = app.buildContext();
    const system = serverRules() + String.fromCharCode(10, 10) + app.buildCoachSystem(ctx);
    const weekday = new Date().toLocaleDateString('es-AR', { weekday: 'long' });
    const label = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    const messages = [{ role: 'user', content: c.mensaje + `\n\n[Dato automático de la app, no lo escribió el corredor: ahora es ${label}, 10:00 hs. HOY es ${weekday}.]` }];
    return { app, system, tools: realTools(), messages, ctx, restoreDate };
  } catch (e) { restoreDate(); throw e; }
}

// Mismo despacho que sendChat() en app.js.
function executeTool(app, name, input) {
  switch (name) {
    case 'modificar_sesion': return app.applyPlanChange(input);
    case 'mover_sesion': return app.applyMoveSession(input);
    case 'cancelar_sesion': return app.applyCancelSession(input);
    case 'ajustar_volumen_semana': return app.applyVolumeAdjust(input);
    case 'modificar_perfil': return app.applyProfileChange(input);
    case 'guardar_nota_coach': return app.applyCoachNote(input);
    case 'deshacer_cambio': return app.applyUndoLastChange();
    default: return 'Herramienta no reconocida.';
  }
}

function argMatches(actual, wanted) {
  if (Array.isArray(wanted)) return Array.isArray(actual) && JSON.stringify([...actual].sort()) === JSON.stringify([...wanted].sort());
  return actual === wanted;
}

// result: { calls: [{name, input, output}], text }. Devuelve una lista de fallas (vacía = el caso pasó).
function evaluate(c, result) {
  const exp = c.esperado || {};
  const fails = [];
  const calls = result.calls || [];
  const text = result.text || '';
  (exp.herramientas || []).forEach(w => {
    const ok = calls.some(x => x.name === w.name && Object.entries(w.args || {}).every(([k, v]) => argMatches(x.input && x.input[k], v)));
    if (!ok) fails.push(`falta ${w.name}${w.args ? ' con ' + JSON.stringify(w.args) : ''}; llamó: ${calls.map(x => x.name + JSON.stringify(x.input)).join(' | ') || 'nada'}`);
  });
  (exp.prohibidas || []).forEach(n => { if (calls.some(x => x.name === n)) fails.push(`llamó ${n}, que no corresponde`); });
  if (exp.sinHerramientas && calls.length) fails.push('no tenía que llamar herramientas y llamó: ' + calls.map(x => x.name).join(', '));
  (exp.textoCoincide || []).forEach(r => { if (!new RegExp(r, 'i').test(text)) fails.push(`el texto no menciona /${r}/: "${text.slice(0, 160)}"`); });
  (exp.textoNoCoincide || []).forEach(r => { if (new RegExp(r, 'i').test(text)) fails.push(`el texto dice /${r}/: "${text.slice(0, 160)}"`); });
  return fails;
}

module.exports = { loadCases, prepareCase, executeTool, evaluate, realTools, serverRules };
