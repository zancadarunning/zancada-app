const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('../api/_lib/huawei-activity-helpers');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// Forma del ejemplo oficial de GET /healthkit/v2/activityRecords (distancia en metros, tiempos en milisegundos)
const rec = (over) => Object.assign({
  id: '1623018048263', name: 'Carrera', startTime: 1623018048263, endTime: 1623021648263, activeTime: 3500000, timeZone: '-0300', activityType: 56,
  activitySummary: { dataSummary: [
    { dataTypeName: 'com.huawei.continuous.distance.total', value: [{ fieldName: 'distance', floatValue: 8200.4 }] },
    { dataTypeName: 'com.huawei.continuous.exercise_heart_rate.statistics', value: [{ fieldName: 'avg', floatValue: 152.3 }, { fieldName: 'max', floatValue: 171 }] }
  ] }
}, over || {});

test('una carrera de Huawei se convierte al formato de Zancada (distancia, duración, FC, fecha local con su desfase)', () => {
  const r = rec();
  assert.ok(h.isImportableRecord(r));
  const run = h.recordToRun(r);
  assert.equal(run.source, 'huawei');
  assert.equal(run.huaweiId, '1623018048263');
  assert.equal(run.id, 'huawei_1623018048263');
  assert.equal(run.distanceKm, 8.2004);
  assert.equal(run.durationSec, 3500);
  assert.equal(run.avgHr, 152);
  assert.equal(run.maxHr, 171);
  assert.deepEqual(run.points, [], 'la primera versión no trae ruta');
  assert.match(run.date, /^2021-06-06T19:20:48-03:00$/, 'fecha local con el desfase real (igual que Polar), para detectar duplicados contra otras fuentes');
  assert.equal(run.planMonday, '2021-05-31');
});

test('solo se importan carreras (56, 57, 128, 130) con distancia o tiempo reales', () => {
  for (const t of [56, 57, 128, 130]) assert.ok(h.isImportableRecord(rec({ activityType: t })), 'tipo ' + t);
  assert.ok(!h.isImportableRecord(rec({ activityType: 97 })), 'otro deporte');
  assert.ok(!h.isImportableRecord(rec({ endTime: 1623018048263 })), 'sin duración');
  assert.ok(!h.isImportableRecord(rec({ activitySummary: { dataSummary: [] }, activeTime: 0 })), 'sin distancia ni tiempo');
  assert.ok(!h.isImportableRecord(null));
});

test('si falta la frecuencia cardíaca o las calorías la carrera se importa igual, sin ese dato', () => {
  const run = h.recordToRun(rec({ activitySummary: { dataSummary: [{ dataTypeName: 'com.huawei.continuous.distance.total', value: [{ fieldName: 'distance', floatValue: 5000 }] }] } }));
  assert.equal(run.distanceKm, 5);
  assert.equal(run.avgHr, null);
  assert.equal(run.calories, null);
});

test('el desfase horario "+0800" / "-0300" se interpreta bien', () => {
  assert.equal(h.tzOffsetMinutes('+0800'), 480);
  assert.equal(h.tzOffsetMinutes('-0300'), -180);
  assert.equal(h.tzOffsetMinutes('basura'), 0);
});

test('Huawei queda fuera de Zonda y de los avisos igual que Garmin, Wahoo y Polar', () => {
  assert.match(read('app.js'), /const AI_RESTRICTED_SOURCES = \[[^\]]*'huawei'/);
  assert.match(read('api/_lib/notify-new-run.js'), /RESTRICTED_SOURCES = new Set\(\[[^\]]*'huawei'/);
  assert.match(read('api/_lib/weekly-summary.js'), /RESTRICTED_SOURCES = \[[^\]]*'huawei'/);
});

test('la conexión de Huawei sale APAGADA hasta que Huawei apruebe la solicitud', () => {
  const app = read('app.js');
  assert.match(app, /const HUAWEI_ENABLED = false;/);
  assert.match(app, /if\(!HUAWEI_ENABLED\) return;/);
  assert.match(read('index.html'), /id="huawei-card" style="display:none;"/);
});

test('el servidor revoca el permiso de Huawei al desconectar y al borrar la cuenta, y borra la tabla con los demás datos', () => {
  assert.match(read('api/huawei-disconnect.js'), /cancelHuaweiConsent/);
  const del = read('api/delete-account.js');
  assert.match(del, /cancelHuaweiConsent/);
  assert.match(del, /'huawei_connections'/);
  assert.match(read('api/device-status.js'), /huawei: 'huawei_connections'/);
});

test('las claves de Huawei van en el servidor y el cliente solo lleva el ID de la aplicación', () => {
  const app = read('app.js');
  assert.doesNotMatch(app, /HUAWEI_CLIENT_SECRET/);
  assert.match(app, /const HUAWEI_CLIENT_ID = '\d+';/);
  const auth = read('api/huawei-auth.js');
  assert.match(auth, /encToken\(tokenData\.access_token\)/);
  assert.match(auth, /encToken\(tokenData\.refresh_token\)/);
});

test('el SQL de Huawei activa RLS y no deja leer los tokens desde el navegador', () => {
  const sql = read('sql/create_huawei_connections.sql');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /REVOKE SELECT ON public\.huawei_connections FROM anon, authenticated/);
  assert.match(sql, /GRANT\s+SELECT \(user_id\) ON public\.huawei_connections TO authenticated/);
  assert.match(read('sql/merge_huawei_runs.sql'), /REVOKE EXECUTE ON FUNCTION public\.merge_huawei_runs/);
});
