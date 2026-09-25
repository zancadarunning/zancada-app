// test/locales.test.js
//
// t(key, vars) en app.js no tiene ningún aviso cuando falta una clave en el idioma
// activo -- cae en silencio al español (I18N.es[key]), y si ni siquiera existe ahí,
// muestra la clave cruda tal cual. Eso significa que un locale con una clave faltante
// no rompe nada visiblemente: un usuario con lang='fr' viendo texto en español en un
// solo lugar de la app es fácil de no notar durante meses. Reportado en una auditoría:
// pt/fr/de/it se habían quedado sin 19 claves de onboarding y de un toggle de Inicio
// (home_next_see_detail/hide_detail) que sí existían en es/en.
//
// Este test compara el set de claves de cada locale contra es.js (el idioma de
// referencia) y contra cada llamada a t('...') en app.js, para que una clave nueva
// agregada a un solo idioma (o un t() nuevo sin su traducción en los otros 5) se
// detecte acá en vez de en producción.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const APP_JS_PATH = path.join(__dirname, '..', 'app.js');
const LOCALES = ['es', 'en', 'pt', 'fr', 'de', 'it'];

function loadLocaleKeys(loc) {
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(LOCALES_DIR, loc + '.js'), 'utf8'), sandbox, { filename: loc + '.js' });
  return new Set(Object.keys(sandbox.I18N[loc]));
}

test('todos los locales definen exactamente el mismo set de claves que es.js', () => {
  const esKeys = loadLocaleKeys('es');
  for (const loc of LOCALES) {
    if (loc === 'es') continue;
    const keys = loadLocaleKeys(loc);
    const missing = [...esKeys].filter(k => !keys.has(k));
    const extra = [...keys].filter(k => !esKeys.has(k));
    assert.deepEqual(missing, [], `${loc}.js le faltan estas claves que sí están en es.js: ${missing.join(', ')}`);
    assert.deepEqual(extra, [], `${loc}.js tiene claves que no existen en es.js (probablemente código muerto): ${extra.join(', ')}`);
  }
});

test('toda clave usada en app.js con t(\'...\') existe en los 6 locales', () => {
  const appSrc = fs.readFileSync(APP_JS_PATH, 'utf8');
  // Solo las llamadas con un literal simple y completo ('clave' o "clave") -- el literal
  // tiene que terminar en `,` o `)` (con espacio de por medio tolerado). Algo como
  // t('day_'+dayKey) es una clave armada en runtime (no resoluble acá) y quedaría mal
  // capturado como "day_" sin este chequeo -- un falso positivo que no representa una
  // clave real que deba existir en los locales.
  const used = new Set([...appSrc.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+)['"]\s*[,)]/g)].map(m => m[1]));
  assert.ok(used.size > 100, `se esperaban cientos de llamadas a t(), se encontraron ${used.size} -- ¿cambió el patrón de la función?`);

  const keysByLocale = {};
  for (const loc of LOCALES) keysByLocale[loc] = loadLocaleKeys(loc);

  for (const key of used) {
    for (const loc of LOCALES) {
      assert.ok(keysByLocale[loc].has(key), `t('${key}') se usa en app.js pero no existe en locales/${loc}.js`);
    }
  }
});
