// Entrenamiento progresivo por bloques: tres tramos (suave, moderado, exigente) en la pestaña del plan y en la evaluación por tramos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const ZONES = { 1: { min: 100, max: 125 }, 2: { min: 125, max: 140 }, 3: { min: 140, max: 155 }, 4: { min: 155, max: 170 }, 5: { min: 170, max: 190 } };

// segs: [{ sec, v (m/s), hr }] una muestra por segundo, en línea recta
function makeRun(segs) {
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
  return { id: 'r1', distanceKm: d / 1000, durationSec: s, points, series: { t, hr, paceMin: null } };
}

test('un progresivo se arma en tres tramos iguales, cada uno con su zona, entre el calentamiento y la vuelta a la calma', () => {
  const a = loadApp();
  const plan = a.planStepsFromPayload({ distKm: 9, typeKey: 'progression', zone: 3, warmupMin: 13, cooldownMin: 5 });
  assert.deepEqual([...plan.steps.map(s => s.kind)], ['warmup', 'main', 'main', 'main', 'cooldown']);
  const legs = plan.steps.filter(s => s.kind === 'main');
  assert.deepEqual([...legs.map(s => s.meters)], [3000, 3000, 3000]);
  assert.deepEqual([...legs.map(s => s.zone)], [2, 3, 4]);
  assert.deepEqual([...legs.map(s => s.leg)], [1, 2, 3]);
});

test('por tiempo, el progresivo también se parte en tres', () => {
  const a = loadApp();
  const plan = a.planStepsFromPayload({ distKm: 6, typeKey: 'progression', zone: 3, timeBased: true, durMin: 45, warmupMin: 13, cooldownMin: 5 });
  const legs = plan.steps.filter(s => s.kind === 'main');
  assert.equal(legs.length, 3);
  assert.ok(legs.every(s => s.sec === 900 && s.meters == null));
});

test('las demás sesiones continuas siguen con un solo bloque principal', () => {
  const a = loadApp();
  for (const typeKey of ['easy', 'long', 'tempo']) {
    const plan = a.planStepsFromPayload({ distKm: 8, typeKey, zone: 2, warmupMin: 8, cooldownMin: 5 });
    assert.equal(plan.steps.filter(s => s.kind === 'main').length, 1, typeKey);
  }
});

test('la evaluación juzga cada tramo con su zona y dice si el ritmo fue subiendo', () => {
  const a = loadApp();
  const plan = a.planStepsFromPayload({ distKm: 3.5, typeKey: 'progression', zone: 3, warmupMin: 5, cooldownMin: 3 });
  const good = makeRun([
    { sec: 300, v: 2.5, hr: 125 },
    { sec: 449, v: 2.6, hr: 132 }, { sec: 402, v: 2.9, hr: 148 }, { sec: 354, v: 3.3, hr: 163 },
    { sec: 180, v: 2.4, hr: 128 }
  ]);
  const ev = a.evaluateRunSteps(good, plan, ZONES);
  assert.ok(ev, 'se evalúa');
  const legs = ev.rows.filter(r => r.leg);
  assert.deepEqual([...legs.map(r => r.leg)], [1, 2, 3]);
  assert.equal(ev.summary.progressed, true);
  assert.equal(ev.summary.mainHigh, 0, 'cada tramo dentro de su zona');
  const flat = a.evaluateRunSteps(makeRun([
    { sec: 300, v: 2.5, hr: 125 },
    { sec: 402, v: 2.9, hr: 132 }, { sec: 402, v: 2.9, hr: 148 }, { sec: 402, v: 2.9, hr: 163 },
    { sec: 180, v: 2.4, hr: 128 }
  ]), plan, ZONES);
  assert.equal(flat.summary.progressed, false);
  const hot = a.evaluateRunSteps(makeRun([
    { sec: 300, v: 2.5, hr: 125 },
    { sec: 449, v: 2.6, hr: 160 }, { sec: 402, v: 2.9, hr: 148 }, { sec: 354, v: 3.3, hr: 163 },
    { sec: 180, v: 2.4, hr: 128 }
  ]), plan, ZONES);
  assert.equal(hot.summary.mainHigh, 1, 'el primer tramo, que era suave, se pasó de la zona');
});

test('la pestaña del plan titula cada tramo y lo nombra en los 6 idiomas; ya no hay botón de sincronizar en el ejercicio del día', () => {
  assert.ok(app.includes("t('sess_leg', {n:leg})"));
  assert.ok(app.includes("'sess_leg_easy', 'sess_leg_mid', 'sess_leg_hard'"));
  assert.ok(app.includes("x.leg ? 'sess_leg'"));
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.js'), 'utf8');
    for (const k of ['sess_leg', 'sess_leg_easy', 'sess_leg_mid', 'sess_leg_hard', 'seg_sum_prog_ok', 'seg_sum_prog_flat']) assert.ok(s.includes(k + ':'), l + ' ' + k);
  }
  assert.ok(!app.includes('id="sync-today-btn"'), 'sin el botón en el ejercicio del día');
  assert.ok(app.includes('data-on-click="syncTodayNow()"'), 'el botón del cartel de Historial (Strava) sigue');
});
