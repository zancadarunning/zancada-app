// "Recordar mi sesión en este dispositivo": con el casillero tildado la sesión se guarda en localStorage (sobrevive cerrar la app);
// destildado, en sessionStorage (se borra al cerrar). Es la sesión, no el correo: el campo de correo no se completa solo.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadApp } = require('./support/load-app');
// dualAuthStorage es un const de app.js (no queda en el objeto global): se lee desde el mismo contexto
const storageOf = app => vm.runInContext('dualAuthStorage', app);

test('recordarme tildado: la sesión va a localStorage y no deja copia en sessionStorage', () => {
  const app = loadApp();
  app.setRememberMe(true);
  storageOf(app).setItem('sb-x-auth-token', 'ABC');
  assert.equal(app.localStorage.getItem('sb-x-auth-token'), 'ABC');
  assert.equal(app.sessionStorage.getItem('sb-x-auth-token'), null);
  assert.equal(storageOf(app).getItem('sb-x-auth-token'), 'ABC');
});

test('recordarme destildado: la sesión va a sessionStorage y no queda en localStorage', () => {
  const app = loadApp();
  app.setRememberMe(false);
  storageOf(app).setItem('sb-x-auth-token', 'ABC');
  assert.equal(app.sessionStorage.getItem('sb-x-auth-token'), 'ABC');
  assert.equal(app.localStorage.getItem('sb-x-auth-token'), null);
  assert.equal(storageOf(app).getItem('sb-x-auth-token'), 'ABC');
});

test('cambiar la preferencia mueve la próxima sesión; cerrar sesión limpia los dos', () => {
  const app = loadApp();
  app.setRememberMe(true); storageOf(app).setItem('k', '1');
  app.setRememberMe(false); storageOf(app).setItem('k', '2');
  assert.equal(app.localStorage.getItem('k'), null, 'no queda la copia vieja en localStorage');
  assert.equal(app.sessionStorage.getItem('k'), '2');
  storageOf(app).removeItem('k');
  assert.equal(app.localStorage.getItem('k'), null); assert.equal(app.sessionStorage.getItem('k'), null);
  assert.equal(app.getRememberMe() === false, true, 'la preferencia en sí se conserva');
});
