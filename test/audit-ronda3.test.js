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

test('los Términos listan Garmin como integración en los 6 idiomas (antes lo omitían aunque la app y la política lo tratan)', () => {
  const t = read('js/legal-terms.js');
  assert.equal((t.match(/Strava, Garmin, Polar, Wahoo, COROS/g) || []).length, 12, 'las dos listas (resumen y servicios) × 6 idiomas');
  assert.equal(/Strava, Polar, Wahoo/.test(t), false);
});

// ---------- datos de Strava/Garmin hacia terceros ----------
test('los avisos de carga y el resumen semanal de Strava/Garmin no llevan distancia, tiempo, ritmo ni comparación con el plan', () => {
  const { buildMessage } = require('../api/_lib/notify-new-run');
  const { buildWeeklySummary } = require('../api/_lib/weekly-summary');
  const run = { id: 'a', distanceKm: 8.2, durationSec: 2928 };
  for (const src of ['garmin', 'strava']) for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const one = buildMessage([run], src, l, false, { timeMode: false, planned: 8, actual: 8.2 }).body;
    const many = buildMessage([run, run], src, l, false, null).body;
    assert.ok(!/\d+[.,]\d+ ?(km|mi)|\d{1,2}:\d{2}|\d+%|\d+ %/.test(one + ' ' + many), src + ' ' + l + ': ' + one + ' | ' + many);
  }
  // una marca sin esa restricción sigue con los números de siempre
  assert.match(buildMessage([run], 'suunto', 'es', false).body, /8\.20 km · 48:48/);
  const now = Date.parse('2026-11-08T22:00:00Z');
  const base = { plan: null, weekStart: '2026-11-02', streak: 2, tz: 'UTC', imperial: false, now };
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const b = buildWeeklySummary(Object.assign({ lang: l, runs: [{ date: '2026-11-05T10:00:00Z', distanceKm: 8, source: 'garmin' }] }, base)).body;
    assert.ok(!/\d/.test(b), l + ': ' + b);
  }
  assert.match(buildWeeklySummary(Object.assign({ lang: 'es', runs: [{ date: '2026-11-05T10:00:00Z', distanceKm: 8 }] }, base)).body, /8\.0 km en 1 salida/);
});

test('la miniatura del recorrido de una carrera de Strava/Garmin no se pide a Mapbox (su recorrido iría en la dirección)', () => {
  const app = loadApp();
  const pts = [{ lat: -34.6, lon: -58.4 }, { lat: -34.61, lon: -58.41 }, { lat: -34.62, lon: -58.42 }, { lat: -34.63, lon: -58.43 }, { lat: -34.64, lon: -58.44 }];
  assert.ok(app.buildHistMapStaticUrl({ points: pts }, 300, 100).startsWith('https://api.mapbox.com/styles/v1/mapbox/'), 'una carrera propia sí');
  for (const r of [{ source: 'garmin' }, { source: 'strava' }, { aiExcluded: true }, { origin: 'garmin', aiExcluded: true }]) {
    const u = app.buildHistMapStaticUrl(Object.assign({ points: pts }, r), 300, 100);
    assert.ok(u.startsWith('data:image/gif;base64,'), JSON.stringify(r));
    assert.ok(!u.includes('mapbox') && !u.includes('-34.6'));
  }
});

// ---------- app sin conexión (service worker) ----------
function loadSw() {
  const vm = require('node:vm');
  const listeners = {};
  const store = new Map();
  const cacheApi = {
    open: async () => ({
      match: async k => store.get(String(k.url || k)),
      put: async (k, v) => { store.set(String(k.url || k), v); },
      add: async () => {},
    }),
    keys: async () => [], delete: async () => true,
  };
  const sb = {
    self: { location: { origin: 'https://zancada.org' }, addEventListener: (n, f) => { listeners[n] = f; }, skipWaiting() {}, clients: { claim() {} }, registration: {} },
    caches: cacheApi, Request: class { constructor(u) { this.url = String(u); } }, URL, console,
    setTimeout: (f, ms) => setTimeout(f, ms > 1000 ? 20 : ms),   // el tope de 4 s corre en 20 ms
    fetch: async () => { throw new Error('sin red'); },
  };
  sb.self.Request = sb.Request;
  vm.createContext(sb);
  vm.runInContext(read('sw.js'), sb);
  const run = async (url, opts) => {
    let responded = null;
    const ev = { request: Object.assign({ url, method: 'GET', headers: { has: h => !!(opts && opts.range && h === 'range') } }, {}), respondWith: p => { responded = p; } };
    listeners.fetch(ev);
    return responded ? await responded : undefined;
  };
  return { sb, run, store };
}

test('service worker: red primero, copia guardada sin señal o con red muy lenta, y NUNCA toca la API, otros orígenes ni los pedidos con Range', async () => {
  const { sb, run, store } = loadSw();
  // rutas que no pasan por el SW
  assert.equal(await run('https://api.mapbox.com/x'), undefined, 'otro origen');
  assert.equal(await run('https://zancada.org/api/chat'), undefined, 'API');
  assert.equal(await run('https://zancada.org/app.js?_v=123'), undefined, 'chequeo de versión');
  assert.equal(await run('https://zancada.org/app.js', { range: true }), undefined, 'Range');
  // con red: devuelve la respuesta nueva y la guarda
  sb.fetch = async () => ({ status: 200, type: 'basic', body: 'nuevo', clone() { return this; } });
  const fresh = await run('https://zancada.org/app.js');
  assert.equal(fresh.body, 'nuevo');
  assert.ok(store.has('https://zancada.org/app.js'));
  // sin red: usa la copia
  sb.fetch = async () => { throw new Error('sin red'); };
  assert.equal((await run('https://zancada.org/app.js')).body, 'nuevo', 'sin red sirve la última copia');
  // "/?source=pwa" y "/" comparten copia
  sb.fetch = async () => ({ status: 200, type: 'basic', body: 'inicio', clone() { return this; } });
  await run('https://zancada.org/');
  sb.fetch = async () => { throw new Error('sin red'); };
  assert.equal((await run('https://zancada.org/?source=pwa')).body, 'inicio');
  // red colgada (lenta): tras el tope se usa la copia
  sb.fetch = () => new Promise(() => {});
  assert.equal((await run('https://zancada.org/app.js')).body, 'nuevo', 'red lenta -> copia');
  // error del servidor con copia disponible: se prefiere la copia; sin copia, se devuelve el error tal cual
  sb.fetch = async () => ({ status: 503, type: 'basic', body: 'caído', clone() { return this; } });
  assert.equal((await run('https://zancada.org/app.js')).body, 'nuevo');
  assert.equal((await run('https://zancada.org/privacy.html')).status, 503, 'sin copia: el error real');
  // los avisos push siguen igual
  assert.ok(read('sw.js').includes("self.addEventListener('push'") && read('sw.js').includes("self.addEventListener('notificationclick'"));
});

test('rechazar los consentimientos: la pantalla avisa en los 6 idiomas que los datos se conservan hasta borrar la cuenta', () => {
  assert.ok(read('index.html').includes('id="consent-decline-note"'));
  assert.ok(SRC.includes("set('consent-decline-note', 'consent_decline_note');"));
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) assert.ok(/consent_decline_note:"[^"]*info@zancada\.org[^"]*"/.test(read('locales/' + l + '.js')), l);
});

test('la política de privacidad dice la verdad de los push (Firebase en Android, Apple en iPhone) sin hablar de la web', () => {
  const p = read('js/legal-privacy.js');
  assert.ok(!p.includes('<strong>Firebase Cloud Messaging (Google)'), 'ya no atribuye todos los push a Firebase');
  assert.equal((p.match(/Apple/g) || []).length >= 12, true, 'Apple aparece en las dos secciones de los 6 idiomas');
  assert.ok(!/navegador|browser|navigateur|Browser|navegador|PWA|Safari/.test(p.replace(/Apple’s|Apple's/g, '')), 'sigue hablando solo de la app (hay otro test que lo exige)');
});

// ---------- Hoy en tu reloj ----------
function mkWatchEnv(opts) {
  const app = loadApp();
  ready(app);
  app.state.onboarded = true;
  const idx = (new Date().getDay() + 6) % 7;
  app.state.plan = app.state.plan.map((d, i) => (i === idx ? Object.assign({}, d, { typeKey: 'easy', dist: 6, status: undefined, raceDay: false }) : d));
  const el = { style: {}, innerHTML: 'x' };
  const realGet = app.document ? null : null;
  return { app, el, idx };
}

test('la tarjeta "Hoy en tu reloj": solo aparece con un reloj con envío de plan conectado y una sesión de hoy por hacer', () => {
  const { app } = mkWatchEnv();
  assert.ok(app.watchTodayDay(), 'hay sesión de hoy');
  const idx = (new Date().getDay() + 6) % 7;
  for (const patch of [{ status: 'done' }, { status: 'skipped' }, { typeKey: 'rest', dist: 0 }, { raceDay: true }, { dist: 0 }]) {
    const a2 = mkWatchEnv().app;
    a2.state.plan[idx] = Object.assign({}, a2.state.plan[idx], patch);
    assert.equal(a2.watchTodayDay(), null, JSON.stringify(patch));
  }
});

test('markWatchSent guarda el momento del último envío por marca', () => {
  const { app } = mkWatchEnv();
  const t0 = Date.now();
  app.markWatchSent('garmin');
  assert.ok(app.state.watchSentAt.garmin >= t0 && app.state.watchSentAt.garmin <= Date.now());
  app.state.watchSentAt = 'roto';
  app.markWatchSent('suunto');
  assert.equal(typeof app.state.watchSentAt, 'object');
  assert.ok(app.state.watchSentAt.suunto > 0);
});

test('la tarjeta explica el camino por marca (2 pasos en los 6 idiomas) y usa los textos de la app, escapados', () => {
  const brands = ['garmin', 'suunto', 'wahoo', 'coros'];
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const src = read('locales/' + l + '.js');
    for (const k of ['watch_card_title', 'watch_card_sent', 'watch_card_sent_ago', 'watch_card_pending', 'watch_card_btn', 'watch_card_btn_again', 'watch_card_btn_sending', 'watch_card_how', 'watch_card_how_hide', 'watch_card_toast_ok', 'watch_card_toast_wait', 'watch_card_toast_reconnect', 'watch_card_toast_error', 'watch_card_note']) assert.ok(new RegExp(k + ':"[^"]{3,}"').test(src), l + ' ' + k);
    for (const b of brands) for (const n of [1, 2]) assert.ok(new RegExp('watch_steps_' + b + '_' + n + ':"[^"]{15,}"').test(src), l + ' pasos ' + b + n);
    assert.ok(/watch_card_sent_ago:"[^"]*\{brand\}[^"]*\{ago\}/.test(src) && /watch_card_toast_ok:"[^"]*\{brand\}/.test(src), l + ' placeholders');
  }
  const fn = SRC.slice(SRC.indexOf('function renderWatchCard(){'), SRC.indexOf('function toggleWatchHow()'));
  assert.ok(fn.includes('escapeHtml(status)') && fn.includes("escapeHtml(t('watch_card_title'))") && !/innerHTML\s*=[^;]*\bb\.name\b(?!\))/.test(fn.replace(/t\('[^']+', \{brand:b\.name[^}]*\}\)/g, '')), 'todo texto pasa por escapeHtml');
  assert.ok(fn.includes('data-on-click="sendPlanToWatchNow('), 'sin handlers inline: se usa data-on-click');
});

test('el botón de la tarjeta no machaca la API de la marca: enfriamiento de 5 min, mensajes claros, y un fallo no gasta el enfriamiento', () => {
  assert.ok(SRC.includes('const WATCH_PRESS_COOLDOWN_MS = 5 * 60 * 1000;'));
  const fn = SRC.slice(SRC.indexOf('async function sendPlanToWatchNow(key){'), SRC.indexOf('function renderHome(){'));
  assert.ok(fn.includes('watchLastPress[key] = Date.now();') && fn.includes("showToast(t('watch_card_toast_wait'), 'info')"));
  assert.ok(fn.includes("result.reason === 'not_connected'") && fn.includes("result.reason === 'cooldown' || result.reason === 'rate_limited'"));
  assert.ok(fn.includes('watchLastPress[key] = 0;'), 'un error permite reintentar enseguida');
  assert.ok(fn.includes('b.sync(true)'), 'usa el envío forzado de cada marca (el que ya respeta enfriamientos y topes del servidor)');
  // los cuatro envíos automáticos marcan el momento del último envío exitoso
  for (const b of ['garmin', 'suunto', 'wahoo', 'coros']) assert.ok(SRC.includes("if(ok){ markWatchSent('" + b + "'); dirty = true; }"), b);
  assert.ok(SRC.includes('try{ renderWatchCard(); }catch(e){}\n  renderHomePain();') || SRC.includes('try{ renderWatchCard(); }catch(e){}'), 'se pinta con Inicio');
});

test('renderWatchCard: oculta la tarjeta sin conexiones, y con la marca conectada muestra el estado, el botón y los pasos', () => {
  const card = { style: { display: 'none' }, innerHTML: '' };
  const app = loadApp({ elements: { 'home-watch-card': card } });
  ready(app);
  app.state.onboarded = true;
  const idx = (new Date().getDay() + 6) % 7;
  app.state.plan[idx] = Object.assign({}, app.state.plan[idx], { typeKey: 'easy', dist: 6, status: undefined, raceDay: false });
  app.setDeviceConnections({ strava: true, polar: true, garmin: false, suunto: false, wahoo: false, coros: false });
  app.renderWatchCard();
  assert.equal(card.style.display, 'none', 'Strava y Polar solo importan carreras: no hay nada que llevar al reloj');
  assert.equal(card.innerHTML, '');
  app.setDeviceConnections({ strava: false, polar: false, garmin: true, suunto: false, wahoo: false, coros: false });
  app.renderWatchCard();
  assert.equal(card.style.display, '', 'con Garmin conectado se muestra');
  assert.match(card.innerHTML, /Hoy en tu reloj/);
  assert.match(card.innerHTML, /todavía no se envió a tu Garmin/, 'pendiente: todavía no se mandó');
  assert.match(card.innerHTML, /Enviar al reloj ahora/);
  assert.ok(card.innerHTML.includes("data-on-click=\"sendPlanToWatchNow('garmin')\""));
  assert.ok(!card.innerHTML.includes('watch-steps'), 'los pasos arrancan ocultos');
  app.toggleWatchHow();
  assert.match(card.innerHTML, /Entrenamiento → Entrenamiento de hoy → Iniciar/, 'paso a paso de Garmin');
  assert.match(card.innerHTML, /Ocultar los pasos/);
  app.toggleWatchHow();
  // una vez enviada: lo dice y el botón pasa a "Volver a enviar"
  app.state.garminSent = { [app.todayLocalISO()]: 'sig' };
  app.markWatchSent('garmin');
  app.renderWatchCard();
  assert.match(card.innerHTML, /ya está en tu Garmin · enviada/);
  assert.match(card.innerHTML, /Volver a enviar/);
  // dos marcas: una fila por marca
  app.setDeviceConnections({ garmin: true, suunto: true, wahoo: false, coros: true, strava: false, polar: false });
  app.renderWatchCard();
  assert.equal((card.innerHTML.match(/class="watch-row"/g) || []).length, 3);
  // sin sesión hoy: se oculta
  app.state.plan[idx] = Object.assign({}, app.state.plan[idx], { typeKey: 'rest', dist: 0 });
  app.renderWatchCard();
  assert.equal(card.style.display, 'none');
});


// ---------- botón de desconectar ----------
test('desconectar un reloj: el botón se bloquea y dice "Desconectando…", no se puede tocar dos veces, y al terminar avisa', async () => {
  const btn = { disabled: false, textContent: 'Desconectar', classList: { toggle(c, on) { this[c] = !!on; } }, setAttribute(k, v) { this[k] = v; } };
  const app = loadApp({ elements: { 'garmin-connect-btn': btn } });
  ready(app);
  app.setDeviceConnections({ strava: false, polar: false, garmin: true, suunto: false, wahoo: false, coros: false });
  app.setDisconnecting('garmin', true);
  assert.equal(btn.textContent, 'Desconectando…');
  assert.equal(btn.disabled, true);
  assert.equal(btn.classList['is-busy'], true);
  assert.equal(btn['aria-busy'], 'true');
  app.setDisconnecting('garmin', false);
  assert.equal(btn.disabled, false);
  assert.equal(btn.classList['is-busy'], false);
  // runDisconnect: ejecuta la desconexión una sola vez aunque se toque dos veces seguidas
  let runs = 0, release;
  const gate = new Promise(r => { release = r; });
  const p1 = app.runDisconnect('garmin', 'Garmin', async () => { runs++; await gate; });
  const p2 = app.runDisconnect('garmin', 'Garmin', async () => { runs++; });
  release();
  await Promise.all([p1, p2]);
  assert.equal(runs, 1, 'el segundo toque no repite la desconexión');
  assert.equal(btn.disabled, false, 'al terminar el botón vuelve a estar disponible');
  // si la desconexión lanza un error, el botón igual se libera
  await assert.rejects(() => app.runDisconnect('garmin', 'Garmin', async () => { throw new Error('fallo'); }));
  assert.equal(btn.disabled, false);
});

test('las siete desconexiones pasan por runDisconnect, y la confirmación arranca el estado "Desconectando…"', () => {
  for (const [fn, key, brand] of [['Strava', 'strava', 'Strava'], ['Polar', 'polar', 'Polar'], ['Wahoo', 'wahoo', 'Wahoo'], ['Suunto', 'suunto', 'Suunto'], ['Coros', 'coros', 'COROS'], ['Garmin', 'garmin', 'Garmin'], ['HealthConnect', 'healthconnect', 'Health Connect']]) {
    assert.ok(SRC.includes(`async function disconnect${fn}(){ return runDisconnect('${key}', '${brand}', disconnect${fn}Now); }`), fn);
  }
  assert.ok(SRC.includes('if(ok) setDisconnecting(sourceKey, true);'), 'tras confirmar (no mientras se muestra el diálogo)');
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const src = read('locales/' + l + '.js');
    assert.ok(/disconnecting:"[^"]{5,}"/.test(src) && /disconnect_done:"[^"]*\{brand\}[^"]*"/.test(src), l);
  }
  assert.ok(read('index.html').includes('.btn.is-busy::before{'), 'indicador visual (con reduced-motion)');
});

// ---------- día de carrera: la devolución no compara contra la sesión de abajo ----------
test('una carrera cargada en Próximos eventos: Zonda comenta la carrera, no "172 min vs 30 min planeados"; un día normal sigue igual', () => {
  const app = loadApp();
  ready(app);
  app.state.profile.trainBy = 'time';
  const raceDay = '2026-11-08';
  const d = { day: 'sun', typeKey: 'long', dist: 4, durMin: 30, timeBased: true, status: 'done' };
  const run = { id: 9, date: new Date(2026, 10, 8, 9, 0, 0).toISOString(), distanceKm: 20.8, durationSec: 172 * 60 };
  // sin carrera ese día: la comparación de siempre (para que el test pruebe el cambio)
  app.state.event = null; app.state.lastEventDate = null; app.state.profile.raceDate = null;
  assert.match(app.buildSessionFeedbackMessage(d, run, 'mal'), /172 min.*planeado|172 min.*30 min/s);
  // con la carrera cargada ese día
  app.state.event = { date: raceDay, name: 'Media maratón', distanceKm: 21 };
  let msg = app.buildSessionFeedbackMessage(d, run, 'mal');
  assert.match(msg, /Vi tu carrera: 172 min a /);
  assert.doesNotMatch(msg, /planeado|tenías/, 'no compara con el plan');
  // ya pasó y el evento se archivó en lastEventDate
  app.state.event = null; app.state.lastEventDate = raceDay;
  assert.match(app.buildSessionFeedbackMessage(d, run, 'excelente'), /Vi tu carrera/);
  // la meta del perfil también cuenta
  app.state.lastEventDate = null; app.state.profile.raceDate = raceDay;
  assert.match(app.buildSessionFeedbackMessage(d, run, 'bien'), /Vi tu carrera/);
  assert.equal(app.raceInfoForDate('2026-11-09'), null, 'otro día: no es carrera');
  assert.equal(app.localIsoOfTimestamp('no es fecha'), null);
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) assert.ok(/coach_feedback_race:"[^"]*\{actual\}[^"]*\{pace\}[^"]*"/.test(read('locales/' + l + '.js')), l);
  // calificar una carrera: no se ofrece "bajar la intensidad" por la sesión normal de abajo
  assert.ok(SRC.includes("if(value === 'mal' && !wasRace){"));
  assert.ok(SRC.includes("const raceDay = state.weekStart ? raceInfoForDate(addDaysToIsoLocal(state.weekStart, idx)) : null;"));
});

test('aviso push de carga: un día de carrera no se compara con la sesión normal de ese día', () => {
  const { planFor } = require('../api/_lib/notify-new-run');
  const plan = [0, 1, 2, 3, 4, 5, 6].map(i => ({ day: i, typeKey: 'long', dist: 4, durMin: 30 }));
  const run = { date: '2026-11-08T14:00:00Z', distanceKm: 20.8, durationSec: 172 * 60 };
  assert.ok(planFor(run, plan, '2026-11-02', 'UTC', true), 'sin carrera: compara con el plan');
  assert.equal(planFor(run, plan, '2026-11-02', 'UTC', true, ['2026-11-08']), null, 'el día de la carrera: no compara');
  assert.equal(planFor(run, plan, '2026-11-02', 'UTC', false, ['2026-11-01', '2026-11-08']), null);
  assert.ok(planFor(run, plan, '2026-11-02', 'UTC', true, ['2026-11-15']), 'otra fecha de carrera: sigue comparando');
  assert.ok(read('api/_lib/notify-new-run.js').includes('eventDate:data->event->>date,lastEventDate:data->>lastEventDate,goalRaceDate:data->profile->>raceDate'));
});
// ---------- sacar Strava al lanzar (interruptor) ----------
test('interruptor de Strava (servidor): con STRAVA_SUNSET=1 los endpoints dejan de hacer algo; sin la variable pasan tal cual', () => {
  const { guardStravaSunset, stravaSunset } = require('../api/_lib/strava-sunset');
  let called = 0;
  const h = (req, res) => { called++; res.status(200).json({ real: true }); };
  const mkRes = () => { const r = { code: null, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  delete process.env.STRAVA_SUNSET;
  assert.equal(stravaSunset(), false);
  let r = mkRes(); guardStravaSunset(h, 'gone')({}, r);
  assert.equal(called, 1); assert.equal(r.body.real, true);
  process.env.STRAVA_SUNSET = '1';
  try {
    r = mkRes(); guardStravaSunset(h, 'gone')({}, r);
    assert.equal(r.code, 410); assert.equal(r.body.error, 'strava_sunset');
    r = mkRes(); guardStravaSunset(h, 'ok')({}, r);
    assert.equal(r.code, 200); assert.equal(r.body.skipped, 'strava_sunset');
    assert.equal(called, 1, 'el endpoint real no se llamó');
  } finally { delete process.env.STRAVA_SUNSET; }
  const gone = ['strava-init', 'strava-auth', 'strava-sync-now'], ok = ['strava-resync', 'sync-strava', 'strava-webhook'];
  for (const f of gone) assert.ok(read('api/' + f + '.js').includes("guardStravaSunset(module.exports, 'gone');"), f);
  for (const f of ok) assert.ok(read('api/' + f + '.js').includes("guardStravaSunset(module.exports, 'ok');"), f);
  assert.ok(!/strava-sunset/.test(read('api/strava-disconnect.js')) && !/strava-sunset/.test(read('api/delete-account.js')), 'desconectar y borrar la cuenta siguen funcionando');
});

test('interruptor de Strava (app): apagado no cambia nada; encendido pasa las carreras a manuales sin source ni stravaId, marcadas origin strava + aiExcluded, y no toca las demás', () => {
  const app = loadApp();
  ready(app);
  app.state.runs = [
    { id: 1, date: '2026-10-01T10:00:00Z', distanceKm: 5, durationSec: 1800, source: 'strava', stravaId: 77 },
    { id: 2, date: '2026-10-02T10:00:00Z', distanceKm: 3, durationSec: 1000 },
    { id: 3, date: '2026-10-03T10:00:00Z', distanceKm: 8, durationSec: 2900, source: 'garmin', garminId: 'g1' },
  ];
  app.sunsetStrava();
  assert.equal(app.state.runs[0].source, 'strava', 'apagado: no pasa nada');
  app.setStravaSunset(true);
  app.sunsetStrava();
  const [a, b, c] = app.state.runs;
  assert.equal(a.source, undefined); assert.equal(a.stravaId, undefined);
  assert.equal(a.origin, 'strava'); assert.equal(a.aiExcluded, true);
  assert.equal(a.distanceKm, 5, 'conserva la carrera');
  assert.deepEqual(b, { id: 2, date: '2026-10-02T10:00:00Z', distanceKm: 3, durationSec: 1000 });
  assert.equal(c.source, 'garmin'); assert.equal(c.garminId, 'g1');
  assert.ok(!app.aiVisibleRuns().some(r => r.id === 1), 'sigue fuera de la IA');
  assert.ok(app.isRestrictedRun(a));
  // la desconexión espera a que lo convertido esté guardado
  assert.ok(SRC.includes('await waitForPendingPersist();\n    if(hasPendingBackup()) return;'));
  assert.ok(SRC.includes("fetch(apiUrl('/api/strava-disconnect')"));
});

test('interruptor de Strava: el SQL de lanzamiento convierte sin tocar lo demás, y la guía del lanzamiento existe', () => {
  const sql = read('sql/strava_sunset.sql');
  assert.ok(sql.includes("(r - 'source' - 'stravaId') || '{\"origin\":\"strava\",\"aiExcluded\":true}'::jsonb"));
  assert.ok(sql.includes('ORDER BY ord') && sql.includes("r->>'source' = 'strava'"), 'conserva el orden y solo toca las de Strava');
  assert.ok(sql.indexOf('SELECT count(*)') < sql.indexOf('UPDATE public.app_state'), 'primero el control, después el UPDATE');
  const doc = read('docs/strava-sunset.md');
  assert.ok(doc.includes('STRAVA_SUNSET=1') && doc.includes('sql/strava_sunset.sql') && doc.includes('strava_connections'));
  assert.ok(read('index.html').includes('conn-row conn-row-featured conn-strava') && read('index.html').includes('body.strava-sunset .conn-strava{display:none;}'));
  assert.ok(SRC.includes('let STRAVA_SUNSET = false;'), 'el interruptor viene apagado');
});

// ---------- entrada en calor y vuelta a la calma: se ven en la tarjeta y los relojes las traen ----------
test('la tarjeta de hoy suma la entrada en calor y la vuelta a la calma (plan por tiempo: con el total; por distancia: sin el total)', () => {
  const app = loadApp();
  const p = { name: 'x', weeklyKm: 20, currentWeeklyKm: 20, goal: '10k', runnerType: 'active', trainingDays: ['mon', 'thu', 'sat'], units: 'metric', trainBy: 'time', terrain: 'asfalto', hrZones: app.computeZones(190), hrMax: 190 };
  app.state.profile = p;
  app.state.plan = app.generatePlan(p, 3);
  const easy = app.state.plan.find(x => x.typeKey === 'easy');
  easy.durMin = 25; easy.timeBased = true;
  assert.equal(JSON.stringify(app.warmCoolMinutes(easy)), '{"warm":5,"cool":5}');
  assert.equal(app.planWarmCoolText(easy), 'Incluye 5 min de calentamiento, 25 min de tramo principal y 5 min de vuelta a la calma');
  assert.equal(app.planShownAmountText(easy), '35 min', 'por tiempo la cantidad que se ve ya trae el calentamiento y la vuelta a la calma');
  assert.equal(app.planAmountText(easy), '25 min', 'el tramo principal sigue siendo 25');
  const quality = app.state.plan.find(x => ['tempo', 'intervals', 'hills', 'fartlek', 'progression'].includes(x.typeKey));
  if (quality) assert.equal(JSON.stringify(app.warmCoolMinutes(quality)), '{"warm":10,"cool":5}', 'las sesiones de calidad: 10 de calentamiento');
  p.trainBy = 'distance';
  assert.equal(app.planWarmCoolText(easy), 'Más 5 min de calentamiento y 5 min de vuelta a la calma', 'por distancia no hay total en minutos');
  assert.equal(app.planShownAmountText(easy), app.planAmountText(easy), 'por distancia la cantidad que se ve es la del tramo principal');
  for (const d of [null, { dist: 0 }, { typeKey: 'rest', dist: 0 }, { typeKey: 'easy', dist: 5, raceDay: true }]) assert.equal(app.warmCoolMinutes(d), null);
  assert.equal(app.planWarmCoolText({ typeKey: 'rest', dist: 0 }), '');
  // la misma regla que el texto de la sesión y el envío al reloj
  assert.equal(app.watchDayPayload(easy, '2026-11-10').warmupMin, 5);
  assert.equal(app.watchDayPayload(easy, '2026-11-10').cooldownMin, 5);
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) assert.ok(/plan_warmcool_line:"[^"]*\{warm\}[^"]*\{cool\}[^"]*"/.test(read('locales/' + l + '.js')) && /plan_warmcool_breakdown:"[^"]*\{main\}[^"]*"/.test(read('locales/' + l + '.js')), l);
  assert.ok(read('index.html').includes('id="home-next-total"'));
  assert.ok(SRC.includes("nextTotalEl.textContent = raceToday ? '' : planWarmCoolText(today);"));
});

test('los cuatro relojes reciben la entrada en calor y la vuelta a la calma como pasos propios (una sesión de 25 min de zona 2 son 3 pasos)', () => {
  const { buildGarminWorkout } = require('../api/_lib/garmin-workout-builder');
  const { buildCorosCourse } = require('../api/_lib/coros-workout-builder');
  const { buildWahooPlan } = require('../api/_lib/wahoo-plan-builder');
  const { buildGuide } = require('../api/_lib/suunto-guide-builder');
  const Z = [[100, 120], [120, 140], [140, 155], [155, 170], [170, 190]];
  const day = { date: '2026-11-10', name: 'Rodaje', typeKey: 'easy', zone: 2, timeBased: true, durMin: 25, distKm: 6.5, warmupMin: 5, cooldownMin: 5 };
  const g = buildGarminWorkout(day, Z).segments[0].steps;
  assert.deepEqual(g.map(s => s.intensity), ['WARMUP', 'ACTIVE', 'COOLDOWN']);
  assert.deepEqual(g.map(s => s.durationValue).slice(0, 3), [300, 1500, 300], 'Garmin: 5 + 25 + 5 minutos');
  const c = buildCorosCourse(day, Z, {}).sections;
  assert.deepEqual(c.map(s => s.targetValue), [300, 1500, 300], 'COROS: 5 + 25 + 5 minutos');
  const w = JSON.stringify(buildWahooPlan(day, Z, {}));
  assert.ok(w.includes('Warm up') && w.includes('Cool down'), 'Wahoo');
  const s = JSON.stringify(buildGuide(day, Z, {}));
  assert.ok(/Warm/.test(s) && /Cool/.test(s), 'Suunto');
});

// ---------- la app guía el calentamiento y la vuelta a la calma (por distancia y por tiempo) ----------
function planToday(app, patch) {
  const idx = (new Date().getDay() + 6) % 7;
  const base = app.state.plan.find(x => x.typeKey === 'easy') || app.state.plan.find(x => x.dist > 0);
  app.state.plan[idx] = Object.assign({}, base, { raceDay: false, interval: undefined }, patch);
  return app.state.plan[idx];
}

test('plan por DISTANCIA: calentamiento y vuelta a la calma por tiempo, y los 5 km se miden desde que termina el calentamiento', () => {
  const app = loadApp();
  ready(app);
  app.state.profile.trainBy = 'distance';
  planToday(app, { typeKey: 'easy', dist: 5, zone: 2, timeBased: false, durMin: undefined });
  app.setSelectedRunMode && app.setSelectedRunMode('plan');
  const tr = app.getTracker();
  tr.elapsedSec = 0; tr.distanceKm = 0; tr.running = true;
  app.setupWorkoutGuide();
  const w = tr.workout;
  assert.equal(w.wc.stage, 'warm');
  assert.equal(w.wc.warmSec, 300, 'rodaje: 5 min de calentamiento');
  assert.equal(w.wc.coolSec, 300);
  assert.equal(app.sessionProgress(), null, 'durante el calentamiento no hay progreso del tramo principal');
  tr.elapsedSec = 240; tr.distanceKm = 0.6; app.tickWorkoutGuide();
  assert.equal(w.wc.stage, 'warm', 'a los 4 min todavía calienta');
  tr.elapsedSec = 300; tr.distanceKm = 0.7; app.tickWorkoutGuide();
  assert.equal(w.wc.stage, 'main');
  assert.equal(w.wc.mainStartDistanceKm, 0.7);
  assert.equal(app.sessionProgress().frac, 0, 'el principal arranca en 0 aunque ya haya 0,7 km corridos');
  tr.distanceKm = 0.7 + 2.5; tr.elapsedSec = 900;
  assert.ok(Math.abs(app.sessionProgress().frac - 0.5) < 1e-9, 'a los 2,5 km del principal es la mitad');
  tr.distanceKm = 0.7 + 4.99; app.tickWorkoutGuide();
  assert.equal(w.wc.stage, 'main', 'faltan 10 m: todavía no termina');
  tr.distanceKm = 0.7 + 5; tr.elapsedSec = 1700; app.tickWorkoutGuide();
  assert.equal(w.wc.stage, 'cool', 'cumplidos los 5 km del principal arranca la vuelta a la calma');
  tr.elapsedSec = 1700 + 299; app.tickWorkoutGuide();
  assert.equal(w.wc.stage, 'cool');
  tr.elapsedSec = 1700 + 300; app.tickWorkoutGuide();
  assert.equal(w.wc.stage, 'end');
});

test('plan por TIEMPO: 25 min de zona 2 son 25 min de principal después de 5 de calentamiento, y los 5 de vuelta a la calma van aparte', () => {
  const app = loadApp();
  ready(app);
  app.state.profile.trainBy = 'time';
  planToday(app, { typeKey: 'easy', dist: 6.5, zone: 2, timeBased: true, durMin: 25 });
  const tr = app.getTracker();
  tr.elapsedSec = 0; tr.distanceKm = 0; tr.running = true;
  app.setupWorkoutGuide();
  const w = tr.workout;
  tr.elapsedSec = 300; app.tickWorkoutGuide();
  assert.equal(w.wc.stage, 'main');
  tr.elapsedSec = 300 + 1499; app.tickWorkoutGuide();
  assert.equal(w.wc.stage, 'main');
  tr.elapsedSec = 300 + 1500; app.tickWorkoutGuide();
  assert.equal(w.wc.stage, 'cool', '25 min después de calentar empieza la vuelta a la calma');
});

test('series: "Ya calenté" salta el calentamiento y arranca las repeticiones; la vuelta a la calma empieza al terminar la última', () => {
  const app = loadApp();
  ready(app);
  const tr = app.getTracker();
  tr.elapsedSec = 200; tr.distanceKm = 0.5; tr.running = true;
  tr.workout = { phase: 'pending', currentRep: 0, phaseStartDistanceKm: 0, phaseStartElapsedSec: 0, structure: { typeKey: 'intervals', planTypeKey: 'intervals', reps: 2, repMeters: 400, recoveryMin: 1, warmMin: 10, coolMin: 5 },
    wc: { stage: 'warm', warmSec: 600, coolSec: 300, stageStartElapsedSec: 0, mainStartElapsedSec: 0, mainStartDistanceKm: 0 } };
  app.skipWarmCool();
  assert.equal(tr.workout.wc.stage, 'main');
  assert.equal(tr.workout.phase, 'effort', 'en las series, saltar el calentamiento arranca la repetición 1');
  assert.equal(tr.workout.currentRep, 1);
  tr.workout.phase = 'done'; tr.elapsedSec = 900; app.tickWorkoutGuide();
  assert.equal(tr.workout.wc.stage, 'cool');
  app.skipWarmCool();
  assert.equal(tr.workout.wc.stage, 'end', '"Terminar ahora" cierra la vuelta a la calma');
});

test('al retomar una carrera recuperada se conservan las etapas; si venía de antes de esta función no se inventa un calentamiento a mitad de carrera', () => {
  const app = loadApp();
  ready(app);
  planToday(app, { typeKey: 'easy', dist: 5, zone: 2, timeBased: false });
  const tr = app.getTracker();
  tr.elapsedSec = 1500; tr.distanceKm = 4;
  app.setupWorkoutGuide({ typeKey: 'continuous', planTypeKey: 'easy', phase: 'continuous', currentRep: 0, phaseStartDistanceKm: 0, phaseStartElapsedSec: 0, wc: { stage: 'cool', stageStartElapsedSec: 1400, mainStartElapsedSec: 300, mainStartDistanceKm: 0.7 } });
  assert.equal(tr.workout.wc.stage, 'cool');
  assert.equal(tr.workout.wc.mainStartDistanceKm, 0.7);
  app.setupWorkoutGuide({ typeKey: 'continuous', planTypeKey: 'easy', phase: 'continuous', currentRep: 0, phaseStartDistanceKm: 0, phaseStartElapsedSec: 0 });
  assert.equal(tr.workout.wc, null, 'sin etapas guardadas no hay calentamiento ni vuelta a la calma');
  assert.ok(SRC.includes('wc: tracker.workout.wc || null'), 'las etapas se guardan junto con el progreso');
});

test('el test de nivel (Cooper) y la carrera libre no llevan calentamiento guiado; las 6 lenguas traen los textos nuevos', () => {
  const app = loadApp();
  ready(app);
  planToday(app, { typeKey: 'test', dist: 3, zone: undefined });
  const tr = app.getTracker();
  tr.elapsedSec = 0; tr.distanceKm = 0;
  app.setupWorkoutGuide();
  assert.ok(!tr.workout || !tr.workout.wc, 'el test son 12 minutos exactos desde que arranca');
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const src = read('locales/' + l + '.js');
    for (const k of ['run_guide_tag_warm', 'run_guide_tag_cool', 'run_guide_warm_hint', 'run_guide_cool_hint', 'run_guide_warm_next', 'run_guide_skip_warm', 'run_guide_skip_warm_reps', 'run_guide_skip_cool', 'voice_warm_start', 'voice_warm_done_reps', 'voice_cool_start', 'voice_cool_done']) assert.ok(new RegExp(k + ':"[^"]{3,}"').test(src), l + ' ' + k);
    assert.ok(/voice_warm_start:"[^"]*\{dur\}/.test(src) && /voice_cool_start:"[^"]*\{dur\}/.test(src) && /run_guide_warm_next:"[^"]*\{what\}/.test(src), l + ' placeholders');
  }
  assert.ok(read('index.html').includes('id="workout-guide-warmcool"') && read('index.html').includes('data-on-click="skipWarmCool()"'));
});

// ---------- plan adaptativo ----------
test('dos sesiones seguidas sin hacer: la próxima sesión de calidad baja 15 %, una vez por semana, con aviso; con una sola no pasa nada', () => {
  const app = loadApp();
  ready(app);
  app.state.onboarded = true;
  app.state.profile = { name: 'x', weeklyKm: 30, currentWeeklyKm: 30, goal: '10k', runnerType: 'active', trainingDays: ['mon', 'tue', 'thu', 'sat', 'sun'], units: 'metric', trainBy: 'distance', terrain: 'asfalto', hrZones: app.computeZones(190), hrMax: 190 };
  const gen = app.generatePlan({ name: 'x', weeklyKm: 30, currentWeeklyKm: 30, goal: '10k', runnerType: 'active', trainingDays: ['mon', 'tue', 'thu', 'sat', 'sun'], units: 'metric', trainBy: 'distance', terrain: 'asfalto', hrZones: app.computeZones(190), hrMax: 190 }, 6);
  const q = gen.find(d => d.dist > 0 && ['intervals', 'tempo', 'hills', 'fartlek', 'progression'].includes(d.typeKey));
  const easy = gen.find(d => d.dist > 0 && d.typeKey === 'easy');
  assert.ok(q && easy, 'el plan de prueba trae una sesión de calidad y una suave');
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const rest = i => ({ day: days[i], dist: 0, typeKey: 'rest' });
  const plan = days.map((_, i) => rest(i));
  plan[0] = Object.assign({}, easy, { day: 'mon', status: undefined });
  plan[1] = Object.assign({}, easy, { day: 'tue', status: undefined });
  plan[4] = Object.assign({}, q, { day: 'fri', status: undefined });
  app.state.plan = plan;
  const before = plan[4].dist;
  plan[0].status = 'skipped';
  app.softenQualityAfterMisses(4);
  assert.equal(plan[4].dist, before, 'con una sola sin hacer no se toca nada');
  plan[1].status = 'skipped';
  app.softenQualityAfterMisses(4);
  assert.ok(plan[4].dist < before, 'dos seguidas: baja la próxima sesión de calidad: ' + before + ' -> ' + plan[4].dist);
  assert.equal(app.state.softenedWeek, app.state.weekStart);
  const msg = app.state.chat[app.state.chat.length - 1];
  assert.ok(msg && msg.noAi === true && /15/.test(msg.text), 'avisa, sin IA');
  const after = plan[4].dist;
  app.softenQualityAfterMisses(4);
  assert.equal(plan[4].dist, after, 'una sola vez por semana');
});

test('dos faltazos NO tocan una sesión suave, un día de carrera ni el test de nivel (solo la de calidad)', () => {
  const app = loadApp();
  ready(app);
  app.state.onboarded = true;
  const plan = [0, 1, 2, 3, 4, 5, 6].map(i => ({ day: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][i], dist: 0, typeKey: 'rest' }));
  plan[0] = { day: 'mon', dist: 5, typeKey: 'easy', status: 'skipped' };
  plan[1] = { day: 'tue', dist: 5, typeKey: 'easy', rating: 'mal', status: 'done' };
  plan[3] = { day: 'thu', dist: 8, typeKey: 'long' };
  plan[4] = { day: 'fri', dist: 3, typeKey: 'test' };
  app.state.plan = plan;
  app.softenQualityAfterMisses(3);
  assert.equal(plan[3].dist, 8);
  assert.equal(plan[4].dist, 3);
  assert.ok(!app.state.softenedWeek);
});

// ---------- recalibrar los ritmos ----------
function recalSetup(app, paceMin, nRuns, opts) {
  opts = opts || {};
  const p = { name: 'x', weeklyKm: 30, currentWeeklyKm: 30, goal: '10k', runnerType: 'active', trainingDays: ['mon', 'tue', 'thu', 'sat', 'sun'], units: 'metric', trainBy: 'distance', terrain: 'asfalto', hrZones: app.computeZones(190), hrMax: 190 };
  p.levelTest = { done: true, date: '2026-08-01', vdot: 40, paces: app.trainingPacesFromVdot(40) };
  Object.assign(p.levelTest, opts.lt || {});
  app.state.profile = p;
  app.state.onboarded = true;
  const gen = app.generatePlan(p, 6);
  const easy = gen.find(d => d.dist > 0 && d.typeKey === 'easy');
  const z2 = p.hrZones[2], hr = Math.round((z2.min + z2.max) / 2);
  const now = Date.now();
  app.state.runs = []; app.state.planHistory = [];
  for (let k = 0; k < nRuns; k++) {
    const runDate = now - (k + 1) * 6 * 864e5;
    const dKm = 1.4 * easy.dist + 2, secs = Math.round(dKm * paceMin * 60);
    const pts = [], ts = [], hrs = [];
    for (let s = 0; s <= secs; s += 10) { pts.push({ t: s, lat: 40 + (s / 60 / paceMin) / 111.19, lon: -3 }); ts.push(s); hrs.push(hr); }
    const id = 'rr' + k;
    app.state.runs.push({ id, date: runDate, distanceKm: dKm, durationSec: secs, points: pts, series: { t: ts, hr: hrs } });
    const plan = [0, 1, 2, 3, 4, 5, 6].map(i => ({ day: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][i], dist: 0, typeKey: 'rest' }));
    plan[0] = Object.assign({}, easy, { status: 'done', linkedRunId: id });
    app.state.planHistory.push({ weekStart: '2026-10-' + String(5 + k).padStart(2, '0'), plan });
  }
  return { now };
}

test('recalibrar ritmos: 4 rodajes suaves con el pulso en zona y bastante más rápidos que el rango proponen subir, moviendo solo la mitad (tope 5 %)', () => {
  const app = loadApp();
  ready(app);
  const { now } = recalSetup(app, 5.0, 4);
  const sug = app.paceRecalibrationSuggestion(now);
  assert.ok(sug, 'hay sugerencia');
  assert.equal(sug.dir, 'up');
  assert.equal(sug.n, 4);
  assert.equal(sug.newVdot, 42, 'el tope de 5 % sobre 40');
  app.state.chat = [];
  app.applyPaceRecalibration(sug);
  assert.equal(app.state.profile.levelTest.vdot, 42);
  assert.equal(app.state.profile.levelTest.prevVdot, 40);
  assert.ok(app.state.profile.levelTest.recalibratedAt);
  assert.equal(JSON.stringify(app.state.profile.levelTest.paces), JSON.stringify(app.trainingPacesFromVdot(42)));
  assert.ok(app.state.chat[app.state.chat.length - 1].noAi === true);
  assert.equal(app.paceRecalibrationSuggestion(now), null, 'no vuelve a proponer durante 21 días');
});

test('recalibrar ritmos: con 3 rodajes, con pulso fuera de zona, de Strava, o con ritmos dentro del rango no se propone nada; más lento propone bajar', () => {
  const app = loadApp();
  ready(app);
  let c = recalSetup(app, 5.0, 3);
  assert.equal(app.paceRecalibrationSuggestion(c.now), null, 'poca evidencia');
  c = recalSetup(app, 5.0, 4);
  app.state.runs.forEach(r => { r.source = 'strava'; });
  assert.equal(app.paceRecalibrationSuggestion(c.now), null, 'Strava no cuenta');
  c = recalSetup(app, 5.0, 4);
  app.state.runs.forEach(r => { r.series.hr = r.series.hr.map(() => 185); });
  assert.equal(app.paceRecalibrationSuggestion(c.now), null, 'pulso fuera de la zona: el ritmo no dice nada');
  const lt = app.trainingPacesFromVdot(40);
  c = recalSetup(app, (lt.easy[0] + lt.easy[1]) / 2, 4);
  assert.equal(app.paceRecalibrationSuggestion(c.now), null, 'ritmo dentro del rango suave: nada que corregir');
  c = recalSetup(app, 8.0, 4);
  const down = app.paceRecalibrationSuggestion(c.now);
  assert.ok(down && down.dir === 'down' && down.newVdot < 40 && down.newVdot >= 38, JSON.stringify(down));
  c = recalSetup(app, 5.0, 4, { lt: { recalibratedAt: new Date(c.now - 5 * 864e5).toISOString().slice(0, 10) } });
  assert.equal(app.paceRecalibrationSuggestion(c.now), null, 'ya se recalibró hace menos de 21 días');
  c = recalSetup(app, 5.0, 4);
  app.state.paceRecalDeclinedAt = new Date(c.now - 3 * 864e5).toISOString().slice(0, 10);
  assert.equal(app.paceRecalibrationSuggestion(c.now), null, 'dijo que no hace poco');
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) for (const k of ['pace_recal_up', 'pace_recal_down', 'pace_recal_yes', 'pace_recal_no', 'pace_recal_done']) assert.ok(new RegExp(k + ':"[^"]{3,}"').test(read('locales/' + l + '.js')), l + ' ' + k);
});

// ---------- días de la semana que viene ----------
test('los días elegidos para la semana que viene arman SOLO esa semana; el perfil conserva los de siempre; una elección vieja se ignora', () => {
  const app = loadApp();
  ready(app);
  const p = { name: 'x', weeklyKm: 30, currentWeeklyKm: 30, goal: '10k', runnerType: 'active', trainingDays: ['mon', 'wed', 'fri'], units: 'metric', trainBy: 'distance', terrain: 'asfalto', hrZones: app.computeZones(190), hrMax: 190 };
  app.state.profile = p;
  app.state.onboarded = true;
  app.state.weekNumber = 6;
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.plan = app.generatePlan(p, 6);
  const sessionDays = plan => plan.filter(d => d.dist > 0 && !d.raceDay).map(d => d.day).join();
  assert.equal(sessionDays(app.getNextWeekPlan().plan), 'mon,wed,fri', 'sin elección: los de siempre');
  const nextIso = app.addDaysToIsoLocal(app.state.weekStart, 7);
  app.state.nextWeekDays = { weekStart: nextIso, days: ['tue', 'thu', 'sat', 'sun'] };
  const nxt = app.getNextWeekPlan();
  assert.equal(sessionDays(nxt.plan), 'tue,thu,sat,sun', 'con elección: esos días');
  assert.equal(p.trainingDays.join(), 'mon,wed,fri', 'el perfil no se toca');
  app.state.nextWeekDays = { weekStart: '2000-01-03', days: ['tue', 'thu'] };
  assert.equal(sessionDays(app.getNextWeekPlan().plan), 'mon,wed,fri', 'una elección de otra semana no cuenta');
  app.state.nextWeekDays = { weekStart: nextIso, days: ['tue'] };
  assert.equal(sessionDays(app.getNextWeekPlan().plan), 'mon,wed,fri', 'menos de 2 días no se aplica');
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) for (const k of ['weekdays_title', 'weekdays_desc', 'weekdays_confirm', 'weekdays_keep', 'weekdays_saved', 'weekdays_range']) assert.ok(new RegExp(k + ':"[^"]{3,}"').test(read('locales/' + l + '.js')), l + ' ' + k);
  const html = read('index.html');
  assert.ok(html.includes('id="home-weekdays-card"') && html.includes('data-on-click="confirmNextWeekDays()"') && html.includes('data-on-click="dismissNextWeekDays()"'));
  assert.ok(SRC.includes("'home-recap-card', 'home-weekdays-card'"), 'entra en el tope de dos avisos');
  assert.ok(SRC.includes('data-on-click="toggleNextWeekDay('), 'sin handlers inline: usa data-on-click');
});
