// Lado de la app del aviso de dispositivo nuevo: identificador estable por instalación, un solo pedido por apertura y nada sin sesión.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadApp } = require('./support/load-app');

function setup(session) {
  const app = loadApp();
  const client = vm.runInContext('supabaseClient', app);
  client.auth.getSession = async () => ({ data: { session } });
  const calls = [];
  app.fetch = async (url, opts) => { calls.push({ url: String(url), opts }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  return { app, calls };
}

test('el identificador del dispositivo son 32 caracteres hexadecimales y se conserva entre aperturas', () => {
  const { app } = setup({ access_token: 't' });
  const a = app.getDeviceId(), b = app.getDeviceId();
  assert.match(a, /^[a-f0-9]{32}$/); assert.equal(a, b);
  assert.equal(app.localStorage.getItem('zancada_device_id'), a);
});

test('un valor guardado roto se reemplaza por uno válido', () => {
  const { app } = setup({ access_token: 't' });
  app.localStorage.setItem('zancada_device_id', '<script>');
  assert.match(app.getDeviceId(), /^[a-f0-9]{32}$/);
});

test('con sesión: un solo pedido a /api/login-alert con el token, el identificador, el idioma y la zona horaria', async () => {
  const { app, calls } = setup({ access_token: 'tok123' });
  await app.registerLoginDevice();
  await app.registerLoginDevice();   // segunda vez en la misma apertura: no repite
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/login-alert$/);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok123');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.deviceId, app.getDeviceId());
  assert.ok(typeof body.lang === 'string' && body.lang.length === 2);
  assert.ok('tz' in body);
});

test('sin sesión no manda nada (y puede reintentar cuando haya sesión)', async () => {
  const { app, calls } = setup(null);
  await app.registerLoginDevice();
  assert.equal(calls.length, 0);
});

test('entrar a la app dispara el aviso, y no frena la entrada si falla', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const body = src.slice(src.indexOf('function enterApp(){'), src.indexOf('function enterApp(){') + 500);
  assert.match(body, /registerLoginDevice\(\)/);
  assert.match(body, /try\{ registerLoginDevice\(\); \}catch\(e\)\{\}/);
});

test('cerrar sesión o borrar datos locales NO borra el identificador del dispositivo (si no, cada ingreso parecería un dispositivo nuevo)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const wipe = src.slice(src.indexOf('function wipeLocalUserData'), src.indexOf('async function logout'));
  assert.doesNotMatch(wipe, /zancada_device_id|DEVICE_ID_KEY/);
});
