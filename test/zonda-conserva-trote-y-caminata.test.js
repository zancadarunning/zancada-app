// Encontrado en el A33 (2026-11-21): a un principiante, Zonda le cambió el rodaje a "2,7 km, trote muy suave" y se perdió el trote y caminata del plan (el código borraba runWalk a propósito).
// Ahora una sesión easy/long de Zonda conserva el trote y caminata mientras la persona está en esa etapa. También: el resultado para el modelo trae el día con su nombre, y mover a mano no firma Zonda.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

function setup(profileOverrides) {
  const app = loadApp();
  app.state.profile = Object.assign({ name: 'T', goal: '5k', runnerType: 'new', trainingDays: ['mon', 'wed', 'fri'], terrain: 'asfalto', units: 'metric', trainBy: 'distance', weeklyKm: 0, currentWeeklyKm: 0, birth: '1995-01-01', weight: 68, height: 168 }, profileOverrides || {});
  app.state.weekNumber = 1;
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.plan = app.generatePlan(app.state.profile, 1, app.state.weekStart);
  app.state.chat = [];
  return app;
}
const ask = (extra) => Object.assign({ dia: 'wed', semana: 'siguiente', tipo: 'Rodaje suave', tipo_categoria: 'easy', duracion_min: 20, zona: 2, descripcion: 'Tranqui, hablando' }, extra || {});
const nextWed = (app) => app.getNextWeekPlan().plan.find(d => d.day === 'wed');

test('principiante: el rodaje de Zonda para la semana que viene conserva el trote y caminata (20 min = 5 tramos de 2 + 2)', () => {
  const app = setup();
  const res = app.applyPlanChange(ask());
  assert.match(res, /^OK/);
  const d = nextWed(app);
  assert.ok(d.runWalk && d.runWalk.reps > 0, 'tiene trote y caminata: ' + JSON.stringify(d));
  assert.equal(d.runWalk.reps * (d.runWalk.runSec + d.runWalk.walkSec) / 60, 20, 'los tramos suman lo que se pidió');
  assert.ok(d.runWalk.walkSec > 0 && d.runWalk.runSec > 0);
});

test('principiante: sin pedir duración usa los tramos del escalón de esa semana', () => {
  const app = setup();
  app.applyPlanChange(ask({ duracion_min: undefined, distancia_km: 3 }));
  const d = nextWed(app);
  assert.ok(d.runWalk && d.runWalk.reps > 0);
});

test('quien ya corre (no es principiante) NO recibe trote y caminata', () => {
  const app = setup({ runnerType: 'active', weeklyKm: 30, currentWeeklyKm: 30 });
  app.applyPlanChange(ask());
  assert.ok(!nextWed(app).runWalk);
});

test('si pide correr de corrido, o es una sesión de otro tipo, no se fuerza el trote y caminata', () => {
  const a = setup();
  a.applyPlanChange(ask({ descripcion: 'Quiero correr de corrido, sin caminar' }));
  assert.ok(!nextWed(a).runWalk, 'pidió de corrido');
  const b = setup();
  assert.match(b.applyPlanChange(ask({ tipo_categoria: 'tempo', tipo: 'Tempo', zona: 3 })), /principiante/, 'la app ya rechaza tempo para principiantes');
  const c = setup({ runnerType: 'active', weeklyKm: 30, currentWeeklyKm: 30 });
  c.applyPlanChange(ask({ tipo_categoria: 'tempo', tipo: 'Tempo', zona: 3 }));
  assert.ok(!nextWed(c).runWalk, 'tempo no es trote y caminata');
});

test('quien ya corre de corrido según el test de nivel (continuousOk) no recibe trote y caminata', () => {
  const app = setup({ levelTest: { done: true, continuousOk: true, distanceM: 2400, paces: { easy: [6, 7], tempo: [5, 5.5], interval: [4.5, 5] } } });
  app.applyPlanChange(ask());
  assert.ok(!nextWed(app).runWalk);
});

test('el resultado para el modelo dice el día con su nombre y no la clave en inglés ("actualizado sat")', () => {
  const app = setup();
  const res = app.applyPlanChange(ask());
  assert.ok(!/\bwed\b/.test(res), 'no debe traer la clave cruda: ' + res);
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(src.includes("return `OK, actualizado ${t('day_' + d.day)}:"), 'semana actual');
  assert.ok(src.includes("de la semana que viene:") && src.includes("actualicé ${t('day_' + input.dia)}"), 'semana que viene');
});

test('mover una sesión arrastrando no deja el cartel "Zonda actualizó el plan" (solo cuando lo hace Zonda)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(src.includes("if(!input.manual) state.chat.push({role:'system', text:sysMsgWithIcon(ICONS.edit, t('coach_plan_updated')+': '+t('day_'+input.dia_origen)"), 'solo firma Zonda si no es manual');
  assert.ok(src.includes('applyMoveSession({dia_origen: DAY_KEYS[from], dia_destino: DAY_KEYS[to], manual: true})'), 'el arrastre manda manual:true');
});

test('la tarjeta de calentamiento tiene el botón "Saltar" arriba, junto a la etiqueta (abajo lo tapaba el botón de pausa)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const tag = html.indexOf('id="workout-guide-wc-tag"');
  const skip = html.indexOf('id="workout-guide-wc-skip"');
  const time = html.indexOf('id="workout-guide-wc-time"');
  assert.ok(tag > 0 && skip > tag && skip < time, 'el botón va antes del cronómetro');
  assert.equal(html.split('id="workout-guide-wc-skip"').length - 1, 1, 'un solo botón');
});

test('la sesión de Zonda con trote y caminata muestra esa estructura en sus notas (no solo el texto libre)', () => {
  const app = setup();
  app.applyPlanChange(ask());
  const d = nextWed(app);
  const body = app.planLabelBody(d).desc;
  assert.ok(body.includes('Tranqui, hablando'), 'conserva el texto de Zonda');
  assert.match(body, /trote/i, 'agrega los tramos de trote y caminata');
});
