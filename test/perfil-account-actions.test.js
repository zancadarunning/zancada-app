// Final de Perfil: "Borrar mis datos" y "Eliminar mi cuenta" juntas en la tarjeta de ajustes, "Cerrar sesión" sola al final; y la reconfirmación con
// contraseña antes de borrar (cuentas con contraseña la piden de nuevo; Google/Apple solo confirman).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadApp } = require('./support/load-app');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('Perfil: "Eliminar mi cuenta" es una fila justo debajo de "Borrar mis datos" y "Cerrar sesión" queda sola al final', () => {
  const reset = html.indexOf('data-on-click="resetApp()"');
  const del = html.indexOf('data-on-click="deleteAccount()"');
  const logout = html.lastIndexOf('data-on-click="confirmLogout()"');
  assert.ok(reset > 0 && del > reset, 'la cuenta va después de los datos');
  assert.ok(logout > del, 'cerrar sesión va al final');
  assert.equal(html.match(/data-on-click="deleteAccount\(\)"/g).length, 1, 'un solo punto de entrada');
  assert.match(html.slice(reset, del), /<\/button>\s*<button type="button" class="set-row" $/, 'es otra fila de la misma tarjeta');
  assert.doesNotMatch(html.slice(del, logout).replace(/<button[^>]*admin-row[\s\S]*?<\/button>/, ''), /btn-danger/, 'ya no hay un botón rojo suelto');
  assert.match(html.slice(del, del + 200), /perfil_delete_account/);
});

test('no queda nada de la verificación en dos pasos en la pantalla', () => {
  assert.doesNotMatch(html, /mfa-|toggleMfa|submitMfaChallenge|confirmMfaSetup/);
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.doesNotMatch(app, /ensureMfa|mfaNeedsChallenge|refreshMfaRow|\.auth\.mfa\./);
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.js'), 'utf8'), /\bmfa_/, l);
});

function setup(provider) {
  const app = loadApp();
  const client = vm.runInContext('supabaseClient', app);
  client.auth.getSession = async () => ({ data: { session: { access_token: 'token-actual', user: { email: 'a@b.com', app_metadata: { provider } } } } });
  return { app, client };
}

test('borrar con cuenta de contraseña: pide la contraseña, vuelve a iniciar sesión y usa el token nuevo', async () => {
  const { app, client } = setup('email');
  app.showConfirm = async () => ({ password: 'Clave1234' });
  let used = null;
  client.auth.signInWithPassword = async o => { used = o; return { data: { session: { access_token: 'token-nuevo' } }, error: null }; };
  assert.equal(await app.confirmDestructiveWithPassword('seguro?', {}), 'token-nuevo');
  assert.equal(used.email, 'a@b.com'); assert.equal(used.password, 'Clave1234');
});

test('borrar con contraseña equivocada o cancelando: no devuelve token (no se borra nada)', async () => {
  let r = setup('email');
  r.app.showConfirm = async () => ({ password: 'mala' });
  r.client.auth.signInWithPassword = async () => ({ data: null, error: { message: 'Invalid login credentials' } });
  assert.equal(await r.app.confirmDestructiveWithPassword('seguro?', {}), null);
  r = setup('email');
  r.app.showConfirm = async () => null;
  assert.equal(await r.app.confirmDestructiveWithPassword('seguro?', {}), null);
});

test('borrar con Google/Apple: solo confirma (no hay contraseña) y usa el token actual', async () => {
  const { app } = setup('google');
  app.showConfirm = async () => true;
  assert.equal(await app.confirmDestructiveWithPassword('seguro?', {}), 'token-actual');
  app.showConfirm = async () => false;
  assert.equal(await app.confirmDestructiveWithPassword('seguro?', {}), null);
});
