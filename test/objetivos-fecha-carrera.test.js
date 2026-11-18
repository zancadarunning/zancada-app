// La meta y la fecha de la carrera objetivo viven en Perfil > Objetivos (antes en Datos personales), y al guardarlas el plan de ESTA semana se rearma en el acto:
// antes, quien movía la fecha "para más adelante" seguía viendo la carrera en el día viejo y no podía mover una sesión a ese día.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const section = (id) => { const a = html.indexOf('id="' + id + '"'); const b = html.indexOf('class="overlay overlay-sheet"', a + 10); return html.slice(a, b < 0 ? undefined : b); };

test('meta y fecha objetivo están en Objetivos y ya no en Datos personales', () => {
  const personal = section('personal-data-overlay'), goals = section('goals-overlay');
  assert.ok(!personal.includes('id="perfil-racedate"') && !personal.includes('id="perfil-goal"'));
  assert.ok(goals.includes('id="perfil-racedate"') && goals.includes('id="perfil-goal"'));
});

test('Entrenamiento: datos personales, objetivos, zonas, días, eventos, otros deportes y molestias', () => {
  const a = html.indexOf('data-i18n="perfil_group_training"'), b = html.indexOf('data-i18n="perfil_group_gear"');
  const rows = [...html.slice(a, b).matchAll(/class="settile"[^>]*data-on-click="(\w+)\(\)"/g)].map(m => m[1]);
  assert.deepEqual(rows, ['openPersonalDataOverlay', 'openGoalsOverlay', 'openZonesOverlay', 'openDaysOverlay', 'openEventOverlay', 'openCrossTrainingOverlay', 'openPainOverlay']);
});

test('cambiar la fecha objetivo desde Objetivos saca la carrera de hoy en el plan de esta semana', () => {
  const els = {};
  const app = loadApp({ elements: els });
  const mk = (value) => ({ value, classList: { add() {}, remove() {}, toggle() {} }, style: {}, dataset: {}, textContent: '', innerHTML: '' });
  const monday = '2026-06-08', hoy = '2026-06-10'; // miércoles
  const f = new Date(hoy + 'T10:00:00').getTime();
  app.Date = class extends Date { constructor(...a) { if (a.length === 0) super(f); else super(...a); } static now() { return f; } };
  app.persist = () => Promise.resolve(); app.renderAll = () => {}; app.renderPerfil = () => {}; app.renderChat = () => {}; app.flashSaved = () => {};
  const p = { name: 'x', goal: '10k', runnerType: 'active', currentWeeklyKm: 30, weeklyKm: 30, weeklyGoalKm: 0, trainingDays: ['tue', 'wed', 'fri', 'sun'], trainBy: 'distance', terrain: 'asfalto', units: 'metric', gender: 'f', weight: 65, height: 168, birth: '1988-06-15', createdAt: '2026-03-02', raceDate: hoy };
  app.state.profile = p; app.state.onboarded = true; app.state.weekNumber = 5; app.state.weekStart = monday; app.state.runs = []; app.state.shoes = []; app.state.chat = []; app.state.planHistory = [];
  app.state.plan = app.generatePlan(p, 5, monday);
  assert.ok(app.state.plan[2].raceDay, 'de partida hoy es el día de la carrera');
  const doc = {
    'perfil-weekly-goal': mk(''), 'perfil-goal-note': mk(''), 'perfil-availmin': mk(''),
    'perfil-goal': mk('10k'), 'perfil-racedate': mk('2026-08-30'),
  };
  app.document.getElementById = (id) => doc[id] || mk('');
  app.saveGoals();
  assert.equal(app.state.profile.raceDate, '2026-08-30');
  assert.ok(!app.state.plan[2].raceDay, 'hoy ya no es día de carrera');
});

function appConPlanViejo(raceDate) {
  const app = loadApp();
  const f = new Date('2026-06-10T10:00:00').getTime(); // miércoles
  app.Date = class extends Date { constructor(...a) { if (a.length === 0) super(f); else super(...a); } static now() { return f; } };
  app.persist = () => Promise.resolve(); app.renderAll = () => {}; app.renderChat = () => {};
  const p = { name: 'x', goal: '10k', runnerType: 'active', currentWeeklyKm: 30, weeklyKm: 30, weeklyGoalKm: 0, trainingDays: ['tue', 'wed', 'fri', 'sun'], trainBy: 'distance', terrain: 'asfalto', units: 'metric', gender: 'f', weight: 65, height: 168, birth: '1988-06-15', createdAt: '2026-03-02', raceDate: '2026-06-10' };
  app.state.profile = p; app.state.onboarded = true; app.state.weekNumber = 5; app.state.weekStart = '2026-06-08'; app.state.runs = []; app.state.shoes = []; app.state.chat = []; app.state.planHistory = [];
  app.state.plan = app.generatePlan(p, 5, '2026-06-08');
  p.raceDate = raceDate; // la fecha cambió por un camino que no rehízo la semana
  return app;
}

test('un día de carrera viejo guardado en el plan se corrige solo al abrir la app', () => {
  const app = appConPlanViejo('2026-08-30');
  assert.ok(app.state.plan[2].raceDay);
  assert.equal(app.healStaleRaceDay(), true);
  assert.ok(!app.state.plan.some(d => d.raceDay), 'ya no queda ninguna carrera esta semana');
  assert.equal(app.healStaleRaceDay(), false, 'segunda vez: nada que corregir');
});

test('si la fecha nueva cae esta semana, el día de carrera aparece solo', () => {
  const app = appConPlanViejo('2026-06-12');
  assert.equal(app.healStaleRaceDay(), true);
  assert.ok(app.state.plan[4].raceDay && !app.state.plan[2].raceDay);
});

test('un día de carrera ya marcado como hecho no se pisa ni se reescribe en cada arranque', () => {
  const app = appConPlanViejo('2026-08-30');
  app.state.plan[2].status = 'done';
  assert.equal(app.healStaleRaceDay(), false);
  assert.ok(app.state.plan[2].raceDay);
});

test('al cambiar de idioma el nombre de la carrera objetivo del plan se vuelve a escribir', async () => {
  const app = appConPlanViejo('2026-06-10');
  app.state.plan = app.generatePlan(app.state.profile, 5, '2026-06-08');
  const antes = app.state.plan[2].raceEventName;
  assert.ok(antes);
  app.document.getElementById = () => ({ value: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, children: [], addEventListener() {}, setAttribute() {}, textContent: '' });
  app.ensureLocaleLoaded = async () => {}; app.applyStaticTranslations = () => {}; app.populateOnboardDays = () => {}; app.renderSportChips = () => {};
  app.renderHistory = () => {}; app.renderZones = () => {}; app.renderPerfilDays = () => {}; app.renderPerfilCrossTraining = () => {}; app.translateCustomPlanTexts = () => {};
  await app.setLang('en');
  assert.notEqual(app.state.plan[2].raceEventName, antes);
  assert.match(app.state.plan[2].raceEventName, /10K/);
});
