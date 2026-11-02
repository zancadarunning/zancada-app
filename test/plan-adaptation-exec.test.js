// Adaptación por ejecución: la semana que sigue se mira también con lo que se hizo de verdad (ritmo y pulso por tramo), no solo con las calificaciones.
// Fase 1 (por defecto): solo avisa. Con apply: también mueve el volumen, con tope 0,85-1,05 y sin recortar dos semanas seguidas por esto.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const ZONES = { 1: { min: 100, max: 125 }, 2: { min: 125, max: 140 }, 3: { min: 140, max: 155 }, 4: { min: 155, max: 170 }, 5: { min: 170, max: 190 } };

function makeRun(id, segs, source) {
  const points = [], t = [], hr = [];
  let d = 0, s = 0;
  points.push({ lat: -34.6, lon: -58.4, t: 0 });
  for (const seg of segs) {
    for (let i = 0; i < seg.sec; i++) {
      d += seg.v; s++;
      points.push({ lat: -34.6 + d / 111195, lon: -58.4, t: s });
      if (s % 5 === 0) { t.push(s); hr.push(seg.hr); }
    }
  }
  return { id, source: source || 'garmin', distanceKm: d / 1000, durationSec: s, points, series: { t, hr, paceMin: null } };
}
// series de 3 repeticiones de 400 m; reps = [{sec, v}] (ritmo por repetición), hr = pulso en las repeticiones
function intervalRun(id, reps, hr, source) {
  return makeRun(id, [{ sec: 780, v: 3, hr: 125 }, ...reps.flatMap(r => [{ sec: r.sec, v: r.v, hr }, { sec: 60, v: 2, hr: 140 }]), { sec: 300, v: 2.5, hr: 128 }], source);
}
const FADE = [{ sec: 89, v: 4.5 }, { sec: 93, v: 4.3 }, { sec: 98, v: 4.08 }];
const EVEN = [{ sec: 89, v: 4.5 }, { sec: 89, v: 4.5 }, { sec: 89, v: 4.5 }];
const easyRun = (id, hr) => makeRun(id, [{ sec: 480, v: 2.6, hr: 120 }, { sec: 1000, v: 3, hr }, { sec: 300, v: 2.4, hr: 125 }]);

function setup(app, days, runs) {
  app.state.profile = { weeklyKm: 30, currentWeeklyKm: 30, goal: '10k', runnerType: 'active', trainingDays: ['tue', 'thu', 'sun'], terrain: 'asfalto', units: 'metric', trainBy: 'distance', hrZones: ZONES };
  app.state.weekStart = '2026-10-26';
  app.state.runs = runs;
  app.state.objCutAppliedTo = null;
  const rest = { typeKey: 'rest', dist: 0 };
  app.state.plan = Array.from({ length: 7 }, (_, i) => days[i] || rest);
}
const quality = (id, extra) => Object.assign({ typeKey: 'intervals', zone: 4, dist: 6, interval: { reps: 3, repMeters: 400, recoveryMin: 1 }, status: 'done', linkedRunId: id }, extra || {});
const easy = id => ({ typeKey: 'easy', zone: 2, dist: 3, status: 'done', linkedRunId: id });

test('dos sesiones de calidad que se aflojaron: en fase 1 solo avisa y no toca el volumen', () => {
  const app = loadApp();
  setup(app, [quality('a'), null, quality('b')], [intervalRun('a', FADE, 165), intervalRun('b', FADE, 165)]);
  const adj = app.computeWeekAdjustment(app.state.plan);
  assert.equal(adj.factor, 1);
  assert.equal(adj.objKind, 'strain');
  assert.equal(adj.objCut, false);
  assert.ok(adj.objNote && adj.objNote.length > 20);
});

test('con el ajuste activado baja 8 %, respeta el tope, y no recorta dos semanas seguidas por esto', () => {
  const app = loadApp();
  setup(app, [quality('a'), null, quality('b')], [intervalRun('a', FADE, 165), intervalRun('b', FADE, 165)]);
  const adj = app.computeWeekAdjustment(app.state.plan, { apply: true });
  assert.equal(adj.factor, 0.92); assert.equal(adj.objCut, true);
  app.state.objCutAppliedTo = app.state.weekStart;   // la semana actual ya fue un recorte
  const again = app.computeWeekAdjustment(app.state.plan, { apply: true });
  assert.equal(again.factor, 1); assert.equal(again.objCut, false);
  // junto con el ajuste de siempre (2 sesiones calificadas "mal") nunca pasa del piso 0,85
  app.state.objCutAppliedTo = null;
  app.state.plan[0].rating = 'mal'; app.state.plan[2].rating = 'mal';
  assert.equal(app.computeWeekAdjustment(app.state.plan, { apply: true }).factor, 0.85);
});

test('series parejas y con el pulso en zona: aviso positivo, y con el ajuste activado sube 3 % (solo si no hubo señales malas)', () => {
  const app = loadApp();
  setup(app, [quality('a'), null, quality('b')], [intervalRun('a', EVEN, 165), intervalRun('b', EVEN, 165)]);
  const msg = app.computeWeekAdjustment(app.state.plan);
  assert.equal(msg.objKind, 'good'); assert.equal(msg.factor, 1);
  assert.equal(app.computeWeekAdjustment(app.state.plan, { apply: true }).factor, 1.03);
  app.state.plan[1] = { typeKey: 'rest', dist: 5, status: 'skipped' }; app.state.plan[3] = { typeKey: 'rest', dist: 5, status: 'skipped' };
  assert.equal(app.computeWeekAdjustment(app.state.plan, { apply: true }).objKind, undefined, 'con sesiones salteadas no se felicita ni se sube');
});

test('rodajes suaves con el pulso por encima de la zona 2: solo aviso, nunca recorta kilómetros', () => {
  const app = loadApp();
  setup(app, [easy('a'), null, easy('b')], [easyRun('a', 160), easyRun('b', 158)]);
  const adj = app.computeWeekAdjustment(app.state.plan, { apply: true });
  assert.equal(adj.objKind, 'easy'); assert.equal(adj.factor, 1); assert.equal(adj.objCut, false);
});

test('poca evidencia o datos que no corresponden no mueven nada: una sola sesión, carreras de Strava, sin ruta, semana que no es la actual', () => {
  const app = loadApp();
  setup(app, [quality('a')], [intervalRun('a', FADE, 165)]);
  assert.equal(app.computeWeekAdjustment(app.state.plan, { apply: true }).factor, 1, 'una sola sesión no alcanza');
  setup(app, [quality('a'), null, quality('b')], [intervalRun('a', FADE, 165, 'strava'), intervalRun('b', FADE, 165, 'strava')]);
  assert.equal(app.computeWeekAdjustment(app.state.plan, { apply: true }).factor, 1, 'Strava no entra');
  setup(app, [quality('a'), null, quality('b')], [{ id: 'a', distanceKm: 6, durationSec: 2000 }, { id: 'b', distanceKm: 6, durationSec: 2000 }]);
  assert.equal(app.computeWeekAdjustment(app.state.plan, { apply: true }).factor, 1, 'sin ruta no hay tramos');
  setup(app, [quality('a'), null, quality('b')], [intervalRun('a', FADE, 165), intervalRun('b', FADE, 165)]);
  const other = app.state.plan.slice();
  assert.equal(app.computeWeekAdjustment(other, { apply: true }).factor, 1, 'solo se mira la semana en curso');
});

test('el cambio de semana manda el aviso al chat sin reenviarlo a la IA, y recuerda el recorte; el resto de los textos están en los 6 idiomas', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(src, /if\(objNote\) state\.chat\.push\(\{role:'coach', text: objNote, ts:Date\.now\(\), noAi:true\}\)/);
  assert.match(src, /if\(adj\.objCut\) state\.objCutAppliedTo = promotedWeekStart/);
  assert.match(src, /const OBJ_ADJUST_APPLY = false;/, 'la fase 1 sale apagada');
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.js'), 'utf8');
    for (const k of ['obj_note_strain', 'obj_note_strain_applied', 'obj_note_easy', 'obj_note_good', 'obj_note_good_applied']) assert.ok(s.includes(k + ':'), l + ' ' + k);
  }
});
