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

test('applyProfileChange: modificar_perfil rechaza una fecha_carrera ya pasada, no la escribe directo en el perfil', () => {
  // El calendario de Perfil > Metas no deja elegir una fecha de carrera ya pasada
  // (calBoundsFor/calDateAllowed) -- pero modificar_perfil (la herramienta del coach de
  // chat) escribía fecha_carrera directo en state.profile.raceDate sin ninguna validación.
  // El modelo puede alucinar un formato raro, o el corredor puede mencionar una fecha que
  // ya pasó -- sin este chequeo, taperMultiplier/weeksLeft terminaban trabajando con una
  // fecha objetivo inválida o vieja.
  const app = loadApp();
  app.state.profile = baseProfile(app, { raceDate: null });
  app.state.weekNumber = 1;
  app.state.plan = app.generatePlan(app.state.profile, 1);
  app.state.nextWeekOverrides = {};
  app.state.chat = [];

  const pastResult = app.applyProfileChange({ fecha_carrera: '2020-01-01' });
  assert.match(pastResult, /no es válida/i, 'debería rechazar una fecha ya pasada');
  assert.equal(app.state.profile.raceDate, null, 'no debería haber tocado el perfil');

  const garbageResult = app.applyProfileChange({ fecha_carrera: 'el mes que viene' });
  assert.match(garbageResult, /no es válida/i, 'debería rechazar un formato que no sea YYYY-MM-DD');
  assert.equal(app.state.profile.raceDate, null);

  const futureDate = app.addDaysToIsoLocal(app.todayLocalISO(), 60);
  const okResult = app.applyProfileChange({ fecha_carrera: futureDate });
  assert.doesNotMatch(okResult, /no es válida/i, 'una fecha futura válida sí debería aceptarse');
  assert.equal(app.state.profile.raceDate, futureDate);
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

test('ajustar_volumen_semana (semana actual): una sesión de series del algoritmo no queda mostrando "undefined"/NaN al volverse personalizada', () => {
  // applyVolumeAdjust marcaba d.custom=true (para que la próxima regeneración del plan no le
  // pise el ajuste manual) sin resolver antes tipo/descripción -- planLabel(), en la rama
  // custom, lee d.type/d.desc (quedaban undefined) y, si el día tenía d.interval del
  // algoritmo (reps/repMeters de series o cuestas, no workMin/restMin de fartlek), intentaba
  // mostrarlo igual como si fuera fartlek -- saliendo "NaNm". Mismo bug ya arreglado antes
  // en applyPlanChange (modificar_sesion), pero nunca portado acá.
  const app = loadApp();
  app.state.profile = baseProfile(app);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const todayKey = app.DAY_KEYS[todayIdx];
  app.state.plan = app.DAY_KEYS.map((day, i) => ({
    day,
    typeKey: i === todayIdx ? 'intervals' : 'rest',
    dist: i === todayIdx ? 8 : 0,
    zone: i === todayIdx ? 4 : null,
    interval: i === todayIdx ? { reps: 6, repMeters: 400, recoveryMin: 2 } : null,
  }));
  app.state.chat = [];

  const result = app.applyVolumeAdjust({ porcentaje: -15 });

  assert.ok(!/undefined|NaN/.test(result), `la respuesta del coach no debería tener undefined/NaN: ${result}`);
  const d = app.state.plan[todayIdx];
  assert.equal(d.custom, true);
  const lbl = app.planLabel(d);
  assert.ok(!/undefined|NaN/.test(lbl.type + ' ' + lbl.desc), `planLabel no debería mostrar undefined/NaN -- type:"${lbl.type}" desc:"${lbl.desc}"`);
});

test('ajustar_volumen_semana (semana siguiente): una sesión de cuestas del algoritmo no queda mostrando "undefined"/NaN al volverse personalizada', () => {
  // Mismo bug que el test de arriba, pero en la rama "semana que viene": el override
  // guardado en state.nextWeekOverrides nunca traía su propia clave `interval`, así que
  // Object.assign en getNextWeekPlan() dejaba colgado el interval VIEJO del algoritmo
  // (repMeters de cuestas) sobre un día ahora custom -- mismo síntoma "NaNm" que
  // applyPlanChange ya había encontrado y arreglado para su propia rama "siguiente".
  const app = loadApp();
  // Con currentWeeklyKm alto y los 7 días habilitados, la semana 3 del algoritmo mete una
  // sesión de cuestas de verdad (interval en formato reps/repMeters, SIN workMin/restMin) --
  // necesario para que este test ejercite el bug real, no un fartlek (que ya usa
  // workMin/restMin, compatible con lo que planLabel espera de un día custom).
  app.state.profile = baseProfile(app, { currentWeeklyKm: 40, weeklyKm: 40, trainingDays: ['mon','tue','wed','thu','fri','sat','sun'] });
  app.state.weekNumber = 2; // getNextWeekPlan() arma la semana 3 con este perfil
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.plan = app.generatePlan(app.state.profile, 2);
  app.state.nextWeekOverrides = {};
  app.state.chat = [];

  const nwBefore = app.getNextWeekPlan();
  assert.ok(nwBefore.plan.some(d => d.typeKey === 'hills' && d.interval), 'la semana que viene debería incluir una sesión de cuestas para que el test sea válido');

  app.applyVolumeAdjust({ porcentaje: -15, semana: 'siguiente' });

  const nw = app.getNextWeekPlan();
  for(const d of nw.plan){
    if(d.dist>0){
      const lbl = app.planLabel(d);
      assert.ok(!/undefined|NaN/.test(lbl.type + ' ' + lbl.desc), `día ${d.day}: planLabel no debería mostrar undefined/NaN -- type:"${lbl.type}" desc:"${lbl.desc}"`);
    }
  }
});

test('guardar_nota_coach (zona_cuerpo): deshacer_cambio revierte el recorte de intensidad que dispara la molestia', () => {
  // guardar_nota_coach era la única de las herramientas que tocan el plan sin llamar a
  // captureUndoSnapshot() primero -- "me duele la rodilla" (con zona_cuerpo) baja un 15% lo
  // que queda de la semana YA MISMO (lowerRemainingIntensity), pero sin ningún snapshot un
  // "deshacé eso" inmediatamente después contestaba que no había nada para deshacer, dejando
  // ese recorte pegado para siempre.
  const app = loadApp();
  app.state.profile = baseProfile(app);
  const todayIdx = (new Date().getDay() + 6) % 7;
  app.state.plan = app.DAY_KEYS.map((day, i) => ({ day, typeKey: i === todayIdx ? 'easy' : 'rest', dist: i === todayIdx ? 5 : 0 }));
  app.state.coachUndoSnapshot = null;
  app.state.chat = [];

  const distBefore = app.state.plan[todayIdx].dist;
  app.applyCoachNote({ nota: 'me duele la rodilla', zona_cuerpo: 'rodilla' });
  assert.ok(app.state.plan[todayIdx].dist < distBefore, 'la nota con zona_cuerpo debería recortar la intensidad ya mismo');

  const result = app.applyUndoLastChange();

  assert.doesNotMatch(result, /no hay ningún cambio/i, 'debería poder deshacer el recorte que la nota disparó');
  assert.equal(app.state.plan[todayIdx].dist, distBefore, 'deshacer debería restaurar la distancia de antes del recorte');
});

test('ajustar meta semanal "ahora" a mitad de semana: el total real de la semana llega a la meta nueva, no se queda pegado en la vieja', () => {
  // generatePlan no sabe nada de "cuánto ya se corrió esta semana" -- al subir la meta a
  // mitad de semana, el único día que sobrevivía a preserveLivedDays (los ya hechos quedan
  // con su distancia VIEJA) terminaba con la porción que le tocaría en una semana ENTERA con
  // la meta nueva, no con lo que en realidad falta para llegar a ella. El coach igual decía
  // "listo, ajusté el plan para tu nueva meta" -- una promesa falsa.
  const app = loadApp();
  app.state.profile = baseProfile(app, { weeklyKm: 20, currentWeeklyKm: 20, weeklyGoalKm: 20, trainingDays: ['mon','tue','thu','sun'] });
  app.state.weekNumber = 1;
  app.state.weekStart = app.getMondayISO(new Date());
  const plan = app.generatePlan(app.state.profile, 1);
  plan.forEach(d => { if(['mon','tue','thu'].includes(d.day)) d.status = 'done'; });
  app.state.plan = plan;
  app.state.runs = ['mon','tue','thu'].map((day,i) => ({
    id: i+1,
    date: new Date().toISOString(),
    distanceKm: plan.find(d=>d.day===day).dist,
  }));
  const freshFullWeek = app.generatePlan(Object.assign({}, app.state.profile, {weeklyGoalKm: 40}), 1).reduce((s,d)=>s+d.dist, 0);

  app.state.profile.weeklyGoalKm = 40; // el corredor sube la meta a mitad de semana
  app.applyGoalsChangeNow();

  const total = app.state.plan.reduce((s,d)=>s+d.dist, 0);
  assert.ok(Math.abs(total - freshFullWeek) < 0.2, `el total real de la semana (${total}) debería acercarse al objetivo semanal ya acotado por seguridad (${freshFullWeek}), no quedarse cerca de la meta vieja`);
  // Los días ya corridos no deberían tocarse -- solo el/los días que quedan por delante.
  assert.equal(app.state.plan.find(d=>d.day==='mon').dist, plan.find(d=>d.day==='mon').dist);
});
