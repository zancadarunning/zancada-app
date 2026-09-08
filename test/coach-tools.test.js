// test/coach-tools.test.js
//
// Pruebas de las herramientas del coach agregadas/tocadas en esta tanda de mejoras:
// - modificar_perfil con dias_entreno (applyProfileChange): permite cambiar el
//   cronograma de días de entreno de forma permanente, algo que antes solo se podía
//   hacer desde Perfil > Días -- el coach no tenía ninguna herramienta para esto, que
//   fue la causa raíz de más de una confusión reportada (el corredor pedía por chat,
//   semana a semana, lo que en realidad quería como cambio permanente).
// - deshacer_cambio (captureUndoSnapshot/applyUndoLastChange): permite deshacer el
//   último cambio aplicado por cualquiera de las herramientas del coach.
// - getNextWeekPlan/checkWeekRollover: un día cancelado por chat para "la semana que viene"
//   ahora se promueve a la semana actual (el lunes que arranca) como un día de descanso
//   normal (custom:false, cancelled:true) en vez de quedar marcado como "personalizado".

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

function baseProfile(app, overrides) {
  return Object.assign({
    name: 'Corredor de prueba',
    weeklyKm: 30,
    weeklyGoalKm: 0,
    goal: '10k',
    runnerType: 'active',
    trainingDays: ['tue', 'wed', 'fri', 'sun'],
    terrain: 'asfalto',
    units: 'metric',
    trainBy: 'distance',
    birth: null,
    weight: null,
    height: null,
    hrKnown: false,
    hrMax: 190,
    hrZones: app.computeZones(190),
  }, overrides || {});
}

test('applyProfileChange: dias_entreno cambia el cronograma de base y regenera el plan', () => {
  const app = loadApp();
  // preserveLivedDays fuerza a descanso cualquier día ANTERIOR a hoy dentro de la semana
  // actual, sin importar el cronograma nuevo (mismo comportamiento ya cubierto en
  // plan-engine.test.js) -- así que elegimos como nuevo cronograma los dos días de hoy en
  // adelante, para que el test sea válido corra el día que corra, sin depender de la fecha.
  const todayIdx = (new Date().getDay() + 6) % 7;
  const newDays = todayIdx < 6 ? [app.DAY_KEYS[todayIdx], app.DAY_KEYS[todayIdx + 1]] : [app.DAY_KEYS[todayIdx]];

  app.state.profile = baseProfile(app);
  app.state.weekNumber = 1;
  app.state.plan = app.generatePlan(app.state.profile, 1);
  app.state.nextWeekOverrides = {};
  app.state.chat = [];

  const result = app.applyProfileChange({ dias_entreno: newDays });

  assert.match(result, /días de entreno/);
  // Array.from(...): trainingDays vive en el contexto vm sandboxeado, así que su Array
  // no es *el mismo* Array del proceso de test -- deepEqual en modo estricto compara
  // también el prototipo, así que hay que "aterrizarlo" a un array del realm del test.
  assert.deepEqual(Array.from(app.state.profile.trainingDays), newDays);

  app.state.plan.forEach((d, i) => {
    if (i < todayIdx) {
      assert.equal(d.dist, 0, `${d.day} (antes de hoy) debería quedar en descanso`);
    } else if (newDays.includes(d.day)) {
      assert.ok(d.dist > 0, `${d.day} (nuevo día de entreno, hoy en adelante) debería tener sesión`);
    } else {
      assert.equal(d.dist, 0, `${d.day} (ya no es día de entreno) debería quedar en descanso`);
    }
  });
});

test('applyProfileChange: dias_entreno con valores inválidos no cambia nada', () => {
  const app = loadApp();
  app.state.profile = baseProfile(app);
  app.state.weekNumber = 1;
  app.state.plan = app.generatePlan(app.state.profile, 1);
  app.state.nextWeekOverrides = {};
  app.state.chat = [];

  const result = app.applyProfileChange({ dias_entreno: ['no-existe', 'tampoco'] });

  assert.equal(result, 'No hubo cambios para aplicar.');
  assert.deepEqual(Array.from(app.state.profile.trainingDays), ['tue', 'wed', 'fri', 'sun']);
});

test('deshacer_cambio: restaura el plan y el perfil a como estaban antes del último cambio', () => {
  const app = loadApp();
  app.state.profile = baseProfile(app);
  app.state.weekNumber = 1;
  app.state.plan = app.generatePlan(app.state.profile, 1);
  app.state.nextWeekOverrides = {};
  app.state.chat = [];

  const originalTrainingDays = app.state.profile.trainingDays.slice();
  const originalPlanJson = JSON.stringify(app.state.plan);

  app.applyProfileChange({ dias_entreno: ['mon', 'thu'] });
  assert.deepEqual(Array.from(app.state.profile.trainingDays), ['mon', 'thu']);
  assert.notEqual(JSON.stringify(app.state.plan), originalPlanJson);

  const undoResult = app.applyUndoLastChange();

  assert.equal(undoResult, 'Listo, deshice el último cambio.');
  assert.deepEqual(Array.from(app.state.profile.trainingDays), Array.from(originalTrainingDays));
  assert.equal(JSON.stringify(app.state.plan), originalPlanJson);
});

test('deshacer_cambio: solo deshace un paso -- una segunda llamada seguida no hace nada', () => {
  const app = loadApp();
  app.state.profile = baseProfile(app);
  app.state.weekNumber = 1;
  app.state.plan = app.generatePlan(app.state.profile, 1);
  app.state.nextWeekOverrides = {};
  app.state.chat = [];

  app.applyProfileChange({ dias_entreno: ['mon', 'thu'] });
  app.applyUndoLastChange();
  const secondUndo = app.applyUndoLastChange();

  assert.equal(secondUndo, 'No hay ningún cambio reciente para deshacer.');
});

test('deshacer_cambio: sin ningún cambio previo, avisa que no hay nada para deshacer', () => {
  const app = loadApp();
  app.state.profile = baseProfile(app);
  app.state.weekNumber = 1;
  app.state.plan = app.generatePlan(app.state.profile, 1);
  app.state.nextWeekOverrides = {};
  app.state.chat = [];

  const result = app.applyUndoLastChange();
  assert.equal(result, 'No hay ningún cambio reciente para deshacer.');
});

test('deshacer_cambio: el snapshot se persiste como parte de state, sobrevive un cierre/reapertura', () => {
  // Reportado como mejora: antes coachUndoSnapshot vivía en una variable de módulo aparte,
  // solo en memoria -- si el corredor cerraba la app (o se recargaba) entre que el coach
  // aplicaba un cambio y el pedido de deshacerlo, se perdía. Ahora vive en state.coachUndoSnapshot,
  // así que viaja con el resto del estado persistido. Simulamos un "cierre y reapertura" armando
  // una instancia de app COMPLETAMENTE NUEVA y copiándole solo lo que persist() guardaría.
  const app = loadApp();
  app.state.profile = baseProfile(app);
  app.state.weekNumber = 1;
  app.state.plan = app.generatePlan(app.state.profile, 1);
  app.state.nextWeekOverrides = {};
  app.state.chat = [];

  const originalPlanJson = JSON.stringify(app.state.plan);
  app.applyProfileChange({ dias_entreno: ['mon', 'thu'] });
  assert.ok(app.state.coachUndoSnapshot, 'debería haber quedado un snapshot guardado en state');

  // "Reapertura": una instancia de app nueva, con el estado persistido restaurado a mano
  // (como haría loadState() leyendo lo que persist() subió a Supabase).
  const reopened = loadApp();
  reopened.state.profile = JSON.parse(JSON.stringify(app.state.profile));
  reopened.state.plan = JSON.parse(JSON.stringify(app.state.plan));
  reopened.state.nextWeekOverrides = JSON.parse(JSON.stringify(app.state.nextWeekOverrides));
  reopened.state.coachUndoSnapshot = JSON.parse(JSON.stringify(app.state.coachUndoSnapshot));
  reopened.state.chat = [];

  const undoResult = reopened.applyUndoLastChange();

  assert.equal(undoResult, 'Listo, deshice el último cambio.');
  assert.deepEqual(Array.from(reopened.state.profile.trainingDays), ['tue', 'wed', 'fri', 'sun']);
  assert.equal(JSON.stringify(reopened.state.plan), originalPlanJson);
});

test('checkWeekRollover: invalida el snapshot de deshacer -- no puede cruzar un cambio de semana', () => {
  const app = loadApp();
  app.state.profile = baseProfile(app);
  app.state.weekNumber = 1;
  app.state.weekStart = '2020-01-06'; // un lunes bien viejo, para forzar el rollover pase lo que pase hoy
  app.state.plan = app.generatePlan(app.state.profile, 1);
  app.state.nextWeekOverrides = {};
  app.state.chat = [];
  app.state.onboarded = true;
  app.state.runs = [];
  app.state.planHistory = [];

  app.applyProfileChange({ dias_entreno: ['mon', 'thu'] });
  assert.ok(app.state.coachUndoSnapshot, 'debería haber un snapshot antes del rollover');

  app.checkWeekRollover();

  assert.equal(app.state.coachUndoSnapshot, null);
  assert.equal(app.applyUndoLastChange(), 'No hay ningún cambio reciente para deshacer.');
});

test('cancelar_sesion (semana siguiente): getNextWeekPlan muestra el día como descanso normal, no personalizado', () => {
  const app = loadApp();
  app.state.profile = baseProfile(app);
  app.state.weekNumber = 1;
  app.state.plan = app.generatePlan(app.state.profile, 1);
  app.state.nextWeekOverrides = {};
  app.state.chat = [];

  app.applyCancelSession({ semana: 'siguiente', dia: 'wed' });

  const nw = app.getNextWeekPlan();
  const wed = nw.plan.find(d => d.day === 'wed');
  assert.equal(wed.custom, false, 'no debería quedar marcado como personalizado');
  assert.equal(wed.cancelled, true);
  assert.equal(wed.typeKey, 'rest');
  assert.equal(wed.dist, 0);
  const lbl = app.planLabel(wed);
  assert.equal(lbl.type, app.t('type_rest'), 'debería mostrarse exactamente como un descanso normal');
});

test('checkWeekRollover: un día cancelado para la semana que viene se promueve como descanso normal, no personalizado', () => {
  const app = loadApp();
  app.state.profile = baseProfile(app);
  app.state.weekNumber = 1;
  app.state.weekStart = app.getMondayISO(new Date(Date.now() - 7 * 86400000)); // el lunes pasado
  app.state.plan = app.generatePlan(app.state.profile, 1);
  app.state.nextWeekOverrides = {};
  app.state.chat = [];
  app.state.onboarded = true;
  app.state.runs = [];
  app.state.planHistory = [];

  app.applyCancelSession({ semana: 'siguiente', dia: 'wed' });
  app.checkWeekRollover();

  const wed = app.state.plan.find(d => d.day === 'wed');
  assert.equal(wed.custom, false, 'no debería haber quedado marcado como personalizado al promoverse');
  assert.equal(wed.cancelled, true);
  assert.equal(wed.typeKey, 'rest');
  assert.equal(wed.dist, 0);
});
