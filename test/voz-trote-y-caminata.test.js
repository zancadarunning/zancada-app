// Guía de voz del principiante (trote y caminata). Reportado el 2026-11-21: el plan de un principiante arma "7 x (1 min trote + 2 min caminata)", pero la guía en vivo lo trataba como un
// rodaje continuo: decía "Rodaje suave: 21 min, ¡a correr!" y nunca avisaba cuándo trotar ni cuándo caminar (para quien sale sin mirar el reloj, 21 minutos seguidos).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TODAY = (new Date().getDay() + 6) % 7;
const LANGS = ['es', 'en', 'pt', 'fr', 'it', 'de'];

function setup(lang, session) {
  const app = loadApp();
  app.setLangValue(lang);
  const said = [];
  app.speak = (txt) => said.push({ at: app.getTracker().elapsedSec, txt });
  app.haptic = () => {};
  const plan = DAYS.map((day) => ({ day, typeKey: 'rest', dist: 0 }));
  plan[TODAY] = Object.assign({ day: DAYS[TODAY] }, session);
  app.state.profile = Object.assign(app.state.profile || {}, { trainBy: 'time', units: 'metric', name: 'T', level: 'beginner' });
  app.state.plan = plan;
  app.state.voiceEnabled = true; app.state.voiceMode = 'on';
  const tr = app.getTracker();
  tr.running = true; tr.autoPaused = false; tr.elapsedSec = 0; tr.distanceKm = 0; tr.points = []; tr.lastAnnouncedKm = 0; tr.ms = null;
  app.setupWorkoutGuide();
  return { app, tr, said };
}
function run(app, tr, seconds) {
  for (let s = 1; s <= seconds; s++) { tr.elapsedSec = s; tr.distanceKm += 0.0025; app.tickWorkoutGuide(); }
}
const RW = { typeKey: 'easy', dist: 2.8, durMin: 21, zone: 2, runWalk: { reps: 7, runSec: 60, walkSec: 120 } };

test('un rodaje con trote y caminata arma la guía por tramos (runwalk), no un rodaje continuo', () => {
  const { tr } = setup('es', RW);
  assert.equal(tr.workout.structure.typeKey, 'runwalk');
  assert.equal(tr.workout.structure.reps, 7);
  assert.equal(tr.workout.structure.runSec, 60);
  assert.equal(tr.workout.structure.walkSec, 120);
});

test('un rodaje común (sin trote y caminata) sigue siendo continuo', () => {
  const { tr } = setup('es', { typeKey: 'easy', dist: 5, durMin: 32, zone: 2 });
  assert.equal(tr.workout.structure.typeKey, 'continuous');
});

test('la voz dice caminata en el calentamiento, y después trotá/caminá con el número de tramo, solita y sin tocar nada', () => {
  const { app, tr, said } = setup('es', RW);
  assert.match(said[0].txt, /caminata tranquila/, 'el calentamiento de quien empieza es caminando');
  run(app, tr, 300 + 7 * 180);   // calentamiento (5 min) + 7 tramos
  const t = said.map(x => x.txt);
  const runs = t.filter(x => /^Trotá 1 minuto\. Tramo \d de 7\.$/.test(x));
  const walks = t.filter(x => x === 'Caminá 2 minutos.');
  assert.equal(runs.length, 7, 'un aviso de trote por tramo: ' + JSON.stringify(t));
  assert.equal(walks.length, 6, 'después del último trote viene la vuelta a la calma, no otra caminata');
  assert.equal(runs[0], 'Trotá 1 minuto. Tramo 1 de 7.');
  assert.equal(runs[6], 'Trotá 1 minuto. Tramo 7 de 7.');
  assert.ok(!t.some(x => /Empezar repeticiones/.test(x)), 'no le pide tocar un botón: es por tiempo');
  // el primer trote sale justo al terminar el calentamiento, y cada caminata a los 60 s del trote
  assert.equal(said.find(x => x.txt.startsWith('Trotá')).at, 300);
  assert.equal(said.find(x => x.txt.startsWith('Caminá')).at, 360);
  assert.ok(t.some(x => /vuelta a la calma/.test(x)), 'al terminar el último trote arranca la vuelta a la calma');
});

test('trote y caminata: sin errores ni textos rotos en los 6 idiomas', () => {
  for (const lang of LANGS) {
    const { app, tr, said } = setup(lang, Object.assign({}, RW, { typeKey: 'long', runWalk: { reps: 5, runSec: 180, walkSec: 120 } }));
    run(app, tr, 300 + 5 * 300 + 400);
    assert.ok(said.length >= 12, lang + ': hay avisos');
    for (const x of said) assert.ok(x.txt && !/undefined|NaN|\{[a-z]+\}|\[object/.test(x.txt), lang + ' texto roto: ' + x.txt);
  }
});

test('los 6 idiomas tienen los textos nuevos, con los mismos {datos}', () => {
  const app = loadApp();
  const keys = ['voice_run_start', 'voice_walk_start', 'voice_warm_start_walk', 'run_guide_warm_hint_walk', 'run_guide_tag_run', 'run_guide_tag_walk'];
  for (const k of keys) {
    const ref = (app.I18N.es[k].match(/\{[a-z]+\}/g) || []).sort().join();
    for (const l of LANGS) {
      assert.ok(app.I18N[l][k], l + ' falta ' + k);
      assert.equal((app.I18N[l][k].match(/\{[a-z]+\}/g) || []).sort().join(), ref, l + ' ' + k);
    }
  }
});
