// Cada botón/campo de la app llama, con data-on-click / data-on-change / etc., a una función de la propia app (js/ui-events.js solo ejecuta esas).
// Si una función se borra, se renombra o tiene un error de tipeo, el botón queda MUDO sin ningún error visible (como pasó con los días del calendario).
// Este test junta todos los manejadores escritos en el HTML y dentro de las plantillas de app.js y comprueba que cada función exista.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadApp } = require('./support/load-app');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ATTR = /data-on-(?:click|input|change|submit|keydown|keyup|error|load)=(?:"([^"]*)"|'([^']*)')/g;
const KEYWORDS = new Set(['if', 'else', 'return', 'function', 'typeof']);

function handlers() {
  const out = [];
  for (const f of ['index.html', 'privacy.html', 'terms.html', 'eliminar-cuenta.html', 'app.js', ...fs.readdirSync(path.join(ROOT, 'js')).filter(x => x.endsWith('.js') && x !== 'ui-events.js').map(x => 'js/' + x)]) {
    const text = read(f);
    for (const m of text.matchAll(ATTR)) {
      // lo que va dentro de ${...} en una plantilla de JS se calcula antes: solo cuenta lo que queda escrito en el atributo
      const code = (m[1] !== undefined ? m[1] : m[2]).replace(/\$\{[^}]*\}/g, '0');
      out.push({ file: f, code });
    }
  }
  return out;
}

test('hay manejadores que revisar (el test no se queda vacío)', () => {
  assert.ok(handlers().length > 100, 'solo se encontraron ' + handlers().length);
});

test('toda función que llaman los botones y campos existe en la app', () => {
  const app = loadApp();
  const exists = name => { try { return vm.runInContext('typeof ' + name, app) === 'function'; } catch (e) { return false; } };
  const missing = new Set();
  for (const { file, code } of handlers()) {
    for (const m of code.matchAll(/(^|[^\w.$])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = m[2];
      if (KEYWORDS.has(name)) continue;
      if (!exists(name)) missing.add(`${file}: ${name}() en «${code.slice(0, 60)}»`);
    }
  }
  assert.deepEqual([...missing], [], 'hay botones que llaman a funciones que no existen');
});
