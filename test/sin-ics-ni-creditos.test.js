// Se quitó "Agregar al calendario" del próximo evento y el texto de créditos de "Acerca de": que no vuelvan sin querer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('el próximo evento ya no ofrece agregar al calendario (.ics)', () => {
  const app = read('app.js');
  for (const k of ['downloadEventIcs', 'buildEventIcs', 'escapeIcsText', "t('add_to_calendar')"]) assert.ok(!app.includes(k), k);
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) assert.ok(!read('locales/' + l + '.js').includes('add_to_calendar:'), l);
});

test('"Acerca de" ya no lleva el texto de créditos con los nombres de las personas', () => {
  assert.ok(!read('index.html').includes('credits-text'));
  assert.ok(!read('app.js').includes('credits-text'));
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = read('locales/' + l + '.js');
    assert.ok(!s.includes('perfil_credits:'), l);
    assert.ok(!/Agustini/.test(s), l + ' sin nombres');
  }
});
