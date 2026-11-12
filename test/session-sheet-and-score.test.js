// Sesión del Plan en bloques (pestaña al tocar un día) y puntuación de la carrera en el detalle del Historial.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('app.js');

const ZONES = { 1: { min: 100, max: 125 }, 2: { min: 125, max: 140 }, 3: { min: 140, max: 155 }, 4: { min: 155, max: 170 }, 5: { min: 170, max: 190 } };
const kinds = a => [...a.map(b => b.kind)];

test('las series se agrupan como las ve la persona: calentamiento, repeticiones 4x (trabajo + recuperación) y vuelta a la calma', () => {
  const a = loadApp();
  const plan = a.planStepsFromPayload({ distKm: 5.6, typeKey: 'intervals', zone: 4, interval: { reps: 4, repMeters: 400, recoveryMin: 1 }, warmupMin: 13, cooldownMin: 5 });
  const blocks = a.sessionBlocks(plan.steps);
  assert.deepEqual(kinds(blocks), ['warmup', 'reps', 'cooldown']);
  assert.equal(blocks[1].reps, 4);
  assert.deepEqual([...blocks[1].lines.map(l => l.kind)], ['work', 'rest']);
  const easy = a.sessionBlocks(a.planStepsFromPayload({ distKm: 4, typeKey: 'easy', zone: 2, warmupMin: 8, cooldownMin: 5 }).steps);
  assert.deepEqual(kinds(easy), ['warmup', 'main', 'cooldown']);
});

test('la pestaña de la sesión trae el gráfico de bloques, qué hacer en cada uno y las notas; los días de descanso solo traen su texto', () => {
  const a = loadApp();
  a.state.profile = { weeklyKm: 30, goal: '10k', runnerType: 'active', units: 'metric', trainBy: 'distance', hrZones: ZONES };
  const d = { day: 'tue', typeKey: 'intervals', zone: 4, dist: 5.6, interval: { reps: 4, repMeters: 400, recoveryMin: 1 } };
  const html = a.buildSessionSheetHtml({ d, date: '2026-11-03', title: 'Series', lblDesc: 'texto largo', statusBlock: '', isEventDay: false });
  for (const needle of ['class="ss-bars"', 'ss-bar', 'sess_reps'.length ? 'Repeticiones 4x' : '', 'Calentamiento', 'Vuelta a la calma', 'Notas del entrenamiento', '400 m']) assert.ok(html.includes(needle), needle);
  assert.equal((html.match(/class="ss-bar"/g) || []).length, 10, '1 calentamiento + 4 x (trabajo + recuperación) + 1 vuelta a la calma');
  const rest = a.buildSessionSheetHtml({ d: { day: 'mon', typeKey: 'rest', dist: 0 }, date: '2026-11-02', title: 'Descanso', lblDesc: 'Día libre', statusBlock: '', isEventDay: false });
  assert.ok(!rest.includes('ss-bars') && rest.includes('Día libre'));
});

test('puntuación: lo hecho contra lo previsto; pasarse mucho resta y quedarse corto baja la nota', () => {
  const a = loadApp();
  a.state.profile = { units: 'metric', trainBy: 'time', hrZones: ZONES };
  const d = { day: 'tue', typeKey: 'easy', zone: 2, dist: 4, durMin: 35, timeBased: true };
  const score = min => a.scoreRunAgainstPlan({ durationSec: min * 60, distanceKm: 4 }, d, null).score;
  assert.equal(score(35), 100);
  assert.equal(score(30), 86);
  assert.ok(score(60) < 100 && score(60) >= 80, 'pasarse mucho resta un poco: ' + score(60));
  assert.ok(score(10) < 35);
  assert.equal(a.scoreRunAgainstPlan({ durationSec: 600, distanceKm: 2 }, { typeKey: 'rest', dist: 0 }, null), null, 'sin sesión planeada no hay puntuación');
});

test('el Plan abre la pestaña (ya no despliega el texto debajo) y el detalle de la carrera muestra el Plan y la puntuación arriba de Editar', () => {
  assert.match(app, /function toggleDay\(i\)\{ openSessionSheet\(i\); \}/);
  assert.ok(!/class="day-detail" id="detail-\$\{i\}"/.test(app));
  const detail = app.slice(app.indexOf("function openRunDetail("), app.indexOf("function switchRDTab("));
  // Editar y eliminar pasaron al menú de tres puntos de arriba: la puntuación sigue cerrando el detalle
  assert.ok(detail.indexOf('renderRunPlanScore(r)') > 0, 'la puntuación va en el detalle');
  assert.ok(!detail.includes("openEditRun('${r.id}')"), 'Editar ya no es un botón al pie');
  const html = read('index.html');
  assert.ok(html.includes('id="session-sheet"') && html.includes('id="session-sheet-body"'));
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = read('locales/' + l + '.js');
    for (const k of ['sess_notes', 'sess_warmup', 'sess_cooldown', 'sess_main', 'sess_reps', 'sess_recovery', 'score_plan', 'score_title', 'score_band_a', 'score_band_d', 'score_done', 'score_fade', 'score_hr_high', 'score_hr_ok']) assert.ok(s.includes(k + ':'), l + ' ' + k);
  }
});
