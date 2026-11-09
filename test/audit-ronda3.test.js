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

// ---------- motor del plan ----------
test('ritmo base: una salida registrada por error (0,9 km en 30 min) no mueve el plan; con salidas normales queda cerca de 6:00', () => {
  const app = loadApp();
  app.state.profile = baseProfile(app, { currentWeeklyKm: 30 });
  const day = n => new Date(Date.now() - n * 86400000).toISOString();
  app.state.runs = [
    { id: 1, date: day(9), distanceKm: 5, durationSec: 1800 },      // 6:00
    { id: 2, date: day(7), distanceKm: 8, durationSec: 2900 },      // 6:02
    { id: 3, date: day(5), distanceKm: 5, durationSec: 1750 },      // 5:50
    { id: 4, date: day(3), distanceKm: 10, durationSec: 3600 },     // 6:00
    { id: 5, date: day(1), distanceKm: 0.9, durationSec: 1800 },    // error: cronómetro andando
  ];
  const pace = app.estimateBasePaceMinPerKm(app.state.profile);
  assert.ok(pace > 5.7 && pace < 6.3, 'ritmo base ' + pace);
  // 3 salidas iguales a 6:00 siguen dando 6:00 (comportamiento de siempre)
  app.state.runs = [1, 2, 3].map(i => ({ id: i, date: day(i), distanceKm: 5, durationSec: 1800 }));
  assert.equal(Math.round(app.estimateBasePaceMinPerKm(app.state.profile) * 100) / 100, 6);
  // solo salidas absurdas (menos de 1 km): cae al respaldo, no a un ritmo de 30 min/km
  app.state.runs = [1, 2, 3].map(i => ({ id: i, date: day(i), distanceKm: 0.6, durationSec: 2400 }));
  assert.ok(app.estimateBasePaceMinPerKm(app.state.profile) < 8);
});

test('el test de nivel pendiente solo aparece en la semana actual y la que viene, no en toda la vista previa del Plan', () => {
  const app = loadApp();
  ready(app, { levelTest: { required: true, done: false } });
  const types = n => (app.getWeekData(n).plan || []).map(d => d.typeKey);
  for (const n of [3, 4, 5, 6]) assert.ok(!types(n).includes('test'), 'semana +' + n + ' no muestra un test');
});

test('la carrera objetivo cercana (menos de 7 semanas) o de un principiante también se marca como "Carrera", y la semana siguiente es de recuperación', () => {
  const app = loadApp();
  ready(app, { goal: '10k', weeklyKm: 35, currentWeeklyKm: 35, trainingDays: ['tue', 'thu', 'fri', 'sat', 'sun'] });
  const mon = app.getMondayISO(new Date());
  const add = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const raceSat = add(mon, 5 + 21);                  // un sábado, dentro de 3 semanas y media
  app.state.profile.raceDate = raceSat;
  const raceWeek = add(mon, 21);
  const plan = app.generatePlan(app.state.profile, 4, raceWeek);
  assert.equal(plan[5].raceDay, true, 'el sábado de la carrera está marcado');
  assert.equal(plan[5].dist, 0);
  assert.ok(!['intervals', 'tempo', 'fartlek', 'hills', 'progression', 'long'].includes(plan[4].typeKey), 'el viernes no tiene una sesión fuerte');
  assert.ok(['rest', 'easy'].includes(plan[6].typeKey), 'el domingo después de la carrera es descanso o rodaje suave');
  assert.equal(app.postGoalRaceRecoveryMultiplier(app.state.profile, add(raceWeek, 7)), 0.6, 'la semana siguiente a una carrera de sábado es de recuperación (antes solo si caía domingo)');
  assert.equal(app.postGoalRaceRecoveryMultiplier(app.state.profile, add(raceWeek, 14)), 1, 'y la otra ya no');
  assert.equal(app.postGoalRaceRecoveryMultiplier(app.state.profile, raceWeek), 1, 'la semana de la carrera la maneja el taper');
});

test('la pausa larga se descuenta por escalón (no una sola vez): el código aplica solo la diferencia con lo ya descontado', () => {
  assert.ok(SRC.includes('const breakPrevFactor = breakSameRun ?'));
  assert.ok(SRC.includes('Object.assign({}, cand, {step: cand.kmFactor / breakPrevFactor})'));
  assert.ok(SRC.includes('state.breakAdjFactor = breakAdj.kmFactor;'));
  assert.ok(SRC.includes('Math.max(5, Math.round(state.profile.weeklyKm * breakAdj.step))'));
  // pura aritmética de los escalones: 0,8 -> 0,65 -> 0,5 acumulan exactamente 0,5 y nunca vuelven a descontar el mismo escalón
  let applied = 1, km = 40;
  for (const f of [0.8, 0.8, 0.65, 0.65, 0.5, 0.5]) { if (f < applied - 1e-9) { km = km * (f / applied); applied = f; } }
  assert.equal(Math.round(km), 20);
});

// ---------- resto de la ronda ----------
test('el chequeo de "dijo que aplicó un cambio" solo salta con respuestas que lo afirman, no con las informativas', () => {
  const m = SRC.match(/const CLAIM_PATTERN = (\/.*\/i);/);
  assert.ok(m, 'CLAIM_PATTERN existe');
  const re = eval(m[1]);
  for (const t of ['Listo, ya apliqué los cambios en tu plan.', 'Cambié el martes a un rodaje suave.', 'Ya lo actualicé: el jueves queda en descanso.', 'Moví la tirada al domingo.', 'I already updated your plan.', 'Se actualizó la semana.']) assert.ok(re.test(t), t);
  for (const t of ['Ya estás corriendo 30 km por semana, eso es una buena base.', 'Tu carrera cargada en Próximos eventos es el 15 de noviembre.', 'Tenés el plan actualizado con los 3 rodajes.', 'Ya está bien así: 3 sesiones suaves y una tirada larga.', 'Con esa carga ya estarías en zona 2.', 'Listo, ¿querés que te arme una sesión de series?', 'El ajuste de volumen es del 10%.']) assert.ok(!re.test(t), t);
});

test('rechazar los consentimientos también da de baja el aviso push de ese dispositivo (con tope de tiempo)', () => {
  assert.equal((SRC.match(/if\(!\(await ensureConsent\(\)\)\)\{ await declineConsentSignOut\(\); return; \}/g) || []).length, 2, 'las dos rutas (cuenta existente y nueva)');
  const fn = SRC.slice(SRC.indexOf('async function declineConsentSignOut(){'), SRC.indexOf('async function declineConsentSignOut(){') + 500);
  assert.ok(fn.includes('deletePushRowsForThisDevice()') && fn.includes('setTimeout(r, 4000)') && fn.includes("signOut({ scope:'local' })"));
});

test('persist: con una fila ya cargada guarda con UPDATE y, si la fila ya no existe (borrada desde otro dispositivo), NO la recrea: cierra la sesión local', () => {
  const body = SRC.slice(SRC.indexOf('async function persist()'), SRC.indexOf('function waitForPendingPersist'));
  assert.ok(body.includes("if(loadedStateVersion){") && body.includes(".update({ data: state, updated_at: nowIso }).eq('user_id', currentUserId).select('user_id')"));
  assert.ok(body.includes('Array.isArray(res.data) && res.data.length === 0'), 'solo una lista vacía cuenta como fila borrada (no un null)');
  assert.ok(body.includes('location.reload();\n          return;'), 'cierra y recarga en vez de recrear');
  assert.ok(/else \{\s*saveError = \(await supabaseClient\.from\('app_state'\)\.upsert\(/.test(body), 'el primer guardado de una cuenta nueva sigue siendo upsert');
});

test('Strava revocado: el aviso concuerda en número en español, portugués y alemán (antes "3 Lauf läufe")', () => {
  const src = read('api/strava-webhook.js');
  assert.ok(!src.includes("Lauf${n===1?'':' läufe'}"), 'la forma rota ya no existe');
  assert.ok(src.includes("n===1 ? '1 Lauf, der' : n + ' Läufe, die'"));
  assert.ok(src.includes("n===1?'había llegado':'habían llegado'") && src.includes("n===1?'tinha vindo':'tinham vindo'"));
});

test('iPhone: las filas tocables vuelven a tener cursor y animación de toque (los selectores quedaron en [onclick] al migrar a data-on-click), y Safari sin instalar explica cómo activar los avisos', () => {
  const html = read('index.html');
  assert.ok(html.includes('.card[data-on-click]{cursor:pointer;') && html.includes('.card[data-on-click]:active{transform:scale(.98);}') && html.includes('[data-on-click]:not(:disabled){cursor:pointer;}'));
  assert.ok(!html.includes('.card[onclick]'), 'ya no quedan selectores muertos');
  assert.ok(SRC.includes('function pushUnsupportedMsg(){') && SRC.includes("el.textContent = pushUnsupportedMsg();") && SRC.includes("showToast(pushUnsupportedMsg(),'error')"));
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) assert.ok(/push_needs_install:"[^"]{20,}"/.test(read('locales/' + l + '.js')), l);
});

test('el aviso de carga de Inicio dice "últimos 7 días" en los 6 idiomas (la ventana real), no "esta semana"', () => {
  const bad = { pt: /esta semana/, fr: /cette semaine/, it: /questa settimana|di questa settimana/, de: /diese Woche/ };
  for (const l of ['pt', 'fr', 'it', 'de']) {
    const src = read('locales/' + l + '.js');
    for (const k of ['optimal', 'low', 'caution', 'risk']) {
      const m = src.match(new RegExp('home_load_hint_' + k + ':"([^"]*)"'));
      assert.ok(m, l + ' ' + k);
      assert.ok(/7/.test(m[1]), l + ' ' + k + ' menciona los 7 días: ' + m[1]);
      if (k === 'optimal' || k === 'low') assert.ok(!bad[l].test(m[1]), l + ' ' + k + ' no dice "esta semana"');
    }
  }
});

// ---------- grabación en vivo y deshacer ----------
test('la recuperación por tiempo sigue corriendo aunque la auto-pausa congele el reloj de la carrera (parado en el lugar), y la pausa manual la congela', () => {
  const app = loadApp();
  ready(app);
  const tr = app.getTracker();
  tr.running = true; tr.autoPaused = true; tr.elapsedSec = 100;
  tr.workout = { phase: 'recovery', currentRep: 1, phaseStartElapsedSec: 100, autoPausedSec: 0, structure: { typeKey: 'intervals', reps: 6, repSec: 60, restSec: 90 } };
  tr.lastTickAt = Date.now() - 10000;
  app.tickRunTimer();
  assert.equal(tr.elapsedSec, 100, 'el reloj de la carrera sigue congelado');
  assert.ok(tr.workout.autoPausedSec >= 9 && tr.workout.autoPausedSec <= 11, 'pero la recuperación sumó ~10 s: ' + tr.workout.autoPausedSec);
  assert.ok(app.phaseSpentSec(tr.workout) >= 9);
  tr.workout.phase = 'effort';
  assert.equal(app.phaseSpentSec(tr.workout), 0, 'en el esfuerzo no se suma la auto-pausa');
  tr.workout.phase = 'recovery'; tr.autoPaused = false; tr.running = false;   // pausa manual
  const before = tr.workout.autoPausedSec;
  tr.lastTickAt = Date.now() - 10000;
  app.tickRunTimer();
  assert.equal(tr.workout.autoPausedSec, before, 'la pausa manual congela todo');
});

test('si iOS suspende la página con la pantalla bloqueada (hueco de más de 45 s) el siguiente punto se marca como corte y se avisa', () => {
  const app = loadApp();
  ready(app);
  const tr = app.getTracker();
  tr.running = true; tr.autoPaused = false; tr.elapsedSec = 300; tr.gapPending = false;
  tr.lastTickAt = Date.now() - 2000;
  app.tickRunTimer();
  assert.ok(!tr.gapPending, 'una pasada normal no marca nada');
  tr.lastTickAt = Date.now() - 120000;
  app.tickRunTimer();
  assert.equal(tr.gapPending, true, 'un hueco de 2 min sí');
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) assert.ok(/run_gap_notice:"[^"]{20,}"/.test(read('locales/' + l + '.js')), l);
});

test('cada reanudación de una pausa NO deja un wake lock colgado: no se pide otro si ya hay uno vigente', () => {
  assert.ok(SRC.includes('if(wakeLockSentinel && !wakeLockSentinel.released) return;'));
  const i = SRC.indexOf('async function requestWakeLock(){');
  assert.ok(SRC.indexOf('if(wakeLockSentinel && !wakeLockSentinel.released) return;', i) < SRC.indexOf('navigator.wakeLock.request', i), 'la guarda va antes de pedir');
});

test('deshacer un cambio del coach conserva las notas guardadas DESPUÉS de ese turno', () => {
  const app = loadApp();
  ready(app);
  app.state.profile.coachNotes = ['prefiere mañanas', 'no puede correr los domingos'];
  app.state.coachUndoSnapshot = {
    plan: JSON.parse(JSON.stringify(app.state.plan)), nextWeekOverrides: {}, profile: Object.assign(JSON.parse(JSON.stringify(app.state.profile)), { coachNotes: ['prefiere mañanas'] }), phaseSchedule: null, weekNumber: 3, curveWeekOffset: 0, curveCap: null,
    laterNotes: ['no puede correr los domingos'],
  };
  app.applyUndoLastChange();
  assert.deepEqual(app.state.profile.coachNotes, ['prefiere mañanas', 'no puede correr los domingos'], 'la nota posterior sigue');
  assert.ok(SRC.includes('if(state.coachUndoSnapshot && !coachUndoTurnSnapshotTaken){ (state.coachUndoSnapshot.laterNotes ='));
});

test('retomar una carrera recuperada conserva la repetición y la fase de las series y no repite el "¡A correr!"', () => {
  assert.ok(SRC.includes('workout: tracker.workout && tracker.workout.structure ? {typeKey: tracker.workout.structure.typeKey'), 'la guía se guarda junto con el progreso');
  assert.ok(SRC.includes('function setupWorkoutGuide(restore){'));
  assert.ok(SRC.includes('restore.typeKey === structure.typeKey && (restore.planTypeKey || null) === (structure.planTypeKey || null)'), 'solo si la sesión de hoy sigue siendo la misma');
  assert.ok(SRC.includes("if(structure && structure.typeKey==='continuous' && !resumed) announceContinuousWorkoutStart(structure);"));
  assert.ok(SRC.includes('setupWorkoutGuide(saved && saved.workout);'));
  // funcional: sin sesión programada (carrera libre) la guía sigue sin armarse, también al retomar
  const app = loadApp();
  ready(app);
  app.getTracker().workout = null;
  app.setupWorkoutGuide({ typeKey: 'intervals', planTypeKey: 'intervals', phase: 'effort', currentRep: 4, phaseStartDistanceKm: 1, phaseStartElapsedSec: 300 });
  const w = app.getTracker().workout;
  assert.ok(!w || (w.structure && (w.structure.typeKey !== 'intervals' || w.currentRep === 4)), 'o no arma guía, o restaura la repetición 4');
});
