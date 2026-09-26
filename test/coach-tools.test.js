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

test('mover_sesion: el día movido sobrevive a una regeneración del plan (dias_entreno), y sin mostrar "undefined"/NaN', (t) => {
  // swapPlanDaySessions() intercambia typeKey/dist/interval/etc. entre los dos días, pero si
  // ninguno de los dos ya era custom o cancelled (el caso más común: dos sesiones lisas del
  // algoritmo), quedaban SIN ninguna marca de protección después del swap. preserveLivedDays()
  // -- lo único que evita que una regeneración del plan (guardar el perfil, cambiar de
  // objetivo, o hasta otra herramienta del coach en la MISMA respuesta) le pise el contenido a
  // un día -- solo respeta un día con d.custom o d.cancelled en true. modificar_sesion y
  // cancelar_sesion ya se protegen solos; mover_sesion era la única de las tres que no, así
  // que el movimiento que el corredor acababa de confirmar podía desaparecer en silencio en la
  // próxima regeneración. Además, marcar custom:true sin resolver antes tipo/descripción (y
  // sin limpiar un interval en formato del algoritmo) es el mismo bug ya arreglado en
  // ajustar_volumen_semana -- "NaNm" en una sesión de series/cuestas movida.
  const app = loadApp();
  const todayIdx = (new Date().getDay() + 6) % 7;
  if(todayIdx === 6){
    // Domingo es el último día de la semana (lunes a domingo) -- todo otro día ya "pasó"
    // para isDayLocked, así que mover_sesion no tiene ningún destino válido dentro de la
    // misma semana hoy. No hay forma de armar este escenario un domingo.
    t.skip('mover_sesion no tiene ningún día de destino válido dentro de esta semana cuando hoy es domingo');
    return;
  }
  const origDay = app.DAY_KEYS[todayIdx];
  const destDay = app.DAY_KEYS[todayIdx + 1];
  app.state.profile = baseProfile(app);
  app.state.weekNumber = 1;
  app.state.plan = app.DAY_KEYS.map(day => ({ day, typeKey: 'rest', dist: 0, terrain: null, zone: null }));
  app.state.plan[app.DAY_KEYS.indexOf(origDay)] = {
    day: origDay, typeKey: 'intervals', dist: 8, terrain: 'asfalto', zone: 4,
    interval: { reps: 6, repMeters: 400, recoveryMin: 2 },
  };
  app.state.nextWeekOverrides = {};
  app.state.chat = [];

  const result = app.applyMoveSession({ dia_origen: origDay, dia_destino: destDay });
  assert.match(result, /OK, moví/);

  const movedDay = app.state.plan.find(d => d.day === destDay);
  const lbl = app.planLabel(movedDay);
  assert.ok(!/undefined|NaN/.test(lbl.type + ' ' + lbl.desc), `planLabel del día movido no debería mostrar undefined/NaN -- type:"${lbl.type}" desc:"${lbl.desc}"`);
  assert.ok(movedDay.custom || movedDay.cancelled, 'el día movido debería quedar protegido (custom o cancelled) contra una regeneración del plan');

  // Ahora disparamos una regeneración real del plan (mismo mecanismo que el reportado: otra
  // herramienta del coach, o guardar el Perfil, en cualquier momento posterior) -- dias_entreno
  // SIGUE incluyendo destDay, para aislar específicamente si el swap sobrevive (y no confundir
  // el resultado con "dejó de ser día de entreno") -- y confirmamos que el movimiento sigue en pie.
  app.applyProfileChange({ dias_entreno: [destDay, app.DAY_KEYS[(app.DAY_KEYS.indexOf(destDay)+1)%7]] });
  const stillProtected = app.state.plan.find(d => d.day === destDay);
  const stillLbl = app.planLabel(stillProtected);
  assert.equal(stillLbl.type, lbl.type, 'la sesión movida no debería perderse con una regeneración del plan que la sigue incluyendo como día de entreno');
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

test('checkWeekRollover: no sugiere un objetivo más difícil en la misma ráfaga en que bajó el volumen', () => {
  // Una semana puede cumplirse casi entera (la racha sigue en pie -- buildWeeklyRecapMessage
  // solo mira cuántas sesiones se HICIERON) y aun así tener 2+ calificadas "mal", disparando
  // un recorte de volumen (computeWeekAdjustment). Sin este chequeo, checkGoalUpsell() podía
  // sugerir en la MISMA ráfaga "animate a un objetivo más difícil" justo después de "bajé el
  // volumen porque la costó esta semana" -- dos mensajes que se contradicen entre sí.
  const app = loadApp();
  app.state.profile = baseProfile(app, { goal: 'start' });
  app.state.weekNumber = 1;
  // Exactamente el lunes pasado (diffWeeks=1) -- si no, brokeStreak en buildWeeklyRecapMessage
  // corta la racha por "salto de calendario" antes de que este test llegue a probar nada.
  app.state.weekStart = app.addDaysToIsoLocal(app.getMondayISO(new Date()), -7);
  app.state.plan = app.DAY_KEYS.map(day => ({ day, typeKey: 'easy', dist: 5, status: 'done', rating: 'mal' }));
  app.state.nextWeekOverrides = {};
  app.state.chat = [];
  app.state.onboarded = true;
  app.state.runs = [];
  app.state.planHistory = [];
  app.state.streakWeeks = 3; // esta semana, si se cuenta, sería la 4ta -- justo el umbral de checkGoalUpsell
  app.state.goalUpsellShown = false;

  app.checkWeekRollover();

  const texts = app.state.chat.map(m => m.text).join(' | ');
  assert.match(texts, /coach_week_adjusted_down|bajé|recorté|costó/i, `debería haber bajado el volumen esta semana, chat: ${texts}`);
  assert.doesNotMatch(texts, /objetivo más difícil|preparar una carrera concreta/i, `no debería sugerir un objetivo más difícil en la misma ráfaga que bajó el volumen, chat: ${texts}`);
  assert.equal(app.state.goalUpsellShown, false, 'no debería marcarse como "ya mostrado" -- se pospone, no se pierde');
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

test('buildContext: le dice al modelo, ya resuelto, qué pasó hoy y qué toca mañana -- sin que tenga que cruzarlo contra el plan completo', () => {
  // Reportado por un usuario con una charla real: con el día de hoy y el plan completo de
  // la semana YA en el contexto, el coach (Haiku) igual se confundía cruzando "hoy es
  // viernes" contra la lista larga del plan para deducir qué le tocaba -- llegó a inventar
  // que la sesión de "mañana" era la de 9km que ya se había corrido (mal, con dolor) HOY.
  // Este test verifica que buildContext() le arme esa respuesta ya resuelta, en una frase
  // directa, para que el modelo no tenga que inferirla del resto del bloque.
  const app = loadApp();
  app.state.profile = baseProfile(app);
  app.state.weekNumber = 5;
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.event = null;
  app.state.runs = [];
  app.state.shoes = [];
  app.state.painLog = [];
  const todayIdx = (new Date().getDay() + 6) % 7;
  // trainingDays de baseProfile no incluye lunes -- así que, incluso si hoy es domingo (y
  // "mañana" cae en la semana que viene, ver tomorrowIsNextWeek en buildContext), el lunes
  // recién generado también da descanso, y el test vale sin importar qué día se corra.
  app.state.plan = app.DAY_KEYS.map((day, i) => ({ day, typeKey: 'rest', dist: 0 }));
  app.state.plan[todayIdx] = { day: app.DAY_KEYS[todayIdx], typeKey: 'easy', dist: 9, status: 'done', rating: 'mal' };

  const ctx = app.buildContext();

  assert.match(ctx, /La sesión de HOY es: .*9km.*ya hecho.*calificó: mal/, `debería describir la sesión de hoy ya resuelta, dio: ${ctx.match(/La sesión de HOY es:[^.]*\./)}`);
  assert.match(ctx, /La sesión de MAÑANA es: descanso/, 'debería describir la sesión de mañana ya resuelta');
});

test('modificar_sesion/cancelar_sesion (semana siguiente): rechazan un "dia" que no es un DAY_KEYS real, en vez de usarlo crudo', () => {
  // El input_schema de las herramientas declara dia como enum:DAY_KEYS, pero la API de tool
  // use no lo hace cumplir de verdad -- la rama 'siguiente' de ambas herramientas escribía
  // state.nextWeekOverrides[input.dia] y armaba t('day_'+input.dia) con el valor CRUDO, sin
  // validar. t() devuelve la clave tal cual cuando no hay traducción, y ese texto terminaba
  // sin escapar en un mensaje de chat de rol 'system' (ver el fix en sysMsgWithIcon) --
  // una inyección de HTML real si el modelo mandaba algo inesperado ahí.
  const app = loadApp();
  app.state.profile = baseProfile(app);
  app.state.nextWeekOverrides = {};
  app.state.chat = [];

  const badDia = '<img src=x onerror=alert(1)>';
  const r1 = app.applyPlanChange({ semana: 'siguiente', dia: badDia, tipo: 'Rodaje', tipo_categoria: 'easy', descripcion: 'x', distancia_km: 5 });
  assert.equal(r1, 'Día no encontrado.');
  assert.equal(Object.keys(app.state.nextWeekOverrides).length, 0, 'no debería haber escrito nada en nextWeekOverrides con un día inválido');

  const r2 = app.applyCancelSession({ semana: 'siguiente', dia: badDia });
  assert.equal(r2, 'Día no encontrado.');
  assert.equal(Object.keys(app.state.nextWeekOverrides).length, 0);

  assert.equal(app.state.chat.length, 0, 'no debería haber mandado ningún mensaje de chat con el día inválido adentro');
});

test('sysMsgWithIcon: escapa el texto -- defensa en profundidad, ya que renderChat() inserta los mensajes de sistema con innerHTML', () => {
  const app = loadApp();
  const result = app.sysMsgWithIcon('<svg></svg>', '<img src=x onerror=alert(1)>');
  assert.doesNotMatch(result, /<img/, `el texto debería quedar escapado, dio: ${result}`);
  assert.match(result, /&lt;img/, 'debería aparecer como entidad HTML, no como tag real');
});
