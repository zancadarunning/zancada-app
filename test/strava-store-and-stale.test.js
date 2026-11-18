// Strava solo en la web (se oculta en las apps de tienda) y el cartel "sincronización desactualizada" no aparece si Strava ya no está conectado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8'), html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('la app de tienda oculta la conexión con Strava y la web no', () => {
  assert.match(html, /body\.strava-store \.conn-strava\{display:none;\}/);
  assert.match(app, /function markStoreBuild\(\)/);
  assert.match(app, /sunsetStrava\(\);\s*markStoreBuild\(\);/);
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) assert.match(fs.readFileSync(path.join(root, 'locales', l + '.js'), 'utf8'), /perfil_connectivity_hint_store:"/, l);
});

test('cartel de Strava desactualizado: no aparece sin Strava conectado, sí con Strava conectado y sync vieja', () => {
  const a = loadApp();
  a.state.stravaSync = { lastSuccessAt: new Date(Date.now() - 15 * 86400000).toISOString() };
  a.setDeviceConnections({ strava: true }); a.setDeviceConnectionsLoaded(true);
  assert.ok(a.getStravaSyncIssue(), 'conectado y sin sincronizar hace 15 días: avisa');
  a.setDeviceConnections({ strava: false });   // lo desconectó para pasarse a Garmin
  assert.equal(a.getStravaSyncIssue(), null, 'desconectado: no avisa');
});

test('el ingreso con Google siempre deja elegir la cuenta de Google (prompt=select_account)', () => {
  assert.match(app, /signInWithOAuth\(\{ provider:'google', options:\{ redirectTo: window\.location\.origin, queryParams:\{ prompt:'select_account' \} \} \}\)/);
});
