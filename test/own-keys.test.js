// Claves de diccionario que vienen de datos del usuario (lang de app_state): 'constructor' / '__proto__' no deben romper nada.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pick, ownKey } = require('../api/_lib/own.js');
const { buildWeeklySummary } = require('../api/_lib/weekly-summary.js');
const { buildMessage } = require('../api/_lib/notify-new-run.js');

test('pick/ownKey ignoran claves heredadas y usan el idioma de respaldo', () => {
  const d = { es: { a: 1 }, en: { a: 2 } };
  for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty', undefined, null, 42, {}]) {
    assert.equal(ownKey(d, bad, 'es'), 'es');
    assert.deepEqual(pick(d, bad, 'es'), { a: 1 });
  }
  assert.equal(ownKey(d, 'en', 'es'), 'en');
});

test('los mensajes del servidor no se rompen con un idioma malicioso', () => {
  const now = Date.now();
  for (const lang of ['constructor', '__proto__', 'toString']) {
    assert.doesNotThrow(() => buildWeeklySummary({ runs: [{ date: new Date(now).toISOString(), distanceKm: 8 }], plan: null, weekStart: null, streak: 0, tz: 'UTC', lang, imperial: false, now }));
    assert.doesNotThrow(() => buildMessage([{ distanceKm: 5, durationSec: 1500, date: new Date(now).toISOString() }], 'strava', lang, false));
  }
});
