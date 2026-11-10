// Revision estetica 2026-11-10: celulares angostos (320-360 px), unidades coherentes y respuesta al toque.
// Son pruebas sobre el texto del CSS/HTML/JS (el diseno real se verifico a mano en 320, 360, 375, 390 y 430 px, en los 6 idiomas).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split(String.fromCharCode(13)).join('');
const HTML = read('index.html');
const APP = read('app.js');

test('los selectores de dias de entreno achican las 7 columnas en vez de salirse de la pantalla', () => {
  assert.match(HTML, /#perfil-days, #perfil-sport-days, #home-weekdays-picker\{grid-template-columns:repeat\(7, minmax\(0, 1fr\)\);\}/);
  assert.match(HTML, /#perfil-days \.day-pill[^{]*\{min-height:0; min-width:0;/);
});

test('las medallas de Logros usan una grilla que se adapta al ancho y no se sale de la tarjeta', () => {
  assert.match(HTML, /\.pr-medal-grid\{grid-template-columns:repeat\(auto-fill, minmax\(84px, 1fr\)\);\}/);
  assert.match(HTML, /\.pr-info small\{white-space:normal;/, 'la fecha y el ritmo del record ya no se cortan');
});

test('el rojo del borrar no asoma en reposo en ninguna lista deslizable (antes solo Historial)', () => {
  assert.match(HTML, /\n  \.swipe-item:not\(:has\(\.swipe-content\[style\*="translate3d\(-"\]\)\) \.swipe-action-delete\{visibility:hidden;\}/);
});

test('la pagina no se ensancha mientras entra una pestana nueva', () => {
  assert.match(HTML, /html, body\{overflow-x:clip;\}/);
});

test('zapatillas: el nombre va en su propio elemento para que el terreno (ASFALTO / TRAIL) nunca se corte', () => {
  assert.ok(APP.includes('<div class="n"><span class="shoe-name">${escapeHtml(s.name)}</span> <span class="tag tag-${s.terrain}">'));
  assert.match(HTML, /\.shoe-row \.shoe-info \.n \.shoe-name\{min-width:0; overflow:hidden; text-overflow:ellipsis;/);
});

test('Relojes y conectividad: en pantallas angostas la fila reduce margenes para que quepan logo, etiqueta y flecha', () => {
  assert.match(HTML, /@media \(max-width:370px\)\{\s*#devices-overlay \.card\{padding-left:12px; padding-right:12px;\}/);
});

test('Check-in: se apila la pregunta arriba de las opciones en celulares angostos (y siempre en aleman)', () => {
  assert.match(HTML, /@media \(max-width:369px\)\{\s*\.rd3-row\{flex-wrap:wrap;/);
  assert.match(HTML, /:lang\(de\) \.rd3-row\{flex-wrap:wrap;/);
});

test('lo tocable que no cambiaba al presionarlo ahora responde (tarjeta de proxima sesion, compartir, tu progreso, selectores)', () => {
  assert.match(HTML, /\.next-session:active, \.avatar-big-wrap:active, \.day-pill:active[^{]*\{transform:scale\(\.96\);\}/);
  assert.match(HTML, /\.pred-head:active[^{]*\{opacity:\.6;\}/);
  assert.match(HTML, /\.run-mode-card:active, \.date-box:active, \.choice:active\{background:var\(--press\);\}/);
});

test('el rotulo "distancia total" no repite la unidad ni dice "km" si la persona usa millas', () => {
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const m = read('locales/' + l + '.js').match(/hist_total_km:"([^"]*)"/);
    assert.ok(m, l);
    assert.doesNotMatch(m[1], /\bkm\b/i, l + ': "' + m[1] + '"');
  }
});

test('el ritmo de las tarjetas "entrenamiento de hoy" lleva la unidad de la persona (min/km o min/mi)', () => {
  assert.doesNotMatch(APP, /getElementById\('home-done-pace-label'\)\.textContent = t\('run_pace'\)/);
  assert.doesNotMatch(APP, /getElementById\('run-done-pace-label'\)\.textContent = t\('run_pace'\)/);
  assert.ok(APP.includes("getElementById('home-done-pace-label').textContent = t('run_pace_word') + ' /' + distUnit();"));
  assert.ok(APP.includes("getElementById('run-done-pace-label').textContent = t('run_pace_word') + ' /' + distUnit();"));
});

test('el rotulo visible de la distancia del evento tambien sigue la unidad (antes solo el placeholder)', () => {
  assert.ok(APP.includes("document.querySelector('label[for=\"ev-distance\"]')"));
});

test('aleman: textos cortos donde la palabra larga no entraba en un boton', () => {
  const de = read('locales/de.js');
  assert.match(de, /readiness_ok:"Okay"/);
  assert.match(de, /perfil_zones_title:"Deine Herzfrequenz-Zonen"/);
});
