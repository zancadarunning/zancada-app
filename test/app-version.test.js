// test/app-version.test.js
//
// checkForAppUpdate() en app.js pide solo los primeros bytes del archivo (Range) para no
// gastar datos en cada regreso a la app, en vez de descargarlo entero solo para leer una
// constante. Eso solo funciona si APP_VERSION es literalmente la primera línea del
// archivo -- si algún cambio futuro le agrega algo arriba (un comentario, un 'use strict',
// un reordenamiento de un merge), el Range deja de alcanzar a incluirla, la detección de
// versión nueva deja de dispararse, y la app deja de actualizarse sola sin que nada lo
// avise -- exactamente lo que pasó una vez ya (ver el comentario junto a la constante en
// app.js). Este test es la única red de seguridad automática contra que vuelva a pasar.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('APP_VERSION es la primera línea de app.js (necesario para que el Range chico de checkForAppUpdate la alcance a leer)', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const firstLine = appJs.split('\n')[0];
  assert.match(firstLine, /^const APP_VERSION = '[^']+';$/);
});
