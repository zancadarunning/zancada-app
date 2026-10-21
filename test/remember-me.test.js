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

// ---- correo recordado y gestor de contraseñas ----
function withEmailField(app) {
  const reg = new Map();
  const realGet = app.document.getElementById;
  app.document.getElementById = id => { if (!reg.has(id)) reg.set(id, realGet(id)); return reg.get(id); };
  return id => app.document.getElementById(id);
}

test('el último correo se guarda solo con "recordar" tildado y vuelve escrito; no pisa lo que ya se tipeó', () => {
  const app = loadApp();
  const el = withEmailField(app);
  app.setRememberMe(true);
  app.rememberLastEmail('ana@correo.com');
  assert.equal(app.localStorage.getItem('zancada_last_email'), 'ana@correo.com');
  el('login-email').value = '';
  app.prefillLoginEmail();
  assert.equal(el('login-email').value, 'ana@correo.com');
  el('login-email').value = 'otra@correo.com';
  app.prefillLoginEmail();
  assert.equal(el('login-email').value, 'otra@correo.com', 'no se pisa lo que escribió la persona');
  // destildado (teléfono compartido): se borra y no se completa nada
  app.setRememberMe(false);
  app.rememberLastEmail('ana@correo.com');
  assert.equal(app.localStorage.getItem('zancada_last_email'), null);
  el('login-email').value = '';
  app.prefillLoginEmail();
  assert.equal(el('login-email').value, '');
});

test('offerSavePassword: entrega la credencial al gestor del sistema y avisa al plugin nativo, y NUNCA escribe la contraseña en ningún almacenamiento', async () => {
  const app = loadApp();
  const calls = [];
  app.PasswordCredential = class { constructor(o) { this.o = o; } };
  app.navigator.credentials = { store: async c => { calls.push(['store', c.o.id]); } };
  app.Capacitor = { Plugins: { ZancadaAutofill: { commit: async () => { calls.push(['commit']); } } } };
  await app.offerSavePassword('ana@correo.com', 'Clave-Secreta-123');
  assert.deepEqual(calls, [['store', 'ana@correo.com'], ['commit']]);
  for (const st of [app.localStorage, app.sessionStorage]) {
    for (const k of ['zancada_last_email', 'zancada_remember_me']) { const v = st.getItem(k); assert.ok(v === null || !String(v).includes('Clave-Secreta-123')); }
  }
  // sin esas APIs (navegador viejo, sin plugin) no falla
  const app2 = loadApp();
  await app2.offerSavePassword('ana@correo.com', 'x');
});

test('los formularios de ingreso y registro son <form> con los autocomplete que reconocen los gestores de contraseñas', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<form id="login-form"[^>]*data-on-submit="event\.preventDefault\(\); handleSignIn\(\)"/);
  assert.match(html, /<form id="signup-form"[^>]*data-on-submit="event\.preventDefault\(\); handleSignUp\(\)"/);
  assert.match(html, /id="login-email" name="username" autocomplete="username"/);
  assert.match(html, /id="login-password" name="password" autocomplete="current-password"/);
  assert.match(html, /id="signup-password" name="password" autocomplete="new-password"/);
  assert.match(html, /<button type="submit" class="btn btn-primary" id="login-submit-btn"/);
});

test('offerSavePassword en la app de Android usa savePassword del plugin (hoja del sistema); sin él, cae a commit()', async () => {
  const app = loadApp();
  const calls = [];
  app.Capacitor = { Plugins: { ZancadaAutofill: { savePassword: async o => { calls.push(['savePassword', o.id]); return { saved: true }; }, commit: async () => { calls.push(['commit']); } } } };
  await app.offerSavePassword('ana@correo.com', 'Clave-Secreta-123');
  assert.deepEqual(calls, [['savePassword', 'ana@correo.com']]);
  const app2 = loadApp(); const calls2 = [];
  app2.Capacitor = { Plugins: { ZancadaAutofill: { commit: async () => { calls2.push('commit'); } } } };
  await app2.offerSavePassword('ana@correo.com', 'x');
  assert.deepEqual(calls2, ['commit']);
});

test('offerSavedLogin: completa correo y contraseña con lo que elige la persona en la hoja del sistema, una sola vez, sin enviar el formulario', async () => {
  const app = loadApp();
  const el = withEmailField(app);
  let pedidos = 0;
  app.Capacitor = { Plugins: { ZancadaAutofill: { getPassword: async () => { pedidos++; return { id: 'ana@correo.com', password: 'Clave-Secreta-123' }; } } } };
  await app.offerSavedLogin();
  assert.equal(el('login-email').value, 'ana@correo.com');
  assert.equal(el('login-password').value, 'Clave-Secreta-123');
  await app.offerSavedLogin();
  assert.equal(pedidos, 1, 'no vuelve a abrir la hoja en la misma apertura');
  // cancelar la hoja (sin credencial) no rompe nada ni completa campos
  const app2 = loadApp(); const el2 = withEmailField(app2);
  app2.Capacitor = { Plugins: { ZancadaAutofill: { getPassword: async () => ({}) } } };
  await app2.offerSavedLogin();
  assert.equal(el2('login-email').value, '');
  // en el navegador (sin plugin) no hace nada
  const app3 = loadApp(); await app3.offerSavedLogin();
});
