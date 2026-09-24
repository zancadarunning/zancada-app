// test/plan-engine.test.js
//
// Pruebas del motor de generación de planes: generatePlan y las piezas de las
// que depende (distributeSessionTypes, buildIntervalStructure/buildHillStructure,
// las semanas de recuperación/taper, el día de carrera, planLabel/planAmountText).
//
// Cada test carga una instancia nueva de la app (loadApp()) en vez de compartir
// una sola entre todos los tests -- generatePlan lee bastante de `state`
// (state.profile, state.event, state.runs, etc.) y ese aislamiento evita que el
// orden en que corren los tests afecte el resultado.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

function baseProfile(overrides) {
  return Object.assign({
    weeklyKm: 30,
    // Un corredor "active" de verdad SIEMPRE tiene currentWeeklyKm seteado -- calcWeeklyKm()
    // deriva weeklyKm A PARTIR de este campo para ese runnerType, nunca al revés (ver
    // isBeginnerProfile() en app.js). Sin este campo, este fixture representaba un perfil
    // que no podría existir en la app real (activo con volumen actual desconocido), y por
    // eso isBeginnerProfile() lo trataba como principiante -- lo cual es justo lo correcto
    // para ese caso real (alguien que dice "ya corro" pero declaró 0km/semana actuales),
    // pero no para este fixture, pensado como corredor activo genuino.
    currentWeeklyKm: 30,
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
  }, overrides || {});
}

test('generatePlan: descansa en los días fuera de trainingDays y entrena en los que sí', () => {
  const app = loadApp();
  const profile = baseProfile();
  app.state.profile = profile;
  app.state.event = null;
  app.state.lastEventDate = null;
  const plan = app.generatePlan(profile, 1, '2026-09-07');
  assert.equal(plan.length, 7);
  assert.deepEqual(plan.map(d => d.day), app.DAY_KEYS);
  const trainingSet = new Set(profile.trainingDays);
  plan.forEach(d => {
    if (!trainingSet.has(d.day)) {
      assert.equal(d.typeKey, 'rest');
      assert.equal(d.dist, 0);
    } else {
      assert.ok(d.dist > 0, `${d.day} debería tener distancia asignada`);
    }
  });
});

test('generatePlan: el día "largo" que eligió distributeSessionTypes siempre sale como long', () => {
  const app = loadApp();
  const profile = baseProfile();
  app.state.profile = profile;
  app.state.event = null;
  const weekStartDate = '2026-09-07';
  const plan = app.generatePlan(profile, 1, weekStartDate);
  const caution = app.trainingCaution(profile);
  const sessions = app.distributeSessionTypes(profile.trainingDays, false, 1, caution, app.isCutbackWeek(1), profile.goal);
  const longDay = Object.keys(sessions).find(d => sessions[d] === 'long');
  const planDay = plan.find(d => d.day === longDay);
  assert.equal(planDay.typeKey, 'long');
});

test('distributeSessionTypes: ningún día fuerte queda pegado a la tirada larga cuando hay alternativa', () => {
  // pickSpacedDays separaba los días fuertes ENTRE SÍ, pero no sabía nada del día de la
  // tirada larga -- en un plan de 5-6 días (ej. lun/mié/vie/sáb/dom) podía elegir sábado
  // como día fuerte, justo pegado al domingo largo, exactamente lo que cualquier criterio
  // real de entrenamiento evita (llegar a la sesión más grande de la semana con las
  // piernas cargadas de un esfuerzo fuerte del día anterior).
  const app = loadApp();
  const caution = { level: 0 };
  const idx = d => app.DAY_KEYS.indexOf(d);
  const sessions = app.distributeSessionTypes(['mon', 'wed', 'fri', 'sat', 'sun'], false, 1, caution, false, '10k');
  assert.equal(sessions.sun, 'long');
  const longIdx = idx('sun');
  const hardDays = Object.keys(sessions).filter(d => sessions[d] !== 'long' && sessions[d] !== 'easy' && sessions[d] !== 'rest');
  assert.ok(hardDays.length >= 1, 'debería haber al menos un día fuerte para poder chequear');
  hardDays.forEach(d => {
    assert.ok(Math.abs(idx(d) - longIdx) >= 2, `${d} (día fuerte) no debería quedar pegado a la tirada larga del domingo`);
  });
});

test('distributeSessionTypes: con solo 2 días de entreno (el fuerte pegado al largo es inevitable) no rompe', () => {
  // Caso "fin de semana": sábado + domingo. No hay otro día donde poner el esfuerzo
  // fuerte -- acá SÍ queda pegado al día largo, porque no hay ninguna alternativa real,
  // no porque el algoritmo no lo haya intentado evitar.
  const app = loadApp();
  const sessions = app.distributeSessionTypes(['sat', 'sun'], false, 1, { level: 0 }, false, '10k');
  assert.equal(sessions.sun, 'long');
  assert.notEqual(sessions.sat, 'easy');
});

test('generatePlan: coincide día a día con distributeSessionTypes en una semana normal', () => {
  const app = loadApp();
  const profile = baseProfile();
  app.state.profile = profile;
  app.state.event = null;
  app.state.lastEventDate = null;
  const weekNumber = 3;
  const weekStartDate = '2026-09-21'; // sin evento cargado, sin recuperación
  const plan = app.generatePlan(profile, weekNumber, weekStartDate);
  const caution = app.trainingCaution(profile);
  const sessions = app.distributeSessionTypes(profile.trainingDays, false, weekNumber, caution, app.isCutbackWeek(weekNumber), profile.goal);
  plan.forEach(d => {
    const expected = sessions[d.day] || 'rest';
    assert.equal(d.typeKey, expected, `día ${d.day}`);
  });
});

test('generatePlan: principiante entrena easy todos los días salvo el largo', () => {
  const app = loadApp();
  const profile = baseProfile({ weeklyKm: 0, goal: 'start', runnerType: 'new', trainingDays: ['tue', 'thu', 'sun'] });
  app.state.profile = profile;
  const plan = app.generatePlan(profile, 1, '2026-09-07');
  const byDay = Object.fromEntries(plan.map(d => [d.day, d]));
  assert.equal(byDay.sun.typeKey, 'long'); // domingo es el preferido para el día largo
  assert.equal(byDay.tue.typeKey, 'easy');
  assert.equal(byDay.thu.typeKey, 'easy');
  ['mon', 'wed', 'fri', 'sat'].forEach(d => assert.equal(byDay[d].typeKey, 'rest'));
});

test('generatePlan: "ya corro" con 0km/semana actuales se trata como principiante, no como corredor activo', () => {
  // Reportado por un usuario: cuenta nueva, eligió "Ya corro" en el onboarding pero declaró
  // 0km/semana actuales -- el plan de semana 1 le salió con series y ~19km totales, el mismo
  // arranque agresivo que a cualquier corredor activo real, en vez del ramp-up seguro que sí
  // recibía alguien que elegía "Soy nuevo/a". El criterio real tiene que ser la carga actual
  // (currentWeeklyKm), no la autopercepción (runnerType) -- ver isBeginnerProfile() en app.js.
  const app = loadApp();
  const profile = baseProfile({ runnerType: 'active', currentWeeklyKm: 0, weeklyKm: app.calcWeeklyKm({ runnerType: 'active', currentWeeklyKm: 0, goal: '10k' }), goal: '10k', trainingDays: ['tue', 'thu', 'sun'] });
  app.state.profile = profile;
  const plan = app.generatePlan(profile, 1, '2026-09-07');
  const heavyTypes = ['intervals', 'tempo', 'fartlek', 'hills', 'progression'];
  plan.forEach(d => {
    assert.ok(!heavyTypes.includes(d.typeKey), `${d.day} no debería ser ${d.typeKey} para alguien con 0km/semana actuales`);
    assert.ok(d.beginner, `${d.day} debería quedar marcado como principiante`);
  });
  const total = plan.reduce((s, d) => s + (d.dist || 0), 0);
  assert.ok(total < 10, `el total semanal (${total}km) debería quedar bajo, no saltar directo al volumen del objetivo`);
});

test('calcWeeklyKm: para un principiante coincide con lo que generatePlan arma de verdad', () => {
  // Reportado por un usuario: el saludo del coach ("armé tu plan pensando en tus X km
  // semanales") usa profile.weeklyKm -- pero para un principiante ese número salía de
  // GOAL_PEAK_KM/1.8 (una proyección del kilometraje PICO del objetivo), mientras que
  // generatePlan() arma las sesiones de un principiante con una fórmula totalmente distinta
  // (per=2.5*ratio). El corredor recibía un número en el saludo que no tenía ninguna relación
  // con el plan real que acababa de recibir.
  const app = loadApp();
  const profile = baseProfile({ runnerType: 'new', currentWeeklyKm: 0, goal: '10k', trainingDays: ['tue', 'thu', 'sun'] });
  profile.weeklyKm = app.calcWeeklyKm(profile);
  app.state.profile = profile;
  const plan = app.generatePlan(profile, 1, '2026-09-07');
  const total = plan.reduce((s, d) => s + (d.dist || 0), 0);
  assert.equal(profile.weeklyKm, total, 'el weeklyKm calculado debería coincidir con lo que el plan real suma');

  // Un corredor activo real (currentWeeklyKm>0) no debe cambiar -- sigue basado en su volumen
  // declarado, no en la fórmula de principiante.
  const active = baseProfile({ runnerType: 'active', currentWeeklyKm: 30 });
  assert.equal(app.calcWeeklyKm(active), 30);
});

test('hasCrossTrainingBase/generatePlan: alguien que ya hace otro deporte no arranca como si fuera sedentario', () => {
  // Pedido por un usuario: alguien que nunca corrió pero juega al fútbol 3 veces por semana
  // ya tiene una base de entrenamiento real -- no debería arrancar exactamente igual que
  // alguien 100% sedentario. 2+ días por semana de otro deporte es el piso para contar como
  // "base real" (1 día suelto no alcanza). El volumen inicial sube, pero profile.weeklyKm
  // sigue coincidiendo con lo que el plan real suma (misma garantía que el test de arriba).
  const app = loadApp();
  const withoutSport = baseProfile({ runnerType: 'new', currentWeeklyKm: 0, goal: '10k', trainingDays: ['tue', 'thu', 'sun'], crossTrainingSports: [], crossTrainingDays: [] });
  const withSport = baseProfile({ runnerType: 'new', currentWeeklyKm: 0, goal: '10k', trainingDays: ['tue', 'thu', 'sun'], crossTrainingSports: ['futbol'], crossTrainingDays: ['mon', 'wed', 'fri'] });
  const onlyOneDay = baseProfile({ runnerType: 'new', currentWeeklyKm: 0, goal: '10k', trainingDays: ['tue', 'thu', 'sun'], crossTrainingSports: ['gimnasio'], crossTrainingDays: ['mon'] });

  assert.ok(!app.hasCrossTrainingBase(withoutSport));
  assert.ok(app.hasCrossTrainingBase(withSport));
  assert.ok(!app.hasCrossTrainingBase(onlyOneDay), 'un solo día suelto no debería contar como base real');

  [withoutSport, withSport, onlyOneDay].forEach(profile => {
    profile.weeklyKm = app.calcWeeklyKm(profile);
    app.state.profile = profile;
    const plan = app.generatePlan(profile, 1, '2026-09-07');
    const total = plan.reduce((s, d) => s + (d.dist || 0), 0);
    assert.equal(profile.weeklyKm, total, 'weeklyKm siempre debería coincidir con el plan real, con o sin base cruzada');
  });

  assert.ok(withSport.weeklyKm > withoutSport.weeklyKm, 'con una base real de otro deporte, el arranque debería ser más alto que el de alguien sedentario');
  assert.equal(onlyOneDay.weeklyKm, withoutSport.weeklyKm, 'un solo día de otro deporte no debería cambiar nada');
});

test('checkBeginnerGraduation: gradúa más rápido a quien ya tenía una base real de otro deporte', () => {
  const app = loadApp();
  const today = new Date('2026-10-05T12:00:00');
  const createdAt = app.addDaysToIsoLocal(app.getMondayISO(today), -21); // hace 3 semanas -- menos que las 4 normales
  const profile = baseProfile({ runnerType: 'new', currentWeeklyKm: 0, goal: '10k', trainingDays: ['tue', 'thu', 'sun'], createdAt, crossTrainingSports: ['futbol'], crossTrainingDays: ['mon', 'wed', 'fri'] });
  profile.weeklyKm = app.calcWeeklyKm(profile);
  app.state.profile = profile;
  app.state.onboarded = true;
  app.state.weekStart = app.getMondayISO(today);
  app.state.plan = app.generatePlan(profile, 3);
  app.state.chat = [];
  app.state.runs = [];
  // Solo 2 semanas reales corridas -- no alcanzarían para el piso normal de 4, pero sí para
  // el piso reducido (2) de quien ya tiene una base de otro deporte.
  for(let w = 1; w <= 2; w++){
    const weekMonday = app.addDaysToIsoLocal(app.state.weekStart, -7 * w);
    app.state.runs.push({ date: app.addDaysToIsoLocal(weekMonday, 1), distanceKm: 5, durationSec: 30 * 60 });
    app.state.runs.push({ date: app.addDaysToIsoLocal(weekMonday, 3), distanceKm: 5, durationSec: 30 * 60 });
  }

  app.checkBeginnerGraduation();

  assert.equal(app.state.profile.runnerType, 'active', 'debería graduar con solo 2 semanas gracias a la base cruzada');
});

test('hasRunningImpactBase/generatePlan: deporte de impacto (fútbol) saca de zona 1 desde el día 1, uno sin impacto (natación) no', () => {
  // Pedido explícito: alguien que ya juega al fútbol tolera el impacto de correr aunque
  // nunca haya salido a correr solo -- no tiene sentido tratarlo con el mismo criterio
  // ultraconservador (zona 1 fija, sin ninguna variedad) que a alguien 100% sedentario o que
  // solo nada/anda en bici (base aeróbica real, pero sin ESE impacto específico).
  const app = loadApp();
  const withImpact = baseProfile({ runnerType: 'new', currentWeeklyKm: 0, goal: '10k', trainingDays: ['tue', 'thu', 'sun'], crossTrainingSports: ['futbol'], crossTrainingDays: ['mon', 'wed', 'fri'] });
  const withoutImpact = baseProfile({ runnerType: 'new', currentWeeklyKm: 0, goal: '10k', trainingDays: ['tue', 'thu', 'sun'], crossTrainingSports: ['natacion'], crossTrainingDays: ['mon', 'wed', 'fri'] });

  assert.ok(app.hasRunningImpactBase(withImpact));
  assert.ok(!app.hasRunningImpactBase(withoutImpact), 'nadar da base aeróbica pero no tolerancia al impacto de correr');

  const planWithImpact = app.generatePlan(withImpact, 1, '2026-09-07');
  const planWithoutImpact = app.generatePlan(withoutImpact, 1, '2026-09-07');
  const easyDayWithImpact = planWithImpact.find(d => d.typeKey === 'easy');
  const easyDayWithoutImpact = planWithoutImpact.find(d => d.typeKey === 'easy');
  assert.equal(easyDayWithImpact.zone, 2, 'con base de impacto, el rodaje suave ya es zona 2 desde el día 1');
  assert.equal(easyDayWithoutImpact.zone, 1, 'sin base de impacto, sigue siendo zona 1 aunque tenga base aeróbica de otro deporte');

  // En una semana par le toca el único estímulo de calidad habilitado para este grupo
  // (fartlek, no series ni ritmo medio -- todavía no tiene técnica/eficiencia de carrera).
  const planWeek2 = app.generatePlan(withImpact, 2, '2026-09-07');
  const hardDay = planWeek2.find(d => d.typeKey !== 'easy' && d.typeKey !== 'long' && d.typeKey !== 'rest');
  assert.ok(hardDay, 'en semana par debería haber un día de calidad habilitado');
  assert.equal(hardDay.typeKey, 'fartlek', 'el único estímulo de calidad para un principiante con base de impacto es fartlek');
  assert.ok(hardDay.interval, 'el fartlek debe tener estructura armada, no quedar genérico');
});

test('checkBeginnerGraduation: sale de modo principiante solo tras semanas reales de entrenamiento consistente', () => {
  // Antes isBeginnerProfile() nunca dejaba de ser true por sí sola -- alguien que arrancó
  // principiante se quedaba en zona 1 y sin fartlek para siempre, aunque entrenara consistente
  // semana tras semana, salvo que alguien entrara a Perfil a cambiar el dato a mano. Esta
  // función SÍ debe graduarlo solo, basado en el promedio real corrido (no en que haya pasado
  // el tiempo del calendario), y dejar currentWeeklyKm en ese promedio real -- no en una
  // fórmula genérica del objetivo, para no reintroducir el mismo salto brusco que se corrigió
  // en el test de arriba.
  const app = loadApp();
  const today = new Date('2026-10-05T12:00:00'); // lunes
  const createdAt = app.addDaysToIsoLocal(app.getMondayISO(today), -35);
  const profile = baseProfile({ runnerType: 'new', currentWeeklyKm: 0, goal: '10k', trainingDays: ['tue', 'thu', 'sun'], createdAt });
  profile.weeklyKm = app.calcWeeklyKm(profile);
  app.state.profile = profile;
  app.state.onboarded = true;
  app.state.weekStart = app.getMondayISO(today);
  app.state.plan = app.generatePlan(profile, 5);
  app.state.chat = [];
  app.state.runs = [];
  for(let w = 1; w <= 4; w++){
    const weekMonday = app.addDaysToIsoLocal(app.state.weekStart, -7 * w);
    app.state.runs.push({ date: app.addDaysToIsoLocal(weekMonday, 1), distanceKm: 5, durationSec: 30 * 60 });
    app.state.runs.push({ date: app.addDaysToIsoLocal(weekMonday, 3), distanceKm: 5, durationSec: 30 * 60 });
  }
  assert.ok(app.isBeginnerProfile(profile), 'debería seguir siendo principiante antes de graduar');

  app.checkBeginnerGraduation();

  assert.equal(app.state.profile.runnerType, 'active');
  assert.equal(app.state.profile.currentWeeklyKm, 10); // promedio real de las 4 semanas simuladas
  assert.ok(!app.isBeginnerProfile(app.state.profile), 'debería dejar de ser principiante tras graduar');
  assert.ok(app.state.chat.some(m => m.text.includes(app.t('coach_beginner_graduated'))), 'debería avisarle al corredor por el chat');
  app.state.plan.forEach(d => {
    if(d.typeKey === 'easy' || d.typeKey === 'long') assert.equal(d.zone, 2, `${d.day} debería pasar a zona 2`);
  });
});

test('checkBeginnerGraduation: no gradúa si el promedio real todavía está por debajo del piso', () => {
  const app = loadApp();
  const today = new Date('2026-10-05T12:00:00');
  const createdAt = app.addDaysToIsoLocal(app.getMondayISO(today), -35);
  const profile = baseProfile({ runnerType: 'new', currentWeeklyKm: 0, goal: '10k', trainingDays: ['tue', 'thu', 'sun'], createdAt });
  profile.weeklyKm = app.calcWeeklyKm(profile);
  app.state.profile = profile;
  app.state.onboarded = true;
  app.state.weekStart = app.getMondayISO(today);
  app.state.plan = app.generatePlan(profile, 5);
  app.state.chat = [];
  // Corrió poco y salteado -- promedio bajo, no debería graduarlo todavía.
  app.state.runs = [{ date: app.addDaysToIsoLocal(app.state.weekStart, -7), distanceKm: 2, durationSec: 15 * 60 }];

  app.checkBeginnerGraduation();

  assert.equal(app.state.profile.runnerType, 'new');
  assert.equal(app.state.chat.length, 0, 'no debería mandar el mensaje de graduación todavía');
});

test('applyCoachNote: una lesión reportada por chat (zona_cuerpo) sube la cautela del plan, no solo queda como nota', () => {
  // Antes, una lesión mencionada por chat quedaba SOLO en coachNotes -- un dato que el coach
  // de IA podía recordar y mencionar, pero invisible para trainingCaution/generatePlan (que sí
  // reaccionan a una molestia cargada a mano en Perfil > Molestias). Alguien que le contaba al
  // chat "me duele la rodilla" en vez de cargarlo en Perfil no conseguía que el plan se pusiera
  // más conservador. zona_cuerpo hace que la nota entre al mismo state.painLog que usa Perfil,
  // reusando la misma lógica de vencimiento/resolución en vez de agregar un flag nuevo pegado
  // para siempre.
  const app = loadApp();
  const hrMax = 190;
  const profile = baseProfile({ birth: '1995-01-01', weight: 70, height: 175, hrMax, hrZones: app.computeZones(hrMax), name: 'Ana' });
  app.state.profile = profile;
  app.state.onboarded = true;
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.plan = app.generatePlan(profile, 1);
  app.state.painLog = [];
  app.state.runs = [];
  app.state.event = null;
  app.state.chat = [];
  app.state.shoes = [];
  assert.equal(app.trainingCaution(profile).level, 0, 'sin nada reportado, cautela en 0');
  const totalBefore = app.state.plan.reduce((a, d) => a + (d.dist || 0), 0);

  const result = app.applyCoachNote({ nota: 'le duele la rodilla derecha hace unos días', zona_cuerpo: 'rodilla' });

  assert.match(result, /15%/, 'debería avisar que bajó la intensidad, no solo que guardó la nota');
  assert.equal(app.state.painLog.length, 1);
  assert.equal(app.state.painLog[0].bodyPart, 'rodilla');
  assert.equal(app.state.painLog[0].active, true);
  assert.equal(app.trainingCaution(app.state.profile).level, 1, 'la molestia reportada por chat debería subir la cautela, igual que si se hubiera cargado desde Perfil');
  // Ese aumento de cautela recién se nota en la PRÓXIMA regeneración del plan -- para lo que
  // queda de ESTA semana, el recorte inmediato tiene que venir de lowerRemainingIntensity
  // (mismo mecanismo que usa savePainLog() desde Perfil), no de esperar a la semana que viene.
  const totalAfter = app.state.plan.reduce((a, d) => a + (d.dist || 0), 0);
  assert.ok(totalAfter < totalBefore, 'el resto de esta semana debería bajar de volumen ya mismo, no recién la semana que viene');
});

test('applyCoachNote: una nota sin zona_cuerpo (preferencia, horario, etc.) no toca la cautela', () => {
  const app = loadApp();
  const profile = baseProfile({});
  app.state.profile = profile;
  app.state.painLog = [];

  const result = app.applyCoachNote({ nota: 'prefiere entrenar de noche' });

  assert.equal(result, 'Nota guardada.');
  assert.equal(app.state.painLog.length, 0, 'sin zona_cuerpo no debería crear ninguna molestia');
  assert.equal(app.state.profile.coachNotes[0], 'prefiere entrenar de noche');
});

test('lowerRemainingIntensity: el recorte se nota incluso en sesiones chicas de principiante', () => {
  // Math.round() al km entero se comía el recorte entero en sesiones chicas: una sesión de
  // 2km con -15% da 1.7km, que Math.round (sin decimales) redondeaba de vuelta a 2km --
  // exactamente el mismo número de antes. Alguien le pedía al coach (o al formulario de
  // Perfil) que bajara la intensidad por una molestia y el plan quedaba IDÉNTICO, sin
  // ningún aviso de que el recorte no hizo nada. Afecta sobre todo a principiantes, cuyas
  // sesiones ya son chicas de por sí (2-5km).
  const app = loadApp();
  app.state.plan = [
    { day: 'mon', dist: 0, typeKey: 'rest' },
    { day: 'tue', dist: 2, typeKey: 'easy' },
    { day: 'wed', dist: 0, typeKey: 'rest' },
    { day: 'thu', dist: 0, typeKey: 'rest' },
    { day: 'fri', dist: 0, typeKey: 'rest' },
    { day: 'sat', dist: 0, typeKey: 'rest' },
    { day: 'sun', dist: 3, typeKey: 'long' },
  ];

  app.lowerRemainingIntensity(-15);

  const tue = app.state.plan.find(d => d.day === 'tue');
  const sun = app.state.plan.find(d => d.day === 'sun');
  assert.ok(tue.dist < 2, `2km con -15% debería bajar, quedó en ${tue.dist}`);
  assert.ok(sun.dist < 3, `3km con -15% debería bajar, quedó en ${sun.dist}`);
});

test('relinkTodayRun: "Deshacer" sobre una carrera vinculada se mantiene al reabrir la app el mismo día', () => {
  // relinkTodayRun() busca, en cada apertura de la app, si hay una carrera de HOY sin
  // vincular al día del plan -- pensado para agarrar una carrera recién sincronizada del
  // reloj mientras la app estaba cerrada. Pero "Deshacer" (markSession(i,null)) solo saca el
  // LINK, no borra la carrera de state.runs -- sin recordar qué carrera se desvinculó a
  // propósito, la próxima apertura de la app (el mismo día) volvía a encontrar esa misma
  // carrera y la revinculaba sola, deshaciendo en silencio el "Deshacer" del corredor.
  const app = loadApp();
  const todayIdx = (new Date().getDay() + 6) % 7;
  const runId = 999;
  app.state.runs = [{ id: runId, distanceKm: 5, durationSec: 1800, date: new Date().toISOString() }];
  app.state.plan = app.DAY_KEYS.map((day, i) => ({ day, typeKey: i === todayIdx ? 'easy' : 'rest', dist: i === todayIdx ? 5 : 0 }));
  app.state.plan[todayIdx].status = 'done';
  app.state.plan[todayIdx].linkedRunId = runId;

  app.markSession(todayIdx, null);
  assert.equal(app.state.plan[todayIdx].status, null, 'debería quedar sin estado tras deshacer');
  assert.equal(app.state.plan[todayIdx].linkedRunId, null, 'debería quedar sin carrera vinculada tras deshacer');

  const relinked = app.relinkTodayRun(); // simula reabrir la app el mismo día

  assert.equal(relinked, false, 'no debería revincular la misma carrera que se desvinculó a propósito');
  assert.equal(app.state.plan[todayIdx].status, null, 'el deshacer debería seguir en pie tras reabrir la app');
  assert.equal(app.state.plan[todayIdx].linkedRunId, null);
});

test('buildSessionFeedbackMessage: compara lo planeado contra lo real y varía según la calificación', () => {
  // Antes calificar "bien" o "excelente" no generaba NINGÚN mensaje del coach -- solo "mal"
  // mandaba una línea genérica, sin ningún número real de la sesión. Ahora las tres
  // calificaciones dan una devolución con los datos reales (distancia, ritmo) comparados
  // contra lo planeado.
  const app = loadApp();
  const plannedDay = { typeKey: 'easy', dist: 5 };
  const run = { distanceKm: 5.2, durationSec: 30 * 60 }; // 5.2km en 30min -> ~5:46/km

  const msgBien = app.buildSessionFeedbackMessage(plannedDay, run, 'bien');
  assert.match(msgBien, /5[.,]2/, 'debería incluir la distancia real corrida');
  assert.match(msgBien, /5[.,]0? ?km/i, 'debería incluir la distancia planeada');

  const msgExcelente = app.buildSessionFeedbackMessage(plannedDay, run, 'excelente');
  assert.notEqual(msgExcelente, msgBien, 'excelente y bien deberían dar mensajes distintos');

  const msgMal = app.buildSessionFeedbackMessage(plannedDay, run, 'mal');
  assert.notEqual(msgMal, msgBien);
});

test('buildSessionFeedbackMessage: sin sesión planeada (día extra) usa la variante distinta', () => {
  const app = loadApp();
  const restDay = { typeKey: 'rest', dist: 0 };
  const run = { distanceKm: 4, durationSec: 24 * 60 };

  const msg = app.buildSessionFeedbackMessage(restDay, run, 'excelente');

  assert.doesNotMatch(msg, /tenías \d/i, 'sin sesión planeada no debería mencionar una distancia planeada que no existía');
  assert.match(msg, /4[.,]00/, 'debería igual mencionar lo que corrió de verdad');
});

test('buildSessionFeedbackMessage: sin carrera vinculada no manda ningún mensaje', () => {
  const app = loadApp();
  assert.equal(app.buildSessionFeedbackMessage({ typeKey: 'easy', dist: 5 }, null, 'bien'), null);
  assert.equal(app.buildSessionFeedbackMessage({ typeKey: 'easy', dist: 5 }, { distanceKm: 0, durationSec: 0 }, 'bien'), null);
});

test('submitRating: manda la devolución al chat con la carrera vinculada del día', async () => {
  const app = loadApp();
  const profile = baseProfile({ birth: '1995-01-01', weight: 70, height: 175 });
  app.state.profile = profile;
  app.state.onboarded = true;
  app.state.chat = [];
  const runId = 12345;
  app.state.runs = [{ id: runId, distanceKm: 5.2, durationSec: 30 * 60, date: new Date().toISOString() }];
  app.state.plan = [{ day: 'mon', typeKey: 'easy', dist: 5, zone: 2, status: 'done', linkedRunId: runId }];
  // ratingTargetIdx es una variable interna de app.js (no expuesta al sandbox de tests) --
  // se setea sola llamando a checkPendingRating(), el disparador real de este flujo, en vez
  // de intentar tocarla desde afuera.
  app.checkPendingRating();

  await app.submitRating('bien');

  assert.equal(app.state.plan[0].rating, 'bien');
  const lastMsg = app.state.chat[app.state.chat.length - 1];
  assert.equal(lastMsg.role, 'coach');
  assert.match(lastMsg.text, /5[.,]2/, 'la devolución en el chat debería tener la distancia real');
});

test('checkReturningBreakGraduation: saca el descuento del 60% cuando el promedio real ya alcanzó lo de antes', () => {
  // returningFromBreak bajaba el punto de partida (calcWeeklyKm) a un 60% de lo declarado, y
  // subía la cautela -- pero antes de este fix se quedaba así PARA SIEMPRE, sin ninguna forma
  // de sacarlo (ni el campo estaba en Perfil para editarlo). Alguien que volvió de una pausa
  // declarando 40km/semana y ya está entrenando consistente otra vez debería recuperar su
  // volumen real, no seguir descontado un 40% para siempre.
  const app = loadApp();
  const today = new Date('2026-10-05T12:00:00'); // lunes
  const createdAt = app.addDaysToIsoLocal(app.getMondayISO(today), -35);
  const profile = baseProfile({ runnerType: 'active', currentWeeklyKm: 40, returningFromBreak: true, createdAt, birth: '1995-01-01' });
  profile.weeklyKm = app.calcWeeklyKm(profile);
  assert.equal(profile.weeklyKm, 24, 'arranca en el 60% de lo declarado por la pausa');
  app.state.profile = profile;
  app.state.onboarded = true;
  app.state.weekStart = app.getMondayISO(today);
  app.state.plan = app.generatePlan(profile, 5);
  app.state.chat = [];
  app.state.runs = [];
  // 4 semanas reales promediando 35km/semana -- por encima del piso del 80% de 40 (32km).
  for(let w = 1; w <= 4; w++){
    const weekMonday = app.addDaysToIsoLocal(app.state.weekStart, -7 * w);
    app.state.runs.push({ date: app.addDaysToIsoLocal(weekMonday, 1), distanceKm: 18, durationSec: 90 * 60 });
    app.state.runs.push({ date: app.addDaysToIsoLocal(weekMonday, 4), distanceKm: 17, durationSec: 85 * 60 });
  }
  assert.equal(app.trainingCaution(profile).level, 1, 'returningFromBreak todavía suma cautela antes de graduar');

  app.checkReturningBreakGraduation();

  assert.equal(app.state.profile.returningFromBreak, false, 'debería sacar el flag de pausa');
  assert.equal(app.state.profile.currentWeeklyKm, 35, 'currentWeeklyKm pasa al promedio real, no queda pegado en lo declarado antes de la pausa');
  assert.equal(app.state.profile.weeklyKm, 35, 'sin el *0.6, el volumen ya no está descontado');
  assert.equal(app.trainingCaution(app.state.profile).level, 0, 'sin el flag, esa cautela extra ya no aplica');
  assert.ok(app.state.chat.some(m => m.text.includes(app.t('coach_returning_break_graduated'))), 'debería avisarle al corredor por el chat');
});

test('checkReturningBreakGraduation: no gradúa si el promedio real todavía está por debajo de lo declarado antes de la pausa', () => {
  const app = loadApp();
  const today = new Date('2026-10-05T12:00:00');
  const createdAt = app.addDaysToIsoLocal(app.getMondayISO(today), -35);
  const profile = baseProfile({ runnerType: 'active', currentWeeklyKm: 40, returningFromBreak: true, createdAt });
  profile.weeklyKm = app.calcWeeklyKm(profile);
  app.state.profile = profile;
  app.state.onboarded = true;
  app.state.weekStart = app.getMondayISO(today);
  app.state.plan = app.generatePlan(profile, 5);
  app.state.chat = [];
  // Volviendo de a poco, todavía lejos del 80% de 40 (32km) -- no debería graduarlo todavía.
  app.state.runs = [{ date: app.addDaysToIsoLocal(app.state.weekStart, -7), distanceKm: 10, durationSec: 60 * 60 }];

  app.checkReturningBreakGraduation();

  assert.equal(app.state.profile.returningFromBreak, true, 'no debería sacar el flag todavía');
  assert.equal(app.state.chat.length, 0, 'no debería mandar el mensaje de graduación todavía');
});

test('ageFromBirth/trainingCaution: sin fecha de nacimiento no inventa una edad de ~56 años', () => {
  // Cuentas de antes de que fecha de nacimiento fuera obligatoria en el onboarding pueden
  // tener birth=null -- new Date(null) cae en el epoch (1970), así que ageFromBirth(null) le
  // daba a esa persona una edad real de ~56 años en 2026, sin ningún aviso, sea cual sea su
  // edad de verdad. Eso subía trainingCaution a nivel 1 igual que a alguien de 45+ de verdad.
  const app = loadApp();
  assert.equal(app.ageFromBirth(null), null, 'sin fecha, la edad tiene que ser "no sabemos", no un número inventado');
  assert.equal(app.ageFromBirth(undefined), null);
  assert.equal(app.ageFromBirth(''), null);

  const profile = baseProfile({ birth: null, weight: null, height: null });
  assert.equal(app.trainingCaution(profile).level, 0, 'sin edad conocida no debería sumar cautela por edad');
});

test('generatePlan: en semana de recuperación no sobrevive ninguna sesión pesada', () => {
  const app = loadApp();
  const profile = baseProfile();
  app.state.profile = profile;
  app.state.event = null;
  app.state.lastEventDate = '2026-09-06'; // domingo
  const weekStartDate = '2026-09-07'; // lunes siguiente
  assert.ok(app.isRecoveryWeek(weekStartDate), 'el fixture debería detectarse como semana de recuperación');
  const plan = app.generatePlan(profile, 5, weekStartDate);
  const heavyTypes = ['intervals', 'tempo', 'fartlek', 'hills', 'progression', 'long'];
  plan.forEach(d => {
    assert.ok(!heavyTypes.includes(d.typeKey), `${d.day} no debería ser ${d.typeKey} en semana de recuperación`);
  });
});

test('preserveLivedDays: no pisa un día de hoy en adelante que el corredor ya personalizó a mano (d.custom)', () => {
  // Reportado por el usuario: tenía 3 sesiones de 5km puestas a mano por el chat del coach
  // (modificar_sesion las marca con d.custom=true) y, al cargar una carrera en Próximos
  // Eventos (lo que dispara una regeneración del plan vía setEvent()), esas 3 sesiones se
  // reemplazaron solas por el plan genérico del algoritmo -- sin avisar y sin que el usuario
  // lo pidiera. Cualquier guardado que dispare una regeneración (datos personales, objetivo,
  // días de entreno, un evento) tiene que respetar un día ya personalizado a mano.
  const app = loadApp();
  const todayIdx = (new Date().getDay() + 6) % 7;
  const oldPlan = app.DAY_KEYS.map(day => ({
    day, typeKey: 'custom', dist: 5, terrain: 'asfalto', zone: 2, beginner: false,
    custom: true, type: 'Rodaje suave', desc: 'Rodaje suave de 5km puesto a mano',
  }));
  const newPlan = app.DAY_KEYS.map(day => ({
    day, typeKey: 'easy', dist: 10, terrain: 'asfalto', zone: 2, beginner: false,
  }));
  const result = app.preserveLivedDays(oldPlan, newPlan);
  result.forEach((d, i) => {
    if (i < todayIdx) {
      // día ya pasado sin vivir -- se fuerza a descanso, comportamiento previo sin cambios
      assert.equal(d.typeKey, 'rest', `${d.day} (antes de hoy, no vivido) debería quedar en descanso`);
    } else {
      assert.equal(d.dist, 5, `${d.day} (hoy en adelante, personalizado) no debería pisarse con el plan nuevo`);
      assert.equal(d.custom, true, `${d.day} debería seguir marcado como personalizado`);
    }
  });
});

test('preserveLivedDays: no resucita un día de hoy en adelante que el corredor canceló a propósito (d.cancelled)', () => {
  // Reportado por el usuario: canceló martes y viernes por chat (cancelar_sesion, que a
  // propósito deja el día con la misma pinta que un descanso normal, sin d.custom) y dejó
  // miércoles y jueves en 6km cada uno (modificar_sesion, con d.custom=true). Al rato, algo
  // disparó una regeneración del plan (agregar una carrera, guardar Perfil, etc.) y martes y
  // viernes volvieron a aparecer con un entrenamiento nuevo del algoritmo -- como para el
  // generador esos días seguían siendo días de entreno normales del perfil, no tenía forma de
  // saber que el corredor los había cancelado a propósito. cancelar_sesion ahora marca
  // d.cancelled=true además de d.custom=false, y preserveLivedDays debe respetarlo igual que a
  // un día personalizado.
  const app = loadApp();
  const todayIdx = (new Date().getDay() + 6) % 7;
  const oldPlan = app.DAY_KEYS.map(day => ({
    day, typeKey: 'rest', dist: 0, terrain: null, zone: null, beginner: false,
    custom: false, cancelled: true,
  }));
  const newPlan = app.DAY_KEYS.map(day => ({
    day, typeKey: 'easy', dist: 10, terrain: 'asfalto', zone: 2, beginner: false,
  }));
  const result = app.preserveLivedDays(oldPlan, newPlan);
  result.forEach((d, i) => {
    if (i < todayIdx) {
      assert.equal(d.typeKey, 'rest', `${d.day} (antes de hoy, no vivido) debería quedar en descanso`);
    } else {
      assert.equal(d.dist, 0, `${d.day} (hoy en adelante, cancelado a propósito) no debería resucitar con una sesión nueva`);
      assert.equal(d.typeKey, 'rest', `${d.day} debería seguir en descanso`);
    }
  });
});

test('generatePlan: el día de una carrera cargada en Próximos eventos recibe una sesión normal (ya no queda como descanso especial)', () => {
  // Antes, cargar una carrera en "Próximos eventos" le sacaba la sesión propia a ese día del
  // plan (quedaba fijo en descanso, marcado raceDay:true). Eso sorprendía a corredores que
  // cargaban ahí una carrera secundaria/de tanteo y veían "desaparecer" un entrenamiento de
  // un día que todavía faltaba mucho -- ahora ese día recibe una sesión de entrenamiento
  // normal, como cualquier otro día de la semana.
  const app = loadApp();
  const profile = baseProfile();
  app.state.profile = profile;
  const weekStartDate = '2026-09-07'; // lunes
  app.state.event = { date: '2026-09-11', name: 'Carrera de prueba', type: 'ruta' }; // viernes de esa semana
  const plan = app.generatePlan(profile, 2, weekStartDate);
  const raceDayPlan = plan.find(d => d.day === 'fri');
  assert.ok(!raceDayPlan.raceDay, 'el día de la carrera cargada ya no debería quedar marcado como raceDay');
  assert.ok(raceDayPlan.dist > 0, 'el día de la carrera cargada debería tener una sesión de entrenamiento asignada, como cualquier otro día');
});

test('generatePlan: una carrera de trail cargada en Próximos eventos ya no cambia el terreno del rodaje largo', () => {
  // El override de terreno por una carrera de "Próximos eventos" se sacó a pedido del
  // usuario -- esa carrera es informativa nada más, no debería reprogramar nada del plan
  // con semanas de anticipación. El rodaje largo sigue usando siempre el terreno habitual
  // del corredor (profile.terrain).
  const app = loadApp();
  const profile = baseProfile({ terrain: 'asfalto' });
  app.state.profile = profile;
  const weekStartDate = '2026-09-07';
  app.state.event = { date: '2026-09-27', name: 'Trail de prueba', type: 'trail' }; // ~3 semanas después
  const plan = app.generatePlan(profile, 2, weekStartDate);
  const longDay = plan.find(d => d.typeKey === 'long');
  assert.equal(longDay.terrain, 'asfalto');
});

test('generatePlan: la semana en la que cae una carrera de Próximos eventos baja el volumen (descarga)', () => {
  const app = loadApp();
  const profile = baseProfile();
  app.state.profile = profile;
  const weekStartDate = '2026-09-07'; // lunes
  app.state.event = { date: '2026-09-11', name: 'Carrera de prueba', type: 'ruta' }; // viernes de esa semana
  const planConEvento = app.generatePlan(profile, 2, weekStartDate);
  app.state.event = null;
  const planSinEvento = app.generatePlan(profile, 2, weekStartDate);
  const totalCon = planConEvento.reduce((a, d) => a + d.dist, 0);
  const totalSin = planSinEvento.reduce((a, d) => a + d.dist, 0);
  assert.ok(totalCon < totalSin, 'la semana de la carrera cargada debería tener menos volumen que la misma semana sin evento');
});

test('generatePlan: una carrera de Próximos eventos lejana (más de una semana) no le baja el volumen a la semana actual', () => {
  // A diferencia del taper gradual de la carrera OBJETIVO del perfil (que empieza 3 semanas
  // antes), una carrera cargada en "Próximos eventos" solo baja el volumen de SU PROPIA
  // semana -- no debería tocar para nada semanas anteriores, por más cerca que estén.
  const app = loadApp();
  const profile = baseProfile();
  app.state.profile = profile;
  const weekStartDate = '2026-09-07'; // lunes
  app.state.event = { date: '2026-09-20', name: 'Carrera de prueba', type: 'ruta' }; // domingo de la semana siguiente
  const planConEvento = app.generatePlan(profile, 2, weekStartDate);
  app.state.event = null;
  const planSinEvento = app.generatePlan(profile, 2, weekStartDate);
  const totalCon = planConEvento.reduce((a, d) => a + d.dist, 0);
  const totalSin = planSinEvento.reduce((a, d) => a + d.dist, 0);
  assert.equal(totalCon, totalSin, 'una carrera cargada para la semana siguiente no debería bajar el volumen de esta semana');
});

test('generatePlan: una meta semanal propia mueve el volumen pero dentro de un rango acotado', () => {
  const app = loadApp();
  const profile = baseProfile({ weeklyKm: 20, weeklyGoalKm: 100 }); // meta desproporcionada a propósito
  app.state.profile = profile;
  const planConMeta = app.generatePlan(profile, 1, '2026-09-07');
  const profileSinMeta = baseProfile({ weeklyKm: 20, weeklyGoalKm: 0 });
  app.state.profile = profileSinMeta;
  const planSinMeta = app.generatePlan(profileSinMeta, 1, '2026-09-07');
  const totalCon = planConMeta.reduce((a, d) => a + d.dist, 0);
  const totalSin = planSinMeta.reduce((a, d) => a + d.dist, 0);
  assert.ok(totalCon > totalSin, 'la meta más alta debería subir el volumen semanal');
  // pero acotado: no debería multiplicarse como si realmente pidiera 100km/semana
  assert.ok(totalCon < totalSin * 1.5, 'el aumento debería estar acotado, no libre');
});

test('generatePlan: el total real de la semana coincide con el kilometraje semanal (con meta o sin meta)', () => {
  // Reportado por el usuario: con una meta de 25km/semana, el plan terminaba sumando 34km --
  // un ~35% arriba, porque cada tipo de sesión se calculaba con una proporción fija (0.85x a
  // 1.5x) de un "per" que no tenía en cuenta cuántas sesiones había esa semana. Ahora el total
  // real tiene que rondar bien de cerca el número real (calculado o puesto a mano), no
  // superarlo por mucho -- para cualquiera de los dos casos, no solo cuando hay una meta.
  const app = loadApp();
  const conMeta = baseProfile({ weeklyKm: 20, weeklyGoalKm: 25 });
  app.state.profile = conMeta;
  app.state.event = null;
  const planConMeta = app.generatePlan(conMeta, 1, '2026-09-07');
  const totalConMeta = planConMeta.reduce((a, d) => a + d.dist, 0);
  assert.ok(Math.abs(totalConMeta - 25) <= 3, `con meta de 25km el total debería rondar 25km, dio ${totalConMeta}`);

  const sinMeta = baseProfile({ weeklyKm: 20, weeklyGoalKm: 0 });
  app.state.profile = sinMeta;
  const planSinMeta = app.generatePlan(sinMeta, 1, '2026-09-07');
  const totalSinMeta = planSinMeta.reduce((a, d) => a + d.dist, 0);
  assert.ok(Math.abs(totalSinMeta - 20) <= 3, `sin meta (weeklyKm=20) el total debería rondar 20km, dio ${totalSinMeta}`);
});

test('weekMultiplier/generatePlan: la descarga periódica no se suma al taper cuando coinciden', () => {
  // isCutbackWeek (cada 4 semanas) y taperMultiplier (últimas 3 semanas antes de la carrera
  // objetivo) son dos recortes de volumen INDEPENDIENTES -- si coincidían en la misma semana
  // (ej. la semana 12 de entreno cae justo dentro de las 3 semanas previas a la carrera), se
  // multiplicaban entre sí y recortaban mucho más de lo que cualquiera de los dos buscaba por
  // separado, justo en una semana sensible (cerca de la carrera). Mismo criterio que ya
  // protege a eventRaceWeekMultiplier de descontar la misma carrera dos veces.
  const app = loadApp();
  const caution = { level: 0 };
  const withoutFix = app.weekMultiplier(12, caution, false) * app.taperMultiplier({ raceDate: '2026-09-13' }, '2026-09-07');
  const withFix = app.weekMultiplier(12, caution, true) * app.taperMultiplier({ raceDate: '2026-09-13' }, '2026-09-07');
  assert.ok(withFix > withoutFix, 'con skipCutback el volumen de esa semana debería ser mayor (sin el doble descuento)');

  const profile = baseProfile({ weeklyKm: 30, raceDate: '2026-09-13' }); // domingo
  app.state.event = null;
  // semana 12, lunes 2026-09-07 -- 6 días antes de la carrera (dentro del taper Y semana de descarga)
  const plan12 = app.generatePlan(profile, 12, '2026-09-07');
  const total12 = plan12.reduce((a, d) => a + d.dist, 0);
  // semana 11, lunes 2026-08-31 -- 13 días antes (dentro del taper, sin descarga) -- debería
  // ser MÁS volumen que la 12 (más lejos de la carrera), no menos, a pesar de que la 12 "en
  // papel" también sería semana de descarga.
  const plan11 = app.generatePlan(profile, 11, '2026-08-31');
  const total11 = plan11.reduce((a, d) => a + d.dist, 0);
  assert.ok(total12 < total11, 'la semana 12 (más cerca de la carrera) debería seguir bajando gradualmente...');
  assert.ok(total12 / total11 > 0.7, `...pero no desplomarse por el doble descuento -- semana 12 (${total12}) vs semana 11 (${total11})`);
});

test('generatePlan: availableMinPerSession topea las sesiones entre semana, no la tirada larga', () => {
  // "¿Cuántos minutos tenés disponibles por sesión?" se guardaba en el perfil pero nunca
  // tocaba el plan real -- solo se lo pasaba al coach del chat como sugerencia. Alguien con
  // 30 minutos reales entre semana podía terminar con una sesión de 8km calculada sin que
  // nada en el plan lo supiera. Ahora sí topea las sesiones entre semana (restando los 20 min
  // fijos de entrada en calor + vuelta a la calma), pero deja la tirada larga del fin de
  // semana sin tocar a propósito -- esa es la sesión grande del fin de semana.
  const app = loadApp();
  const limitado = baseProfile({ weeklyKm: 40, availableMinPerSession: 30 });
  app.state.profile = limitado;
  app.state.event = null;
  const plan = app.generatePlan(limitado, 1, '2026-09-07');
  const pace = app.estimateBasePaceMinPerKm(limitado);
  const weekdaySessions = plan.filter(d => d.dist > 0 && d.typeKey !== 'long');
  assert.ok(weekdaySessions.length > 0, 'debería haber al menos una sesión entre semana para este fixture');
  weekdaySessions.forEach(d => {
    const mins = d.dist * pace;
    assert.ok(mins <= 30, `la sesión de ${d.typeKey} debería entrar en ~30min disponibles, dio ${mins.toFixed(1)}min`);
  });
  const longDay = plan.find(d => d.typeKey === 'long');
  assert.ok(longDay && longDay.dist * pace > 30, 'la tirada larga NO debería estar limitada por availableMinPerSession');

  const sinLimite = baseProfile({ weeklyKm: 40, availableMinPerSession: null });
  app.state.profile = sinLimite;
  const planSinLimite = app.generatePlan(sinLimite, 1, '2026-09-07');
  const totalConLimite = plan.reduce((a, d) => a + d.dist, 0);
  const totalSinLimite = planSinLimite.reduce((a, d) => a + d.dist, 0);
  assert.ok(totalConLimite < totalSinLimite, 'con poco tiempo disponible el total semanal real debería ser menor, no compensarse en otro lado');
});

test('buildIntervalStructure: reps entre 4 y el máximo, y el total ronda la distancia pedida', () => {
  const app = loadApp();
  const { reps, repMeters, recoveryMin } = app.buildIntervalStructure(8, { level: 0 }, 1);
  assert.ok(reps >= 4 && reps <= 12);
  assert.ok(repMeters > 0 && recoveryMin > 0);
  const totalKm = (reps * repMeters) / 1000;
  assert.ok(Math.abs(totalKm - 8) <= 2, `total ${totalKm}km debería estar cerca de 8km`);
});

test('buildIntervalStructure: más cautela reduce el máximo de repeticiones', () => {
  const app = loadApp();
  const relaxed = app.buildIntervalStructure(15, { level: 0 }, 1);
  const cautious = app.buildIntervalStructure(15, { level: 2 }, 1);
  assert.ok(cautious.reps <= relaxed.reps);
  assert.ok(cautious.reps <= 8);
});

test('buildHillStructure: reps entre 4 y el máximo según cautela', () => {
  const app = loadApp();
  const { reps, repMeters } = app.buildHillStructure(6, { level: 1 });
  assert.ok(reps >= 4 && reps <= 7);
  assert.ok(repMeters > 0);
});

test('planAmountText: modo distancia vs. modo tiempo muestran unidades distintas', () => {
  const app = loadApp();
  const profileDist = baseProfile({ trainBy: 'distance' });
  app.state.profile = profileDist;
  const day = { typeKey: 'easy', dist: 8, zone: 2, beginner: false };
  const amountDist = app.planAmountText(day);
  assert.match(amountDist, /km$/);

  app.state.profile = Object.assign({}, profileDist, { trainBy: 'time' });
  const amountTime = app.planAmountText(day);
  assert.match(amountTime, /min$/);
  assert.notEqual(amountDist, amountTime);
});

test('planAmountText: un día de descanso no muestra cantidad', () => {
  const app = loadApp();
  app.state.profile = baseProfile();
  assert.equal(app.planAmountText({ typeKey: 'rest', dist: 0 }), '');
});

test('planLabel: la sesión de series en modo tiempo describe minutos, no metros', () => {
  const app = loadApp();
  const profile = baseProfile({ trainBy: 'time' });
  app.state.profile = profile;
  const day = { typeKey: 'intervals', dist: 8, zone: 4, beginner: false, interval: { reps: 8, repMeters: 400, recoveryMin: 2 } };
  const label = app.planLabel(day);
  assert.ok(!/400/.test(label.desc), 'en modo tiempo no debería mencionar los metros de cada repetición');
});

test('estimateBasePaceMinPerKm: usa el ritmo real de las corridas recientes cuando hay al menos 3', () => {
  const app = loadApp();
  const profile = baseProfile();
  app.state.profile = profile;
  app.state.runs = [
    { distanceKm: 5, durationSec: 5 * 6 * 60 }, // 6 min/km
    { distanceKm: 5, durationSec: 5 * 6 * 60 },
    { distanceKm: 5, durationSec: 5 * 6 * 60 },
  ];
  const pace = app.estimateBasePaceMinPerKm(profile);
  assert.ok(Math.abs(pace - 6) < 0.01);
});

test('estimateBasePaceMinPerKm: sin corridas ni PRs, usa el default según si es principiante', () => {
  const app = loadApp();
  app.state.runs = [];
  const beginner = baseProfile({ weeklyKm: 0, goal: 'start', runnerType: 'new' });
  const advanced = baseProfile();
  assert.equal(app.estimateBasePaceMinPerKm(beginner), 7.5);
  assert.equal(app.estimateBasePaceMinPerKm(advanced), 6.2);
});
