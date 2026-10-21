// test/export-my-data.test.js
//
// "Descargar mis datos" (portabilidad): un JSON con lo que la app guarda de la persona, sin secretos.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

test('buildPersonalDataExport: incluye los datos de la persona y no el link privado del calendario', async () => {
  const app = loadApp();
  app.state.profile = { name: 'Ana', weight: 60 };
  app.state.runs = [{ id: 'r1', distanceKm: 5, durationSec: 1500, points: [{ lat: 1, lon: 2 }] }];
  app.state.chat = [{ role: 'user', text: 'hola', ts: 1 }];
  app.state.calendarToken = 'token-secreto-del-calendario';
  const out = await app.buildPersonalDataExport();
  const json = JSON.stringify(out);
  assert.equal(out.app, 'Zancada');
  assert.ok(out.exportedAt && !isNaN(new Date(out.exportedAt).getTime()));
  assert.equal(out.data.profile.name, 'Ana');
  assert.equal(out.data.runs.length, 1);
  assert.equal(out.data.runs[0].points.length, 1, 'la ruta completa va incluida');
  assert.equal(out.data.chat[0].text, 'hola');
  assert.ok(!json.includes('token-secreto-del-calendario'), 'sin el link privado del calendario');
  assert.equal(out.data.calendarToken, undefined);
  assert.equal(app.state.calendarToken, 'token-secreto-del-calendario', 'el estado de la app no se modifica');
});

test('exportMyData: entrega un archivo .json con la fecha en el nombre', async () => {
  const app = loadApp();
  app.state.profile = { name: 'Ana' };
  // el entorno de pruebas no trae Blob/File ni el panel de compartir: se les da lo mínimo
  app.window.Blob = Blob; app.window.File = File;
  let shared = null;
  app.window.navigator.canShare = () => true;
  app.window.navigator.share = async data => { shared = data; };
  await app.exportMyData();
  assert.ok(shared && shared.files && shared.files.length === 1, 'se entregó un archivo');
  const file = shared.files[0];
  assert.match(file.name, /^zancada-mis-datos-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(file.type, 'application/json');
  assert.equal(JSON.parse(await file.text()).data.profile.name, 'Ana');
});
