// Los botones de Conectar/Desconectar de cada marca (Strava, Polar, Wahoo, Suunto, COROS, Garmin, Health Connect) son UN solo botón que cambia de acción.
// Bug real: el HTML lleva data-on-click="connectX()" y el código le sumaba además btn.onclick = disconnectX. Con la CSP estricta el despachador de data-on-click
// corre aparte del onclick, así que al tocar "Desconectar" se ejecutaban las dos: se abría el cartel de desconexión Y se mandaba a conectar de nuevo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const BRANDS = ['Strava', 'Polar', 'Wahoo', 'Suunto', 'Coros', 'Garmin', 'HealthConnect'];

test('ningún botón de marca cambia su acción con la propiedad onclick (se ejecutaría además del data-on-click del HTML)', () => {
  assert.doesNotMatch(app, /btn\.onclick\s*=\s*(?:connect|disconnect)\w+/);
});

test('cada marca cambia la acción del botón con data-on-click, en las dos direcciones, y la función existe', () => {
  for (const b of BRANDS) {
    for (const verb of ['connect', 'disconnect']) {
      const fn = verb + b;
      assert.ok(app.includes(`btn.setAttribute('data-on-click', '${fn}()')`), `${fn} se asigna con data-on-click`);
      assert.match(app, new RegExp('(?:async )?function ' + fn + '\\('), `${fn} existe`);
    }
  }
});

test('el HTML arranca cada botón con la acción de conectar (la de desconectar la pone el estado de la conexión)', () => {
  for (const b of ['Strava', 'Polar', 'Wahoo', 'Suunto', 'Coros', 'Garmin', 'HealthConnect']) {
    assert.ok(html.includes(`data-on-click="connect${b}()"`), `connect${b}() en index.html`);
  }
});
