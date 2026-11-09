// Auditoría 2026-11-03, ronda 3 (correctitud funcional, iOS/PWA, privacidad y Zonda).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split(String.fromCharCode(13)).join('');
const SRC = read('app.js');

function baseProfile(app, o) {
  return Object.assign({
    name: 'Prueba', weeklyKm: 30, weeklyGoalKm: 0, goal: '10k', runnerType: 'active', trainingDays: ['tue', 'wed', 'fri', 'sun'],
    terrain: 'asfalto', units: 'metric', trainBy: 'distance', birth: null, weight: null, height: null, hrKnown: false, hrMax: 190, hrZones: app.computeZones(190),
  }, o || {});
}
function ready(app, o) {
  app.state.profile = baseProfile(app, o);
  app.state.weekNumber = 3;
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.runs = []; app.state.shoes = []; app.state.painLog = []; app.state.event = null; app.state.chat = [];
  app.state.plan = app.generatePlan(app.state.profile, 3);
}

test('el test de nivel hecho con una carrera de Strava/Garmin no manda su distancia ni sus ritmos a la IA, y su pulso no toca las zonas', () => {
  const app = loadApp();
  ready(app);
  app.state.profile.hrMax = 170; app.state.profile.hrZones = app.computeZones(170);
  app.applyLevelTestResult(2455, 199, true);
  const lt = app.state.profile.levelTest;
  assert.equal(lt.done, true);
  assert.equal(lt.restricted, true);
  assert.equal(app.state.profile.hrMax, 170, 'el pulso de una carrera restringida no sube la FC máxima (las zonas sí viajan a la IA)');
  const ctx = app.buildContext();
  assert.ok(!ctx.includes('2455'), 'la distancia del test no está en el contexto');
  assert.ok(!/suave \d/.test(ctx.slice(ctx.indexOf('test de nivel'))), 'tampoco los ritmos');
  assert.match(ctx, /no están disponibles para vos/);
  // carrera propia (sin restricción): se manda como siempre y el pulso sí cuenta
  const app2 = loadApp();
  ready(app2);
  app2.state.profile.hrMax = 170; app2.state.profile.hrZones = app2.computeZones(170);
  app2.applyLevelTestResult(2455, 199, false);
  assert.equal(app2.state.profile.levelTest.restricted, false);
  assert.equal(app2.state.profile.hrMax, 199);
  assert.ok(app2.buildContext().includes('2455 m'));
});

test('isRestrictedRun coincide con lo que aiVisibleRuns deja fuera', () => {
  const app = loadApp();
  app.state.runs = [
    { id: 1, distanceKm: 5 }, { id: 2, source: 'strava' }, { id: 3, source: 'garmin' }, { id: 4, aiExcluded: true }, { id: 5, origin: 'garmin', aiExcluded: true },
  ];
  const visible = app.aiVisibleRuns().map(r => r.id);
  assert.deepEqual(visible.filter(id => app.isRestrictedRun(app.state.runs.find(r => r.id === id))), [], 'ninguna visible es restringida');
  assert.ok(app.isRestrictedRun(app.state.runs[1]) && app.isRestrictedRun(app.state.runs[2]) && app.isRestrictedRun(app.state.runs[3]) && app.isRestrictedRun(app.state.runs[4]));
  assert.ok(!app.isRestrictedRun(app.state.runs[0]));
  assert.ok(SRC.includes('applyLevelTestResult(km * 1000 * 720 / sec, (maxHr >= 100 && maxHr <= 230) ? Math.round(maxHr) : null, isRestrictedRun(run));'), 'la lectura automática marca el origen');
});

test('la actualización automática NO recarga la app con una carrera en curso o pausada', () => {
  const app = loadApp();
  const tr = app.getTracker();
  tr.watchId = null;
  assert.equal(app.runInProgress(), false, 'sin carrera se puede recargar');
  tr.watchId = 7;
  assert.equal(app.runInProgress(), true, 'con GPS activo (corriendo o en pausa) no');
  assert.ok(SRC.includes('if(runInProgress()) return false;'));
  assert.ok(SRC.includes('if(runInProgress()){ appUpdateFound = false; return; } location.href'), 'se revalida dentro del timer de 700 ms');
  assert.ok(SRC.includes('setTimeout(() => { try{ checkForAppUpdate(); }catch(e){} }, 4000);'), 'al cerrar el resumen se aplica la versión pendiente');
});

test('el coach no puede esquivar el filtro con "Fartlek" ni armar una sesión de distancia absurda para un perfil restringido', () => {
  const app = loadApp();
  ready(app, { runnerType: 'new', weeklyKm: 0, currentWeeklyKm: 0 });
  assert.match(app.coachSafetyRefusal({ tipo: 'Fartlek', tipo_categoria: 'easy', descripcion: 'fartlek 10x3', zona: 3 }), /principiante/, 'un fartlek puesto en tipo/descripcion con otra categoría igual se bloquea para el principiante total');
  assert.match(app.coachSafetyRefusal({ tipo_categoria: 'fartlek', zona: 3 }), /principiante/);
  assert.match(app.coachSafetyRefusal({ tipo_categoria: 'long', distancia_km: 40, zona: 2 }), /demasiado para este corredor/, 'una tirada de 40 km no pasa');
  assert.equal(app.coachSafetyRefusal({ tipo_categoria: 'easy', distancia_km: 3, zona: 2 }), null, 'una sesión suave razonable sí');
  // corredor activo sano: sin tope ni bloqueo de fartlek
  const app2 = loadApp();
  ready(app2, { currentWeeklyKm: 30 });
  assert.equal(app2.coachSafetyRefusal({ tipo_categoria: 'fartlek', zona: 3 }), null);
  assert.equal(app2.coachSafetyRefusal({ tipo_categoria: 'long', distancia_km: 25, zona: 2 }), null);
});

test('el contexto de Zonda dice cuántos días faltan en la semana de la carrera (antes decía "ya pasó" de 0 a 4 días antes)', () => {
  const app = loadApp();
  ready(app);
  const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return app.todayLocalISO ? app.todayLocalISO.call(null) && (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')) : ''; };
  for (const [n, re] of [[0, /es HOY/], [1, /es MAÑANA/], [3, /faltan 3 días/], [30, /faltan 4 semanas/], [-2, /ya pasó/]]) {
    app.state.profile.raceDate = iso(n);
    const ctx = app.buildContext();
    const seg = ctx.slice(ctx.indexOf('Fecha objetivo del plan'), ctx.indexOf('Fecha objetivo del plan') + 220);
    assert.match(seg, re, 'a ' + n + ' días: ' + seg.slice(0, 160));
  }
});

test('"Listo, ya apliqué los cambios" solo se dice si algo cambió de verdad (no si la herramienta se rechazó)', () => {
  assert.ok(SRC.includes('const stateBefore = coachStateFingerprint();'));
  assert.ok(SRC.includes('if(coachStateFingerprint() !== stateBefore) anyToolApplied = true;'));
  assert.ok(!/\n\s*anyToolApplied = true;\s*\n\s*const toolResults/.test(SRC), 'ya no se marca antes de ejecutar las herramientas');
  const app = loadApp();
  ready(app);
  const a = app.coachStateFingerprint();
  assert.equal(app.coachStateFingerprint(), a, 'sin cambios la huella es la misma');
  app.state.plan[0].dist = (app.state.plan[0].dist || 0) + 1;
  assert.notEqual(app.coachStateFingerprint(), a, 'un cambio en el plan la cambia');
});

test('iPhone: la voz se desbloquea dentro de un gesto y "solo vibración" no deja sin aviso donde no hay vibración', () => {
  const app = loadApp();
  app.state.voiceEnabled = true;
  app.state.voiceMode = 'vibe';
  const canVibrate = app.vibrationSupported();
  if (!canVibrate) {
    assert.equal(app.voiceAllowed(true), true, 'sin vibración, los avisos importantes se dicen en voz alta');
    assert.equal(app.voiceAllowed(false), false, 'y el aviso de cada km no');
  } else {
    assert.equal(app.voiceAllowed(true), false);
  }
  app.state.voiceMode = 'all';
  assert.equal(app.voiceAllowed(false), true);
  assert.ok(SRC.includes("['pointerup', 'touchend', 'click'].forEach(ev => document.addEventListener(ev, unlockSpeech"), 'el desbloqueo corre en el primer toque');
  assert.ok(/function startRun\(\)\{\s*unlockSpeech\(\);/.test(SRC), 'y al tocar Comenzar');
});

test('la guía de voz del test de nivel es SIEMPRE de 12 minutos, aunque el plan sea por distancia, y no dice "podés seguir"', () => {
  const app = loadApp();
  ready(app);
  const tr = app.getTracker();
  app.state.profile.trainBy = 'distance';
  tr.workout = { phase: 'continuous', structure: { typeKey: 'continuous', planTypeKey: 'test', targetDist: 2.4, targetDurMin: 12 } };
  tr.elapsedSec = 560; tr.distanceKm = 2.4;
  let p = app.sessionProgress();
  assert.equal(p.mode, 'time');
  assert.equal(p.total, 720);
  assert.ok(p.frac < 1, 'a los 560 s con la distancia estimada cumplida todavía NO terminó');
  tr.elapsedSec = 720;
  p = app.sessionProgress();
  assert.ok(p.frac >= 1 && p.test === true);
  assert.ok(SRC.includes("t(p.test ? 'voice_test_done' : 'voice_target_done')"));
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) assert.ok(/voice_test_done:"[^"]+"/.test(read('locales/' + l + '.js')), 'texto del fin del test en ' + l);
});

test('push web: al volver a entrar se vuelve a guardar la suscripción que el navegador ya tiene (sin crear una nueva)', () => {
  assert.ok(SRC.includes('async function refreshWebPushRegistration(){'));
  assert.ok(SRC.includes("setTimeout(()=>{ try{ refreshWebPushRegistration(); }catch(e){} }, 2500);"));
  const fn = SRC.slice(SRC.indexOf('async function refreshWebPushRegistration(){'), SRC.indexOf('async function enableNativePushNotifications'));
  assert.ok(fn.includes("Notification.permission !== 'granted'") && fn.includes('getSubscription()') && !fn.includes('.subscribe('), 'solo reusa la existente, nunca pide permiso ni crea una');
});

test('los recordatorios push nombran fartlek, cuestas y progresivo en los 6 idiomas (antes mostraban "hills" o "progression" en inglés)', () => {
  const src = read('api/send-reminders.js');
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const line = src.split('\n').find(x => x.startsWith('  ' + l + ': { types:{'));
    assert.ok(line, l);
    for (const k of ['fartlek', 'hills', 'progression', 'easy', 'intervals', 'tempo', 'long', 'test']) assert.ok(line.includes(k + ':'), l + ' falta ' + k);
  }
});

test('la página pública de borrado de cuenta lista Garmin en los 6 idiomas', () => {
  const h = read('eliminar-cuenta.html');
  assert.equal(h.split('Strava, Garmin, Suunto, Wahoo, Polar, COROS').length - 1, 6);
  assert.equal(h.split('Strava, Garmin, Polar, Wahoo, COROS').length - 1, 6);
});
