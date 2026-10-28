// Pantalla de inicio (#splash): Google / Apple (solo iPhone nativo) / correo + aviso legal; el correo lleva a #login (correo y contraseña, "olvidé mi contraseña", "o Crear cuenta").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const section = (from, to) => { const a = html.indexOf(from); const b = html.indexOf(to, a + from.length); assert.ok(a > 0 && b > a, from); return html.slice(a, b); };

test('la pantalla de inicio ofrece Google, Apple (oculto salvo iPhone nativo) y correo, con el aviso legal y los enlaces a términos y privacidad', () => {
  const splash = section('<div id="splash">', '<div class="overlay" id="login">');
  assert.ok(splash.includes('id="welcome-google-btn"') && splash.includes("handleGoogleSignIn('welcome-google-btn')"));
  assert.ok(/id="welcome-apple-btn" style="display:none;"/.test(splash), 'Apple arranca oculto');
  assert.ok(splash.includes('id="welcome-email-btn"') && splash.includes('data-on-click="goLogin()"'));
  assert.ok(splash.includes('data-i18n="welcome_legal_pre"') && splash.includes('href="/terms.html"') && splash.includes('href="/privacy.html"'));
  // el botón de Apple solo se muestra en la app nativa de iOS (como antes)
  const app = read('app.js');
  assert.ok(app.includes("['welcome-apple-btn'].forEach(id=>{") && app.includes("getPlatform() === 'ios'"));
});

test('la pantalla de correo tiene volver, contraseña, olvidé mi contraseña y "o Crear cuenta"; los proveedores ya no están ahí ni en el alta', () => {
  const login = section('<div class="overlay" id="login">', '<div class="overlay" id="signup"');
  for (const frag of ['goBackToStart()', 'id="login-email"', 'id="login-password"', 'handleForgotPassword()', 'data-i18n="login_or_plain"', 'goSignup()', 'data-i18n="login_create_account"']) assert.ok(login.includes(frag), frag);
  assert.ok(!/google|apple/i.test(login.replace(/data-i18n-aria="[^"]*"/g, '')), 'sin botones de proveedores en el login');
  const signup = section('<div class="overlay" id="signup"', '<div class="overlay" id="confirm-email"');
  assert.ok(!/signup-google-btn|signup-apple-btn/.test(signup));
  assert.ok(signup.includes('signup-legal-check'), 'el alta por correo conserva su casilla de términos');
});

test('goBackToStart existe y vuelve a la pantalla de inicio', () => {
  const app = read('app.js');
  assert.ok(app.includes("function goBackToStart(){ document.getElementById('login').style.display='none'; document.getElementById('splash').style.display=''; }"));
});

test('los textos nuevos existen en los 6 idiomas', () => {
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = read('locales/' + l + '.js');
    for (const k of ['welcome_email', 'welcome_legal_pre', 'login_or_plain']) assert.ok(s.includes(k + ':"'), l + ' ' + k);
  }
});

test('las montañas de fondo se eliminaron de la pantalla de inicio, de correo y del alta', () => {
  assert.ok(!/splash-bg|splash-terrain/.test(html), 'no quedan capas ni estilos de montañas');
});
