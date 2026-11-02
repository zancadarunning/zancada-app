// Texto largo que no se pisa con lo de al lado: "PROGRESSION RUN" (Bebas 52px) se montaba sobre "30 MIN" en Inicio en pantallas de ~360 px.
// El maquetado real se verificó en el navegador (6 idiomas x 6 pantallas x 8 tipos de sesión, a 320 y 360 px): estos tests solo fijan que la regla siga ahí.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').split(String.fromCharCode(13)).join('');
const guard = html.slice(html.indexOf('<style id="text-guard-css">'), html.indexOf('</style>', html.indexOf('<style id="text-guard-css">')));

test('la tarjeta de hoy deja de pisarse: la columna del título no baja de su palabra más larga, el dato baja a la línea de abajo si no entran y los tamaños escalan con el ancho', () => {
  assert.ok(guard.length > 200, 'existe el bloque');
  assert.match(guard, /\.next-session\{[^}]*flex-wrap:wrap/);
  assert.match(guard, /\.next-session > :first-child\{[^}]*min-width:min-content/);
  assert.match(guard, /\.next-session > :last-child\{[^}]*flex:0 0 auto/);
  assert.match(guard, /\.next-session \.big\{font-size:clamp\(/);
  assert.match(guard, /\.next-session \.day-dist\{font-size:clamp\([^}]*!important/);
});

test('todo el texto puede cortar una palabra imposible de entrar en vez de salirse de su caja', () => {
  assert.match(guard, /body\{overflow-wrap:break-word;\}/);
  assert.match(guard, /\.display, \.big, h1, h2, h3, h4\{overflow-wrap:break-word; min-width:0;\}/);
});

test('el bloque va después de las reglas que fijan 44/52 px de la tarjeta de hoy, para que gane la cascada', () => {
  const guardAt = html.indexOf('<style id="text-guard-css">');
  const bigRule = html.lastIndexOf('.next-session .big{font-size:52px;}', guardAt);
  assert.ok(bigRule > 0 && bigRule < guardAt, 'la regla de 52px está antes');
  assert.equal(html.indexOf('.next-session .big{font-size:52px;}', guardAt), -1, 'no hay otra después que la pise');
});
