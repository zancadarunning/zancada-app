// Aviso propio antes del permiso de ubicación del sistema: una sola vez, y sin él no arranca la carrera.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

function setup(accept) {
  const app = loadApp();
  app.persist = () => Promise.resolve();
  const asked = [];
  app.showConfirm = (msg, opts) => { asked.push({ msg, opts }); return Promise.resolve(accept); };
  app.state.geoDisclosureAccepted = undefined;
  return { app, asked };
}
const tick = () => new Promise(r => setTimeout(r, 5));

test('primera carrera: se muestra el aviso de ubicación y, al continuar, queda aceptado y arranca', async () => {
  const { app, asked } = setup(true);
  app.startRunWithCountdown();
  await tick();
  assert.equal(asked.length, 1);
  assert.match(asked[0].msg, /GPS/);
  assert.equal(app.state.geoDisclosureAccepted, true);
});

test('si dice "Ahora no", no queda aceptado y no empieza la cuenta regresiva', async () => {
  const { app, asked } = setup(false);
  app.startRunWithCountdown();
  await tick();
  assert.equal(asked.length, 1);
  assert.ok(!app.state.geoDisclosureAccepted);
});

test('con el aviso ya aceptado no vuelve a preguntar', async () => {
  const { app, asked } = setup(true);
  app.state.geoDisclosureAccepted = true;
  assert.equal(app.needsGeoDisclosure(), false);
  app.startRunWithCountdown();
  await tick();
  assert.equal(asked.length, 0);
});

test('el aviso existe en los 6 idiomas con texto y botones', () => {
  const fs = require('node:fs'), path = require('node:path');
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.js'), 'utf8');
    for (const k of ['geo_disclosure_text', 'geo_disclosure_ok', 'geo_disclosure_no']) assert.ok(s.includes(k + ':'), l + ' ' + k);
  }
});
