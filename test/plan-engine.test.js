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

test('getReschedulableDays: no ofrece un día que el corredor canceló a propósito por chat', () => {
  // Reportado como bug: el botón de "reprogramar por lluvia" ofrecía cualquier día con
  // typeKey==='rest' como destino -- pero un día CANCELADO a propósito por chat (d.cancelled,
  // ver applyCancelSession) también tiene typeKey:'rest' y dist:0, a propósito, para verse
  // igual que un descanso normal. Sin este chequeo, el aviso de clima podía ofrecer mover la
  // sesión de hoy justo al día que el corredor dijo explícitamente que no podía entrenar.
  const app = loadApp();
  const todayIdx = (new Date().getDay() + 6) % 7;
  app.state.profile = baseProfile();
  app.state.plan = app.DAY_KEYS.map((day, i) => {
    if (i <= todayIdx) return { day, typeKey: 'easy', dist: 8 };
    // Alterna descanso normal / cancelado a propósito entre los días que quedan de la
    // semana, para cubrir ambos casos sea cual sea el día en que corre el test.
    return (i - todayIdx) % 2 === 1
      ? { day, typeKey: 'rest', dist: 0, cancelled: false }
      : { day, typeKey: 'rest', dist: 0, cancelled: true };
  });

  const options = Array.from(app.getReschedulableDays());

  app.state.plan.forEach((d, i) => {
    if (i <= todayIdx) return;
    if (d.cancelled) {
      assert.ok(!options.includes(d.day), `${d.day} está cancelado a propósito -- no debería ofrecerse para reprogramar`);
    } else {
      assert.ok(options.includes(d.day), `${d.day} es un descanso normal -- debería poder ofrecerse para reprogramar`);
    }
  });
});
