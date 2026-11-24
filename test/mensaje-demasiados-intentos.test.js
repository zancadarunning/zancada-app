// Supabase responde 429 si se pide recuperar la contraseña (o un mail) muy seguido. Antes la persona veía "Algo salió mal" y volvía a tocar el botón; ahora se le dice que espere.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

for (const lang of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
  test('429 y "rate limit" muestran el aviso de esperar (' + lang + ')', () => {
    const app = loadApp();
    app.setLangValue(lang);
    const esperar = app.t('auth_rate_limited');
    assert.ok(esperar && esperar !== 'auth_rate_limited');
    assert.equal(app.translateAuthError({ status: 429, message: 'x' }), esperar);
    assert.equal(app.translateAuthError({ message: 'email rate limit exceeded' }), esperar);
    assert.equal(app.translateAuthError({ message: 'For security purposes, you can only request this after 49 seconds.' }), esperar);
    assert.notEqual(app.translateAuthError({ message: 'algo raro' }), esperar);
  });
}
