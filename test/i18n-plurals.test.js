// test/i18n-plurals.test.js
//
// t() acepta plurales dentro del propio texto: {n|carrera|carreras} sale "carrera" si n vale 1 y "carreras" en cualquier otro caso.
// Sin esto la app decía "Te faltan 1 carreras" o "Recuperá trotando suave 1 minutos" (esto último lo lee en voz alta el aviso de la sesión).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadApp } = require('./support/load-app');

const LANGS = ['es', 'en', 'pt', 'fr', 'it', 'de'];

function inLang(app, lang, key, vars) {
  vm.runInContext('lang = ' + JSON.stringify(lang), app);
  return app.t(key, vars);
}

test('t(): {n|uno|otros} usa el singular solo cuando vale 1', () => {
  const app = loadApp();
  assert.equal(inLang(app, 'es', 'ach_locked_runs_left', { n: 1 }), 'Te falta 1 carrera');
  assert.equal(inLang(app, 'es', 'ach_locked_runs_left', { n: 4 }), 'Te faltan 4 carreras');
  assert.equal(inLang(app, 'es', 'perfil_shoes_count', { n: 1 }), '1 zapatilla registrada');
  assert.equal(inLang(app, 'es', 'perfil_shoes_count', { n: 2 }), '2 zapatillas registradas');
  assert.equal(inLang(app, 'en', 'rp_when', { date: 'Sunday', n: 1 }), 'Sunday · in 1 day');
  assert.equal(inLang(app, 'en', 'rp_when', { date: 'Sunday', n: 3 }), 'Sunday · in 3 days');
  assert.equal(inLang(app, 'pt', 'ach_locked_streak_left', { n: 1 }), 'Falta 1 semana');
  assert.equal(inLang(app, 'fr', 'heat_stats', { n: 1, km: '5 km' }), '1 course avec GPS · 5 km');
  assert.equal(inLang(app, 'it', 'cal_native_added', { n: 1 }), 'Fatto: 1 allenamento nel tuo calendario');
  assert.equal(inLang(app, 'de', 'ps_runs', { n: 1, km: '5 km' }), 'In diesem Zeitraum: 1 Lauf (5 km).');
});

test('el aviso de voz dice "1 minuto" y "1 segundo", no "1 minutos"', () => {
  const app = loadApp();
  for (const [lang, one, many] of [['es', '1 minuto', '2 minutos'], ['en', '1 minute', '2 minutes'], ['pt', '1 minuto', '2 minutos'], ['fr', '1 minute', '2 minutes'], ['it', '1 minuto', '2 minuti'], ['de', '1 Minute', '2 Minuten']]) {
    vm.runInContext('lang = ' + JSON.stringify(lang), app);
    assert.equal(app.fmtDurationSpoken(60), one, lang);
    assert.equal(app.fmtDurationSpoken(120), many, lang);
  }
  vm.runInContext('lang = "es"', app);
  assert.equal(app.fmtDurationSpoken(61), '1 minuto 1 segundo');
  assert.equal(app.fmtDurationSpoken(1), '1 segundo');
  assert.equal(app.fmtDurationSpoken(90), '1 minuto 30 segundos');
});

test('un valor que no se pasa deja el marcador tal cual y los textos sin plural siguen igual', () => {
  const app = loadApp();
  vm.runInContext('lang = "es"', app);
  assert.equal(app.t('ach_locked_runs_left'), 'Te {n|falta|faltan} {n} {n|carrera|carreras}');
  assert.equal(app.t('ach_locked_runs_left', { x: 1 }), 'Te {n|falta|faltan} {n} {n|carrera|carreras}');
  assert.equal(app.t('confirm_email_back'), 'Usar otro email');
});

test('cada idioma usa las mismas variables de plural que es.js en cada clave', () => {
  const sandbox = {}; sandbox.window = sandbox; vm.createContext(sandbox);
  for (const l of LANGS) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.js'), 'utf8'), sandbox, { filename: l + '.js' });
  // la gramática cambia de un idioma a otro (cuántas palabras concuerdan en número), así que se compara QUÉ variables tienen plural, no cuántas veces
  const plural = s => [...new Set([...String(s).matchAll(/\{(\w+)\|[^|{}]*\|[^|{}]*\}/g)].map(m => m[1]))].sort().join(',');
  const es = sandbox.I18N.es;
  for (const k of Object.keys(es)) {
    const base = plural(es[k]);
    if (!base) continue;
    for (const l of LANGS) assert.equal(plural(sandbox.I18N[l][k]), base, `${l}.${k}`);
  }
  // el marcador con "|" tiene que quedar siempre bien cerrado: ninguna llave suelta
  for (const l of LANGS) for (const [k, v] of Object.entries(sandbox.I18N[l])) {
    const stripped = String(v).replace(/\{\w+\|[^|{}]*\|[^|{}]*\}/g, '').replace(/\{\w+\}/g, '');
    assert.ok(!/[{}]/.test(stripped), `${l}.${k} tiene una llave mal cerrada: ${v}`);
  }
});
