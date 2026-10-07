const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Un "<!-- ... -->" dentro de <style> NO es un comentario de CSS: el parser toma el texto como parte del selector de la
// regla que sigue y la descarta en silencio (así quedaron sin estilo el track del switch de Notificaciones y la barra de
// progreso del onboarding). Los comentarios dentro de <style> tienen que ser /* ... */.
test('index.html: no hay comentarios HTML (<!-- -->) dentro de <style>', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]);
  assert.ok(blocks.length > 0);
  for (const css of blocks) assert.ok(!/<!--|-->/.test(css), 'hay un comentario HTML dentro de un bloque <style>');
});
