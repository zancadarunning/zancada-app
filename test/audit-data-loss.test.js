// Auditoría 2026-11-03, grupo 1: pérdida de datos (guardado del inicio, respaldo local, carreras borradas que reaparecen, Health Connect).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const { knownRunIds } = require('../api/_lib/known-run-ids');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').split(String.fromCharCode(13)).join('');

test('una cuenta a mitad del inicio no sube nada: persist() con onboarded:false no escribe (antes dejaba un estado vacío que rompía la cuenta)', async () => {
  const calls = [];
  const app = loadApp({ onUpsert(p) { calls.push(p); return Promise.resolve({ data: null, error: null }); } });
  app.setCurrentUserId('u-inicio');
  app.state.nativePushEnabled = true;
  await app.persist();
  assert.equal(calls.length, 0, 'sin onboarded no se escribe');
  app.state.onboarded = true;
  await app.persist();
  assert.equal(calls.length, 1, 'terminado el inicio, sí');
});

test('isOnboardingShell: reconoce la cáscara vacía que dejaba un inicio sin terminar y no confunde una cuenta real', () => {
  const app = loadApp();
  assert.equal(app.isOnboardingShell({ onboarded: false, profile: {}, plan: [], runs: [], nativePushEnabled: true, consent: { v: 2 } }), true);
  assert.equal(app.isOnboardingShell({ profile: {} }), true);
  assert.equal(app.isOnboardingShell({ onboarded: true, profile: {}, plan: [], runs: [] }), false, 'onboarded manda');
  assert.equal(app.isOnboardingShell({ onboarded: false, profile: { name: 'Ana' }, plan: [], runs: [] }), false, 'con perfil no es cáscara');
  assert.equal(app.isOnboardingShell({ runs: [{ id: 1 }] }), false, 'con carreras no es cáscara (cuenta vieja sin la marca onboarded)');
  assert.equal(app.isOnboardingShell({ plan: [{ typeKey: 'rest' }] }), false);
  assert.equal(app.isOnboardingShell(null), false);
  assert.ok(SRC.includes('!isOnboardingShell(data.data)'), 'loadUserAndEnter la usa');
});

function setBackupState(app, serverState) { app.setState(Object.assign({ onboarded: true, profile: { name: 'X' }, plan: [], runs: [], shoes: [], chat: [], lang: 'es' }, serverState)); }

test('respaldo local MÁS VIEJO que el servidor: la carrera grabada en la app que solo está en el respaldo se suma (antes se perdía para siempre)', () => {
  const app = loadApp();
  setBackupState(app, { runs: [{ id: 1, source: 'garmin', garminId: 'g1', distanceKm: 5 }] });   // el servidor escribió después: llegó la carrera del reloj
  const pending = { ts: 1000, data: { onboarded: true, profile: { name: 'X' }, plan: [], shoes: [], chat: [], lang: 'es',
    runs: [{ id: 1, source: 'garmin', garminId: 'g1' }, { id: 2, distanceKm: 3 }, { id: 3, source: 'strava', stravaId: 9 }] } };
  const changed = app.applyPendingBackup(pending, 5000);
  assert.equal(changed, true);
  const ids = app.getState().runs.map(r => r.id);
  assert.deepEqual(ids, [1, 2], 'se suma la grabada en la app (id 2); la de Strava del respaldo no (se vuelve a sincronizar sola) y la 1 no se duplica');
  assert.equal(app.getState().runs[0].distanceKm, 5, 'lo del servidor no se toca');
});

test('respaldo local más viejo y sin nada propio que rescatar: no cambia nada', () => {
  const app = loadApp();
  setBackupState(app, { runs: [{ id: 1, source: 'garmin' }] });
  assert.equal(app.applyPendingBackup({ ts: 1, data: { runs: [{ id: 1, source: 'garmin' }] } }, 99), false);
});

test('respaldo MÁS NUEVO y completo: se usa tal cual', () => {
  const app = loadApp();
  setBackupState(app, { runs: [{ id: 1 }] });
  const changed = app.applyPendingBackup({ ts: 9000, data: { onboarded: true, profile: { name: 'Y' }, plan: [], shoes: [], chat: [], runs: [{ id: 1 }, { id: 2 }], lang: 'es' } }, 100);
  assert.equal(changed, true);
  assert.deepEqual(app.getState().runs.map(r => r.id), [1, 2]);
  assert.equal(app.getState().profile.name, 'Y');
});

test('respaldo REDUCIDO más nuevo: se le devuelven los puntos GPS, las series y el chat viejo que el servidor ya tenía (antes se subía recortado y borraba todo eso)', () => {
  const app = loadApp();
  setBackupState(app, {
    runs: [{ id: 1, points: [{ lat: 1, lon: 1, t: 1 }], series: { t: [1] } }, { id: 2, points: [{ lat: 2, lon: 2, t: 2 }], series: { t: [2] } }],
    chat: [{ role: 'user', text: 'viejo', ts: 10 }, { role: 'coach', text: 'viejo2', ts: 20 }, { role: 'user', text: 'reciente', ts: 100 }]
  });
  const changed = app.applyPendingBackup({ ts: 9000, reduced: true, data: { onboarded: true, profile: { name: 'X' }, plan: [], shoes: [], lang: 'es',
    runs: [{ id: 1, points: [], series: null }, { id: 2, points: [{ lat: 2, lon: 2, t: 2 }], series: { t: [2] } }],
    chat: [{ role: 'user', text: 'reciente', ts: 100 }] } }, 100);
  assert.equal(changed, true);
  const s = app.getState();
  assert.equal(s.runs[0].points.length, 1, 'puntos GPS de la carrera 1 devueltos');
  assert.deepEqual(s.runs[0].series, { t: [1] });
  assert.deepEqual(s.chat.map(m => m.ts), [10, 20, 100], 'mensajes viejos del chat devueltos, sin duplicar el reciente');
});

test('borrar una carrera importada anota su clave de proveedor; vencen a los 45 días y hay tope; las claves se leen por proveedor', () => {
  const app = loadApp();
  app.state.dismissedRuns = [{ k: 'strava:1', t: Date.now() - 46 * 86400000 }, { k: 'strava:2', t: Date.now() - 86400000 }];
  app.dismissRun({ id: 7, stravaId: 555, healthConnectId: 'hc-9', garminId: 'g7' });
  const keys = app.state.dismissedRuns.map(d => d.k);
  assert.ok(!keys.includes('strava:1'), 'la de hace 46 días venció');
  assert.ok(keys.includes('strava:2') && keys.includes('strava:555') && keys.includes('healthconnect:hc-9') && keys.includes('garmin:g7'));
  assert.deepEqual([...app.dismissedIdsFor('healthconnect')], ['hc-9']);
  assert.deepEqual([...app.dismissedIdsFor('strava')].sort(), ['2', '555']);
  for (let i = 0; i < 300; i++) app.dismissRun({ stravaId: 1000 + i });
  assert.ok(app.state.dismissedRuns.length <= 200, 'tope de 200');
  assert.ok(SRC.includes('dismissRun(run);\n  state.runs.splice(idx,1);'), 'deleteRun la usa');
});

test('el backend no vuelve a traer lo que la persona borró: knownRunIds suma las claves descartadas (id numérico o texto)', () => {
  const data = { runs: [{ stravaId: 10 }, { stravaId: 11 }], dismissedRuns: [{ k: 'strava:12', t: 1 }, { k: 'polar:abc', t: 1 }, { k: 'strava:', t: 1 }, null, { k: 5 }] };
  const strava = knownRunIds(data, 'stravaId', 'strava');
  assert.ok(strava.has(10) && strava.has(11) && strava.has(12) && strava.has('12'));
  assert.ok(!strava.has('abc'), 'las claves de otro proveedor no cuentan');
  const polar = knownRunIds(data, 'polarId', 'polar');
  assert.ok(polar.has('abc'));
  assert.equal(knownRunIds(null, 'stravaId', 'strava').size, 0);
  for (const f of ['coros-auth', 'coros-sync-now', 'coros-sync', 'polar-auth', 'polar-sync-now', 'polar-sync', 'strava-auth', 'strava-sync-now', 'sync-strava', 'suunto-sync-now', 'suunto-sync', 'wahoo-auth', 'wahoo-sync-now', 'wahoo-sync']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'api', f + '.js'), 'utf8');
    assert.ok(src.includes('knownRunIds('), f + ' usa knownRunIds');
    assert.ok(!/new Set\(\(stateRows\[0\]\.data && stateRows\[0\]\.data\.runs \|\| \[\]\)/.test(src), f + ' no arma knownIds a mano');
  }
});

test('refreshStateFromServer: con menos carreras en el servidor solo se vuelve a subir si hay un respaldo pendiente (si no, el servidor las borró a propósito)', () => {
  assert.ok(SRC.includes('if(incomingRuns < currentRuns && hasPendingBackup()){'));
});

test('la carrera recién terminada tiene copia local durable ANTES de limpiar el progreso, y persist() también la deja si no escribe', () => {
  const close = SRC.slice(SRC.indexOf('async function closeSummary'), SRC.indexOf('const SESSION_MIN_FRACTION'));
  const iBackup = close.indexOf('savePendingBackup();');
  const iClear = close.lastIndexOf('clearRunProgress();');
  assert.ok(iBackup > 0 && iClear > iBackup, 'savePendingBackup antes del último clearRunProgress');
  const persistBody = SRC.slice(SRC.indexOf('async function persist()'), SRC.indexOf('function waitForPendingPersist'));
  assert.ok(/\} else \{\s*savePendingBackup\(\);/.test(persistBody), 'la rama skipWrite deja respaldo');
});

test('Health Connect se lee solo: al abrir/volver a la app (visibilitychange) y al tirar para refrescar, con tope de frecuencia', () => {
  assert.ok(SRC.includes('autoSyncHealthConnect();\n});'), 'visibilitychange');
  assert.ok(SRC.includes('await autoSyncHealthConnect(true);'), 'pull to refresh');
  assert.ok(SRC.includes('10 * 60 * 1000'), 'como mucho una vez cada 10 minutos');
  assert.ok(SRC.includes("dismissedIdsFor('healthconnect')"), 'no reimporta lo borrado a mano');
});
