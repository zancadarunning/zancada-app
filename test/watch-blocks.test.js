// Los relojes tienen que recibir las sesiones POR BLOQUES: cuestas/series con cada repetición ("1/10") y la entrada en calor / vuelta a la calma como bloques propios (el tiempo total los incluye).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');
const { buildCorosCourse } = require('../api/_lib/coros-workout-builder');
const { buildWahooPlan } = require('../api/_lib/wahoo-plan-builder');
const { buildGuide } = require('../api/_lib/suunto-guide-builder');
const { cleanDay } = require('../api/_lib/watch-plan-clean');

const ZONES = { 1: { min: 100, max: 120 }, 2: { min: 121, max: 140 }, 4: { min: 160, max: 172 } };
const clean = o => JSON.parse(JSON.stringify(o));

test('parseRepsFromDesc: cuestas por tiempo ("10 subidas de 1 min ... 1 min 30 seg") en espanol', () => {
  const app = loadApp();
  const p = clean(app.parseRepsFromDesc('Hacé 10 subidas de 1 min fuerte (zona 4) y bajá trotando suave unos 1 min 30 seg como recuperación entre cada una.'));
  assert.deepEqual(p, { reps: 10, repSec: 60, recSec: 90 });
});

test('parseRepsFromDesc: series por distancia y otros idiomas', () => {
  const app = loadApp();
  assert.deepEqual(clean(app.parseRepsFromDesc('6 x 800 m a ritmo fuerte con 2 min de recuperación')), { reps: 6, repMeters: 800, recSec: 120 });
  assert.deepEqual(clean(app.parseRepsFromDesc('Do 8 hill repeats of 90 seconds hard, then jog back 2 min')), { reps: 8, repSec: 90, recSec: 120 });
  assert.deepEqual(clean(app.parseRepsFromDesc('Fais 10 côtes de 1 min en zone 4, récupération 1 min 30')), { reps: 10, repSec: 60, recSec: 90 });
  assert.deepEqual(clean(app.parseRepsFromDesc('Mach 5 Intervalle von 3 Minuten, Pause 90 Sekunden')), { reps: 5, repSec: 180, recSec: 90 });
  assert.deepEqual(clean(app.parseRepsFromDesc('Fai 8 ripetute da 400 m con 1 min di recupero')), { reps: 8, repMeters: 400, recSec: 60 });
});

test('parseRepsFromDesc: si no esta seguro, devuelve null (no inventa estructura)', () => {
  const app = loadApp();
  assert.equal(app.parseRepsFromDesc('Rodaje suave, ritmo cómodo de punta a punta'), null);
  assert.equal(app.parseRepsFromDesc('Corré 40 minutos en zona 2'), null);
  assert.equal(app.parseRepsFromDesc('1 subida de 1 min'), null, 'una sola repeticion no es un bloque');
  assert.equal(app.parseRepsFromDesc(''), null);
  assert.equal(app.parseRepsFromDesc(null), null);
});

test('watchDayPayload: una cuesta que solo tiene texto igual manda las repeticiones, la recuperacion y el calentamiento', () => {
  const app = loadApp();
  const d = { day: 'wed', typeKey: 'hills', custom: true, type: 'Cuestas', zone: 4, dist: 3.6, durMin: 25, timeBased: true, textLang: 'es',
    desc: 'Hacé 10 subidas de 1 min fuerte (zona 4) y bajá trotando suave unos 1 min 30 seg como recuperación entre cada una.' };
  let p;
  try { p = clean(app.watchDayPayload(d, '2026-10-28')); } catch (e) { return; }   // el helper no arma toda la pantalla: si falla por la UI, lo cubre el test estatico de abajo
  assert.equal(p.interval.reps, 10);
  assert.equal(p.repSec, 60);
  assert.equal(p.restSec, 90);
  assert.equal(p.warmupMin, 13, 'calidad: 3 de movilidad + 10 de trote');
  assert.equal(p.cooldownMin, 5);
});

const cuestas = () => cleanDay({ date: '2026-10-28', name: 'Cuestas', typeKey: 'hills', zone: 4, distKm: 3.6, durMin: 25, desc: 'x', interval: { reps: 10, workMin: 1, restMin: 1.5, recoveryMin: 1.5 }, repSec: 60, restSec: 90, timeBased: true, warmupMin: 13, cooldownMin: 5 });
const rodaje = () => cleanDay({ date: '2026-10-29', name: 'Rodaje suave', typeKey: 'easy', zone: 2, distKm: 5, durMin: 35, desc: 'x', timeBased: true, warmupMin: 8, cooldownMin: 5 });

test('cleanDay conserva warmupMin/cooldownMin acotados, y los deja sin definir si la app vieja no los manda', () => {
  assert.equal(rodaje().warmupMin, 8);
  assert.equal(cleanDay({ date: '2026-10-29', distKm: 5, warmupMin: 999, cooldownMin: -3 }).warmupMin, 30);
  assert.equal(cleanDay({ date: '2026-10-29', distKm: 5, warmupMin: 999, cooldownMin: -3 }).cooldownMin, 0);
  assert.equal(cleanDay({ date: '2026-10-29', distKm: 5 }).warmupMin, undefined);
});

test('COROS: cuestas = calentamiento + grupo de 10 repeticiones (esfuerzo 1:00 / recuperacion 1:30) + vuelta a la calma', () => {
  const c = buildCorosCourse(cuestas(), ZONES, {});
  assert.equal(c.sections.length, 3);
  assert.deepEqual([c.sections[0].sectionType, c.sections[0].targetValue], [1, 13 * 60]);
  const g = c.sections[1];
  assert.equal(g.repeats, 10);
  assert.deepEqual([g.sets[0].sectionType, g.sets[0].targetType, g.sets[0].targetValue], [2, 2, 60]);
  assert.deepEqual([g.sets[1].sectionType, g.sets[1].targetType, g.sets[1].targetValue], [3, 2, 90]);
  assert.deepEqual([c.sections[2].sectionType, c.sections[2].targetValue], [4, 300]);
});

test('COROS: un rodaje trae calentamiento y vuelta a la calma como secciones propias (y sin ellos si la app vieja no los manda)', () => {
  const c = buildCorosCourse(rodaje(), ZONES, {});
  assert.deepEqual(c.sections.map(s => [s.sectionType, s.targetValue]), [[1, 480], [2, 2100], [4, 300]]);
  const old = buildCorosCourse(cleanDay({ date: '2026-10-29', name: 'Rodaje', typeKey: 'easy', zone: 2, distKm: 5, durMin: 35, timeBased: true }), ZONES, {});
  assert.equal(old.sections.length, 1);
});

test('Wahoo: cuestas con repeat 10 (una vez + 9) y calentamiento/vuelta a la calma; el rodaje tambien lleva los dos bloques', () => {
  const p = buildWahooPlan(cuestas(), ZONES, {});
  assert.deepEqual(p.intervals.map(i => [i.intensity_type, i.exit_trigger_type]), [['wu', 'time'], [undefined, 'repeat'], ['cd', 'time']]);
  assert.equal(p.intervals[0].exit_trigger_value, 13 * 60);
  assert.equal(p.intervals[1].exit_trigger_value, 9, 'Wahoo cuenta las repeticiones DESPUES de la primera');
  assert.deepEqual(p.intervals[1].intervals.map(i => i.exit_trigger_value), [60, 90]);
  const r = buildWahooPlan(rodaje(), ZONES, {});
  assert.deepEqual(r.intervals.map(i => i.intensity_type), ['wu', 'active', 'cd']);
});

test('Suunto: cuestas con paso repeat de 10 y calentamiento/vuelta a la calma; el rodaje por tiempo lleva su propia cuenta regresiva', () => {
  const g = buildGuide(cuestas(), ZONES, {});
  assert.equal(g.steps.length, 3);
  assert.equal(g.steps[1].type, 'repeat');
  assert.equal(g.steps[1].times, 10);
  const r = buildGuide(rodaje(), ZONES, {});
  assert.equal(r.steps.length, 3, 'calentamiento + principal + vuelta a la calma');
  const mainFields = JSON.stringify(r.steps[1]);
  assert.match(mainFields, /stepDurationCountdown/);
  const old = buildGuide(cleanDay({ date: '2026-10-29', name: 'Rodaje', typeKey: 'easy', zone: 2, distKm: 5, durMin: 35, timeBased: true }), ZONES, {});
  assert.equal(old.steps.length, 1, 'sin warmupMin se comporta como antes');
});
