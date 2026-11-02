// Evaluación por tramos (pestaña Segmentos del detalle de una carrera): cuenta determinista de la carrera contra los pasos del plan.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const ZONES = { 1: { min: 100, max: 125 }, 2: { min: 125, max: 140 }, 3: { min: 140, max: 155 }, 4: { min: 155, max: 170 }, 5: { min: 170, max: 190 } };
const PAYLOAD = { distKm: 6, typeKey: 'intervals', zone: 4, interval: { reps: 3, repMeters: 400, recoveryMin: 1 }, warmupMin: 5, cooldownMin: 3, repSec: 0, restSec: 0 };

// segs: [{ sec, v (m/s), hr }] una muestra por segundo, en línea recta (cada metro son ~9e-6 grados de latitud)
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
const goodSegs = (workV, workHr) => [
  { sec: 300, v: 3, hr: 125 },
  ...[0, 1, 2].flatMap(() => [{ sec: 89, v: workV, hr: workHr }, { sec: 60, v: 2, hr: 140 }]),
  { sec: 180, v: 2.5, hr: 128 }
];

test('los pasos del plan salen igual que los del reloj: calentamiento, repeticiones con su recuperación y vuelta a la calma', () => {
  const app = loadApp();
  const plan = app.planStepsFromPayload(PAYLOAD);
  assert.deepEqual([...plan.steps.map(s => s.kind)], ['warmup', 'work', 'rest', 'work', 'rest', 'work', 'rest', 'cooldown']);
  assert.equal(plan.steps[1].meters, 400); assert.equal(plan.steps[2].sec, 60); assert.equal(plan.steps[1].zone, 4); assert.equal(plan.steps[2].zone, 1);
  assert.equal(plan.checkFaster, true);
  const easy = app.planStepsFromPayload({ distKm: 6, typeKey: 'easy', zone: 2, warmupMin: 8, cooldownMin: 5 });
  assert.deepEqual([...easy.steps.map(s => s.kind)], ['warmup', 'main', 'cooldown']);
  assert.equal(easy.steps[1].meters, 6000);
  assert.equal(app.planStepsFromPayload({ distKm: 3, typeKey: 'test' }), null, 'el test de nivel no tiene estructura que evaluar');
});

test('cada tramo sale con su duración, distancia, ritmo y pulso reales, y el pulso fuera de zona se marca', () => {
  const app = loadApp();
  const ev = app.evaluateRunSteps(makeRun(goodSegs(4.5, 180)), app.planStepsFromPayload(PAYLOAD), ZONES);
  assert.ok(ev, 'se pudo evaluar');
  assert.equal(ev.rows.length, 8);
  const [warm, w1, r1] = ev.rows;
  assert.ok(Math.abs(warm.sec - 300) <= 1); assert.equal(warm.hrStatus, 'ok');
  assert.ok(Math.abs(w1.meters - 400) < 15, 'la repetición por distancia termina a los 400 m: ' + w1.meters);
  assert.ok(Math.abs(w1.paceMin - 3.7) < 0.15, 'ritmo de la repetición: ' + w1.paceMin);
  assert.ok(w1.hr >= 174 && w1.hr <= 180, 'pulso de la repetición ' + w1.hr); assert.equal(w1.hrStatus, 'high');
  assert.equal(r1.hrStatus, null, 'la recuperación no se juzga por pulso');
  assert.equal(ev.summary.high, 3); assert.ok(ev.summary.judged >= 5);
  assert.ok(ev.summary.spreadSec <= 8, 'repeticiones parejas');
});

test('si la carrera se fue aflojando, el resumen lo refleja (última repetición más lenta que la primera)', () => {
  const app = loadApp();
  const segs = [{ sec: 300, v: 3, hr: 125 }, { sec: 89, v: 4.5, hr: 165 }, { sec: 60, v: 2, hr: 140 }, { sec: 93, v: 4.3, hr: 165 }, { sec: 60, v: 2, hr: 140 }, { sec: 98, v: 4.08, hr: 165 }, { sec: 60, v: 2, hr: 140 }, { sec: 180, v: 2.5, hr: 128 }];
  const ev = app.evaluateRunSteps(makeRun(segs), app.planStepsFromPayload(PAYLOAD), ZONES);
  assert.ok(ev.summary.deltaSec >= 8, 'delta ' + ev.summary.deltaSec);
  assert.equal(ev.summary.high, 0);
});

test('si los cortes no cierran no se muestra nada: repeticiones más lentas que las recuperaciones, o la carrera termina antes que el plan', () => {
  const app = loadApp();
  const plan = app.planStepsFromPayload(PAYLOAD);
  const slowWork = [{ sec: 300, v: 3, hr: 125 }, ...[0, 1, 2].flatMap(() => [{ sec: 200, v: 2, hr: 150 }, { sec: 60, v: 3.5, hr: 140 }]), { sec: 180, v: 2.5, hr: 128 }];
  assert.equal(app.evaluateRunSteps(makeRun(slowWork), plan, ZONES), null);
  const short = makeRun([{ sec: 300, v: 3, hr: 125 }, { sec: 89, v: 4.5, hr: 170 }]);
  assert.equal(app.evaluateRunSteps(short, plan, ZONES), null);
  assert.equal(app.evaluateRunSteps({ id: 'x', distanceKm: 5, points: [], series: null }, plan, ZONES), null, 'sin ruta no hay tramos');
});

test('rodaje continuo: calentamiento, parte principal por distancia y vuelta a la calma con lo que sobra', () => {
  const app = loadApp();
  const plan = app.planStepsFromPayload({ distKm: 3, typeKey: 'easy', zone: 2, warmupMin: 5, cooldownMin: 3 });
  const segs = [{ sec: 300, v: 2.6, hr: 118 }, { sec: 1000, v: 3, hr: 135 }, { sec: 180, v: 2.4, hr: 125 }];
  const ev = app.evaluateRunSteps(makeRun(segs), plan, ZONES);
  assert.deepEqual([...ev.rows.map(r => r.kind)], ['warmup', 'main', 'cooldown']);
  assert.ok(Math.abs(ev.rows[1].meters - 3000) < 60);
  assert.equal(ev.rows[1].hrStatus, 'ok');
});

test('la pestaña Segmentos muestra los tramos y todos los idiomas traen los textos', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(app, /panel\.innerHTML = renderRunPlanSteps\(r\) \+/);
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.js'), 'utf8');
    for (const k of ['seg_plan_title', 'seg_step_work', 'seg_sum_fade', 'seg_sum_hr_high', 'seg_plan_note']) assert.ok(s.includes(k + ':'), l + ' ' + k);
  }
});
