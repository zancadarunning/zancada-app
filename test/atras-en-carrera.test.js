// Hallazgo 2026-11-24: sin un manejo propio, el botón atrás de Android cerraba la app entera en medio de una carrera (y con la barra de abajo escondida es lo primero que se toca para "salir").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('el botón atrás en pleno ejercicio manda la app a segundo plano en vez de cerrarla', () => {
  const i = app.indexOf("AppPlugin.addListener('backButton'");
  assert.ok(i > 0, 'hay un listener de backButton');
  const body = app.slice(i, i + 700);
  assert.match(body, /classList\.contains\('exercising'\)/);
  assert.match(body, /minimizeApp\(\)/);
  assert.match(body, /if\(ev && ev\.canGoBack\) window\.history\.back\(\)/, 'fuera del ejercicio vuelve en el historial (cierra overlays)');
  assert.match(body, /exitApp\(\)/, 'sin historial cierra la app como antes');
  // en el ejercicio se vuelve ANTES de llegar a exitApp
  assert.ok(body.indexOf('minimizeApp') < body.indexOf('exitApp'));
});
