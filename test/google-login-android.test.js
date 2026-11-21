// El inicio de sesión con Google en la app de Android tiene que VOLVER a la app.
// Antes (reportado el 2026-11-21 con un video del A33): se tocaba "Continuar con Google", se abría Chrome, se elegía la cuenta y terminaba en zancada.org
// dentro de Chrome, sin volver nunca a la app. Ahora vuelve por un App Link (https://www.zancada.org/auth/app) y appUrlOpen termina el inicio de sesión.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('en la app nativa Google vuelve por el App Link; en la web, al sitio de siempre', () => {
  const src = read('app.js');
  assert.ok(src.includes("const GOOGLE_APP_RETURN = 'https://www.zancada.org/auth/app';"));
  assert.ok(/const redirectTo = isNativeApp\(\) \? GOOGLE_APP_RETURN : window\.location\.origin;/.test(src), 'redirectTo depende de la plataforma');
  assert.ok(/signInWithOAuth\(\{ provider:'google', options:\{ redirectTo,/.test(src), 'usa ese redirectTo');
});

test('appUrlOpen entrega la vuelta de Google a finishGoogleAppReturn antes que al resto de links', () => {
  const src = read('app.js');
  const i = src.indexOf("url.indexOf('https://www.zancada.org/auth/app') === 0");
  const j = src.indexOf('const l = parseLinkReturn(url');
  assert.ok(i > 0 && j > i, 'la vuelta de Google se atiende primero');
});

test('finishGoogleAppReturn: canjea el código; ignora otras URLs; un error de Google no entra', async () => {
  const calls = [];
  const toasts = [];
  const entered = [];
  const app = loadApp({ onExchange: (c) => { calls.push(c); return { data: { user: { id: 'u1' } }, error: null }; } });
  app.showToast = (m, k) => toasts.push(k);
  app.loadUserAndEnter = async (u) => { entered.push(u.id); };   // la vuelta de Google tiene que ENTRAR a la app (antes solo guardaba la sesión y quedaba en la pantalla de inicio)
  assert.equal(await app.finishGoogleAppReturn('https://www.zancada.org/auth/app?code=abc123'), true);
  assert.deepEqual(calls, ['abc123']);
  assert.deepEqual(entered, ['u1'], 'después de canjear el código, entra a la app');
  assert.equal(await app.finishGoogleAppReturn('https://www.zancada.org/conectar?p=garmin&code=x'), false, 'otro link: no es esta vuelta');
  assert.equal(await app.finishGoogleAppReturn('https://evil.example/auth/app?code=x'), false, 'otro dominio: no');
  assert.equal(await app.finishGoogleAppReturn('https://www.zancada.org/auth/app?error=access_denied&error_description=x'), true);
  assert.equal(await app.finishGoogleAppReturn('https://www.zancada.org/auth/app'), true, 'sin código tampoco entra');
  assert.deepEqual(calls, ['abc123'], 'solo se canjeó el código válido');
  assert.deepEqual(entered, ['u1'], 'y solo entró una vez');
  assert.equal(toasts.filter(k => k === 'error').length, 2);
});

test('el sitio responde en /auth/app (por si la app no está instalada, el navegador carga la web con el código)', () => {
  const v = JSON.parse(read('vercel.json'));
  assert.ok(v.rewrites.some(r => r.source === '/auth/app' && r.destination === '/index.html'));
});
