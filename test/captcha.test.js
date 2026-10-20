// test/captcha.test.js
//
// Captcha (Cloudflare Turnstile) en el registro y el inicio de sesión: getCaptchaToken pide un token de un solo uso y NUNCA bloquea a
// la persona: si el script no cargó o falla, devuelve null y la app intenta igual sin token (el servidor decide).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

test('getCaptchaToken: sin el script de Turnstile devuelve null enseguida (no bloquea el inicio de sesión)', async () => {
  const app = loadApp();
  assert.equal(await app.getCaptchaToken('captcha-login'), null);
});

test('getCaptchaToken: con Turnstile pide el token a pedido y lo devuelve; el siguiente pedido reinicia el widget', async () => {
  const app = loadApp();
  const calls = [];
  let callback;
  app.window.turnstile = {
    render: (el, opts) => { calls.push('render:' + opts.execution + ':' + opts.appearance + ':' + opts.sitekey); callback = opts.callback; return 'w1'; },
    execute: id => { calls.push('execute:' + id); setTimeout(() => callback('tok-1'), 0); },
    reset: id => { calls.push('reset:' + id); }
  };
  const el = app.document.getElementById('captcha-login');
  assert.ok(el, 'el contenedor existe en la pantalla');
  assert.equal(await app.getCaptchaToken('captcha-login'), 'tok-1');
  assert.match(calls[0], /^render:execute:interaction-only:0x4/);
  // segundo pedido: reinicia y vuelve a ejecutar (los tokens son de un solo uso)
  assert.equal(await app.getCaptchaToken('captcha-login'), 'tok-1');
  assert.deepEqual(calls.slice(-2), ['reset:w1', 'execute:w1']);
});

test('getCaptchaToken: si Turnstile falla o tarda de más devuelve null', async () => {
  const app = loadApp();
  app.window.turnstile = {
    render: (el, opts) => { setTimeout(() => opts['error-callback'](), 0); return 'w9'; },
    execute() {}, reset() {}
  };
  assert.equal(await app.getCaptchaToken('captcha-signup'), null);
  app.window.turnstile = { render: () => 'w10', execute() {}, reset() {} };
  const t0 = Date.now();
  assert.equal(await app.getCaptchaToken('captcha-confirm', 40), null);
  assert.ok(Date.now() - t0 < 1000);
});

test('withCaptcha agrega el token solo si existe; translateAuthError traduce el rechazo del captcha', () => {
  const app = loadApp();
  assert.equal(JSON.stringify(app.withCaptcha('abc', { data: { lang: 'es' } })), JSON.stringify({ data: { lang: 'es' }, captchaToken: 'abc' }));
  assert.equal(JSON.stringify(app.withCaptcha(null, { redirectTo: 'x' })), JSON.stringify({ redirectTo: 'x' }));
  assert.equal(app.translateAuthError({ message: 'captcha protection: request disallowed (invalid-input-response)' }), app.t('captcha_failed'));
  assert.notEqual(app.translateAuthError({ message: 'captcha protection: request disallowed' }), app.t('generic_error'));
});
