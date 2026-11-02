// Garmin en la app: tarjeta de conexión, atribución obligatoria "Garmin [modelo]", datos fuera de la IA y vuelta del login.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('app.js');
const html = read('index.html');

test('Perfil tiene la tarjeta de Garmin Connect con su estado, el botón y el aviso de que no va a la IA; y está en "importar historial"', () => {
  for (const id of ['garmin-status', 'garmin-connect-btn', 'garmin-perm-note']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('data-on-click="connectGarmin()"'));
  assert.ok(html.includes('data-i18n="garmin_not_for_ai"'));
  assert.ok(html.includes('closeHistoryImport(); connectGarmin()'), 'fila en importar historial');
  assert.ok(html.includes('src="img/brand-logos/garmin.png"') && fs.existsSync(path.join(__dirname, '..', 'img/brand-logos/garmin.png')));
  assert.ok(html.includes('>Garmin Connect<'), 'se usa el nombre completo de la app, como pide la guía de marca');
});

test('las funciones de Garmin existen y la conexión se refresca con las demás (estado, plan al reloj, desconexión)', () => {
  for (const fn of ['connectGarmin', 'disconnectGarmin', 'updateGarminStatusDisplay', 'syncPlanToGarmin', 'scheduleGarminSync']) assert.ok(new RegExp('function ' + fn + '\\(').test(app), fn);
  assert.match(app, /garmin: pick\('garmin', g\.data\)/);
  assert.match(app, /updateGarminStatusDisplay\(\)\]\)\.then\(stopLoading\)/);
  // el login de Garmin vuelve a la dirección registrada en el portal de Garmin (garmin-callback), no a /api/garmin-auth
  assert.match(app, /link\.p === 'garmin' \? '\/api\/garmin-callback'/);
  assert.match(app, /\(strava\|polar\|wahoo\|suunto\|coros\|garmin\)/);
  // solo se abre una dirección de Garmin (no una que devuelva otro servidor)
  assert.match(app, /connect\\\.garmin\\\.com/);
  // si no se puede avisar a Garmin la desconexión, NO se simula
  const d = app.slice(app.indexOf('async function disconnectGarmin'), app.indexOf('/* ---- Health Connect'));
  assert.ok(d.includes('garmin_disconnect_error') && d.includes('return;'));
});

test('atribución de Garmin: "Garmin [modelo]" (sin repetir "Garmin") en el historial, el detalle, las imágenes y el video; sin modelo, solo "Garmin"', () => {
  const a = loadApp();
  assert.equal(a.garminAttribution({ source: 'garmin', device: 'Forerunner 265' }), 'Garmin Forerunner 265');
  assert.equal(a.garminAttribution({ source: 'garmin', device: 'Garmin fenix 8' }), 'Garmin fenix 8');
  assert.equal(a.garminAttribution({ source: 'garmin' }), 'Garmin');
  assert.equal(a.garminAttribution({ source: 'garmin', device: 'unknown' }), 'Garmin', 'una actividad manual no tiene modelo de reloj');
  assert.equal(a.garminAttribution({ source: 'strava', device: 'x' }), '', 'solo para datos de Garmin');
  assert.match(a.sourceBadgeHtml('garmin', false, { source: 'garmin', device: 'Forerunner 265' }), />Garmin Forerunner 265</);
  assert.ok(!/<script/.test(a.sourceBadgeHtml('garmin', false, { source: 'garmin', device: '<script>x</script>' })), 'el modelo se escapa');
  assert.match(app, /sourceBadgeHtml\(r\.source, true, r\)/);
  assert.match(app, /garmin-attr[^`]*escapeHtml\(garminAttribution\(r\)\)/);
  assert.match(app, /drawShareAttribution\(ctx, W, H, garminAttribution\(r\)\);\s*canvas\.toBlob/);
  assert.match(app, /ctx\.fillText\(garminAttribution\(r\), W-40, 124\)/);
  assert.match(app, /garmin_derived_note/);
});

test('las carreras de Garmin nunca llegan a Zonda', () => {
  const a = loadApp();
  assert.ok(a.aiVisibleRuns, 'existe aiVisibleRuns');
});

test('los textos de Garmin existen en los 6 idiomas', () => {
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = read('locales/' + l + '.js');
    for (const k of ['garmin_connect', 'perfil_garmin_desc', 'garmin_connect_error', 'garmin_disconnect_error', 'garmin_no_workout_permission', 'garmin_not_for_ai', 'garmin_derived_note']) assert.ok(s.includes(k + ':"'), l + ' ' + k);
  }
});

test('Garmin recibe esta semana y la próxima (hasta 14 sesiones), no solo la semana en curso', () => {
  const body = app.slice(app.indexOf('async function syncPlanToGarmin'), app.indexOf('async function connectGarmin'));
  assert.ok(body.includes('const { all: win, weekStart } = watchWindow();'));
  assert.match(read('api/garmin-push-plan.js'), /const MAX_DAYS = 14;/);
});
