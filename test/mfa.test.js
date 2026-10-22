// Verificación en dos pasos opcional (TOTP de Supabase): la API rechaza una sesión sin el segundo paso cuando la cuenta lo activó, y la app lo pide
// al ingresar, lo activa y lo desactiva desde Perfil.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const verifyUser = require('../api/_lib/verify-user');
const { loadApp } = require('./support/load-app');

// ---------- servidor ----------
const jwt = payload => 'h.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.s';

async function verify(userFactors, tokenPayload) {
  process.env.SUPABASE_URL = 'https://x.test'; process.env.SUPABASE_SERVICE_KEY = 'k';
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01', app_metadata: { provider: 'email' }, factors: userFactors }) });
  try { return await verifyUser({ headers: { authorization: 'Bearer ' + jwt(tokenPayload) } }); } finally { global.fetch = realFetch; }
}

test('API: cuenta con segundo paso activado + sesión solo con contraseña (aal1) -> 401 "MFA required"', async () => {
  const r = await verify([{ id: 'f1', status: 'verified', factor_type: 'totp' }], { sub: 'u1', aal: 'aal1' });
  assert.equal(r.ok, false); assert.equal(r.status, 401); assert.equal(r.error, 'MFA required');
  const sinClaim = await verify([{ id: 'f1', status: 'verified' }], { sub: 'u1' });   // un token sin "aal" cuenta como aal1
  assert.equal(sinClaim.ok, false);
});

test('API: con el segundo paso completado (aal2) pasa; sin factores o con uno sin verificar, no cambia nada', async () => {
  assert.equal((await verify([{ id: 'f1', status: 'verified' }], { sub: 'u1', aal: 'aal2' })).ok, true);
  assert.equal((await verify([], { sub: 'u1', aal: 'aal1' })).ok, true);
  assert.equal((await verify(undefined, { sub: 'u1', aal: 'aal1' })).ok, true);
  assert.equal((await verify([{ id: 'f1', status: 'unverified' }], { sub: 'u1', aal: 'aal1' })).ok, true, 'un alta a medias no bloquea la cuenta');
});

// ---------- app ----------
function setup(mfa) {
  const app = loadApp();
  const reg = new Map();
  const realGet = app.document.getElementById;
  app.document.getElementById = id => { if (!reg.has(id)) reg.set(id, realGet(id)); return reg.get(id); };
  const client = vm.runInContext('supabaseClient', app);
  client.auth.mfa = mfa;
  const calls = [];
  return { app, client, calls, el: id => app.document.getElementById(id) };
}

test('mfaNeedsChallenge: solo cuando falta el segundo paso (aal1 -> aal2)', async () => {
  const mk = data => setup({ getAuthenticatorAssuranceLevel: async () => ({ data, error: null }) }).app;
  assert.equal(await mk({ currentLevel: 'aal1', nextLevel: 'aal2' }).mfaNeedsChallenge(), true);
  assert.equal(await mk({ currentLevel: 'aal2', nextLevel: 'aal2' }).mfaNeedsChallenge(), false);
  assert.equal(await mk({ currentLevel: 'aal1', nextLevel: 'aal1' }).mfaNeedsChallenge(), false, 'sin segundo paso activado');
  const roto = setup({ getAuthenticatorAssuranceLevel: async () => { throw new Error('red'); } }).app;
  assert.equal(await roto.mfaNeedsChallenge(), false);
});

test('ingreso: pide el código, rechaza uno inválido o equivocado, y deja pasar con el correcto', async () => {
  const verifies = [];
  const { app, el } = setup({
    getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null }),
    listFactors: async () => ({ data: { totp: [{ id: 'f1', status: 'verified' }] }, error: null }),
    challengeAndVerify: async o => { verifies.push(o); return { error: o.code === '123456' ? null : { message: 'invalid' } }; }
  });
  const p = app.ensureMfa();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(el('mfa-challenge-modal').style.display, 'block');
  assert.ok(el('mfa-challenge-title').textContent.length > 3, 'textos de los locales');
  el('mfa-challenge-code').value = '12'; await app.submitMfaChallenge();
  assert.equal(verifies.length, 0, 'un código que no tiene 6 dígitos ni se manda');
  assert.equal(el('mfa-challenge-err').style.display, 'block');
  el('mfa-challenge-code').value = '000000'; await app.submitMfaChallenge();
  assert.equal(verifies.length, 1); assert.equal(el('mfa-challenge-modal').style.display, 'block', 'código equivocado: sigue pidiendo');
  el('mfa-challenge-code').value = '123 456'; await app.submitMfaChallenge();
  assert.equal(await p, true);
  assert.equal(verifies[1].factorId, 'f1'); assert.equal(verifies[1].code, '123456');
  assert.equal(el('mfa-challenge-modal').style.display, 'none');
});

test('ingreso: cancelar devuelve false (el llamador cierra la sesión); sin segundo paso pendiente ni se muestra nada', async () => {
  const { app, el } = setup({
    getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null }),
    listFactors: async () => ({ data: { totp: [{ id: 'f1', status: 'verified' }] }, error: null })
  });
  const p = app.ensureMfa();
  await new Promise(r => setTimeout(r, 10));
  app.cancelMfaChallenge();
  assert.equal(await p, false);
  const libre = setup({ getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }) });
  assert.equal(await libre.app.ensureMfa(), true);
  assert.notEqual(libre.el('mfa-challenge-modal').style.display, 'block');
});

test('Perfil: activar muestra QR y clave, verifica el código y queda activado; cancelar no deja un factor a medias', async () => {
  const calls = [];
  const { app, el } = setup({
    listFactors: async () => ({ data: { totp: [] }, error: null }),
    enroll: async o => { calls.push(['enroll', o.factorType]); return { data: { id: 'nuevo', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABCDEF234567' } }, error: null }; },
    challengeAndVerify: async o => { calls.push(['verify', o.factorId, o.code]); return { error: null }; },
    unenroll: async o => { calls.push(['unenroll', o.factorId]); return { error: null }; }
  });
  await app.toggleMfa();
  assert.deepEqual(calls[0], ['enroll', 'totp']);
  assert.equal(el('mfa-setup-modal').style.display, 'block');
  assert.equal(el('mfa-setup-secret').textContent, 'ABCDEF234567');
  assert.match(el('mfa-setup-qr').src, /^data:image\/svg\+xml/);
  el('mfa-setup-code').value = '654321'; await app.confirmMfaSetup();
  assert.deepEqual(calls[1], ['verify', 'nuevo', '654321']);
  assert.equal(el('mfa-setup-modal').style.display, 'none');
  // otro intento, y se cancela: se borra el factor sin verificar
  await app.toggleMfa(); await app.cancelMfaSetup();
  assert.deepEqual(calls[calls.length - 1], ['unenroll', 'nuevo']);
});

test('Perfil: con el segundo paso activado, la fila lo muestra como activado (y solo en cuentas con contraseña)', async () => {
  const { app, client, el } = setup({ listFactors: async () => ({ data: { totp: [{ id: 'f1', status: 'verified' }] }, error: null }) });
  client.auth.getSession = async () => ({ data: { session: { user: { app_metadata: { provider: 'email' } } } } });
  await app.refreshMfaRow();
  assert.equal(el('mfa-row').style.display, '');
  assert.equal(el('mfa-row-status').textContent, app.t('mfa_row_on'));
  client.auth.getSession = async () => ({ data: { session: { user: { app_metadata: { provider: 'google' } } } } });
  await app.refreshMfaRow();
  assert.equal(el('mfa-row').style.display, 'none');
});

test('loadUserAndEnter exige el segundo paso ANTES de leer cualquier dato de la cuenta', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').split(String.fromCharCode(13)).join('');
  const body = src.slice(src.indexOf('async function loadUserAndEnter'), src.indexOf('function isPasswordStrong'));
  const mfa = body.indexOf('ensureMfa()');
  const lectura = body.indexOf(".from('app_state')");
  assert.ok(mfa > 0 && lectura > 0 && mfa < lectura);
});

test('los textos del segundo paso existen en los 6 idiomas', () => {
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.js'), 'utf8');
    for (const k of ['mfa_row_title', 'mfa_row_on', 'mfa_row_off', 'mfa_setup_title', 'mfa_setup_intro', 'mfa_setup_step1', 'mfa_setup_secret', 'mfa_setup_step2', 'mfa_setup_warn', 'mfa_code_label', 'mfa_verify_btn', 'mfa_cancel_btn', 'mfa_enabled_toast', 'mfa_disabled_toast', 'mfa_disable_confirm', 'mfa_disable_btn', 'mfa_challenge_title', 'mfa_challenge_text', 'mfa_code_invalid', 'mfa_error', 'mfa_lost', 'mfa_open_app', 'mfa_copy_key', 'mfa_key_copied', 'mfa_open_app_none', 'mfa_manual_hint']) assert.ok(s.includes(k + ':'), l + ' sin ' + k);
    assert.ok(s.includes('info@zancada.org'), l + ' dice cómo recuperar la cuenta');
  }
});

// ---------- borrar datos / cuenta con 2FA ----------
// Volver a escribir la contraseña deja una sesión de nivel 1 y el servidor (verifyUser) la rechaza en cuentas con 2FA: la app tiene que pedir el
// código y mandar el token ya elevado a nivel 2, o quien activó el 2FA no podría borrar sus datos ni su cuenta.
function reauthSetup(mfaAal) {
  let stage = 'before';
  const { app, client, el } = setup({
    getAuthenticatorAssuranceLevel: async () => ({ data: mfaAal, error: null }),
    listFactors: async () => ({ data: { totp: [{ id: 'f1', status: 'verified' }] }, error: null }),
    challengeAndVerify: async o => { if (o.code === '123456') { stage = 'aal2'; return { error: null }; } return { error: { message: 'invalid' } }; }
  });
  client.auth.getSession = async () => ({ data: { session: stage === 'aal2' ? { access_token: 'token-aal2', user: { app_metadata: { provider: 'email' }, email: 'a@b.com' } } : { access_token: 'token-viejo', user: { app_metadata: { provider: 'email' }, email: 'a@b.com' } } } });
  client.auth.signInWithPassword = async () => ({ data: { session: { access_token: 'token-aal1' } }, error: null });
  app.showConfirm = async () => ({ password: 'Clave1234' });
  return { app, el };
}

test('borrar con 2FA: después de la contraseña pide el código y usa el token de nivel 2', async () => {
  const { app, el } = reauthSetup({ currentLevel: 'aal1', nextLevel: 'aal2' });
  const p = app.confirmDestructiveWithPassword('seguro?', {});
  await new Promise(r => setTimeout(r, 20));
  assert.equal(el('mfa-challenge-modal').style.display, 'block', 'tiene que pedir el código');
  el('mfa-challenge-code').value = '123456'; await app.submitMfaChallenge();
  assert.equal(await p, 'token-aal2', 'el servidor solo acepta el token elevado');
});

test('borrar con 2FA: si cancela el código no se borra nada (devuelve null)', async () => {
  const { app } = reauthSetup({ currentLevel: 'aal1', nextLevel: 'aal2' });
  const p = app.confirmDestructiveWithPassword('seguro?', {});
  await new Promise(r => setTimeout(r, 20));
  app.cancelMfaChallenge();
  assert.equal(await p, null);
});

test('borrar sin 2FA: no se pide ningún código y se usa el token de la contraseña', async () => {
  const { app, el } = reauthSetup({ currentLevel: 'aal1', nextLevel: 'aal1' });
  const tok = await app.confirmDestructiveWithPassword('seguro?', {});
  assert.notEqual(el('mfa-challenge-modal').style.display, 'block');
  assert.equal(tok, 'token-viejo');   // el getSession simulado devuelve la sesión vigente
});

// ---------- configurar el 2FA desde el mismo celular ----------
// Nadie puede escanear el QR con el celular donde lo ve: el modal ofrece abrir la app de autenticación con el enlace otpauth:// y copiar la clave.
const enrollMock = uri => ({
  listFactors: async () => ({ data: { totp: [] }, error: null }),
  enroll: async () => ({ data: { id: 'nuevo', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABCDEF234567', uri } }, error: null })
});

test('configurar 2FA en el celular: el botón "Abrir en mi app" aparece en teléfonos y abre solo un enlace otpauth://totp/', async () => {
  const uri = 'otpauth://totp/Zancada:a%40b.com?secret=ABCDEF234567&issuer=Zancada';
  const { app, el } = setup(enrollMock(uri));
  app.navigator.userAgent = 'Mozilla/5.0 (Linux; Android 14; Moto) Chrome/120 Mobile';
  await app.toggleMfa();
  assert.equal(el('mfa-open-app').style.display, '', 'visible en el celular');
  assert.equal(el('mfa-open-app').textContent, app.t('mfa_open_app'));
  assert.equal(el('mfa-copy-key').textContent, app.t('mfa_copy_key'));
  app.openMfaApp();
  assert.equal(app.location.href, uri);
});

test('configurar 2FA en la computadora: el botón de abrir app no se muestra (queda el QR y copiar la clave)', async () => {
  const { app, el } = setup(enrollMock('otpauth://totp/Zancada:a?secret=ABCDEF234567'));
  app.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';
  await app.toggleMfa();
  assert.equal(el('mfa-open-app').style.display, 'none');
});

test('openMfaApp no navega a nada que no sea otpauth://totp/ (ni javascript:, ni http)', async () => {
  for (const bad of ['javascript:alert(1)', 'https://evil.example/x', 'otpauth://hotp/x?secret=A', '']) {
    const { app } = setup(enrollMock(bad));
    app.navigator.userAgent = 'Android';
    await app.toggleMfa();
    const before = app.location.href;
    app.openMfaApp();
    assert.equal(app.location.href, before, 'no debe navegar a: ' + bad);
  }
});

test('copiar la clave: copia el secreto al portapapeles', async () => {
  const { app } = setup(enrollMock('otpauth://totp/Zancada:a?secret=ABCDEF234567'));
  let copied = null;
  app.navigator.clipboard = { writeText: async t => { copied = t; } };
  await app.toggleMfa();
  await app.copyMfaKey();
  assert.equal(copied, 'ABCDEF234567');
});

test('el modal de 2FA tiene los dos botones nuevos y usan data-on-click (la CSP no permite onclick)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="mfa-open-app"[^>]*data-on-click="openMfaApp\(\)"/);
  assert.match(html, /id="mfa-copy-key"[^>]*data-on-click="copyMfaKey\(\)"/);
});

test('iPhone/iPad: no se ofrece "abrir la app" (iOS se lo da a Contraseñas de Apple); "Copiar clave" pasa a ser el botón principal y se explica cómo pegarla', async () => {
  for (const ua of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)']) {
    const { app, el } = setup(enrollMock('otpauth://totp/Zancada:a?secret=ABCDEF234567'));
    app.navigator.userAgent = ua;
    await app.toggleMfa();
    assert.equal(el('mfa-open-app').style.display, 'none');
    assert.equal(el('mfa-copy-key').className, 'btn btn-primary');
    assert.equal(el('mfa-setup-manual').style.display, '');
    assert.equal(el('mfa-setup-manual').textContent, app.t('mfa_manual_hint'));
  }
});

test('Android: el botón de abrir la app sí aparece, "Copiar clave" queda secundario y la ayuda manual se ve', async () => {
  const { app, el } = setup(enrollMock('otpauth://totp/Zancada:a?secret=ABCDEF234567'));
  app.navigator.userAgent = 'Mozilla/5.0 (Linux; Android 14; Moto) Chrome/120 Mobile';
  await app.toggleMfa();
  assert.equal(el('mfa-open-app').style.display, '');
  assert.equal(el('mfa-copy-key').className, 'btn btn-gray');
  assert.equal(el('mfa-setup-manual').style.display, '');
});

test('computadora: sin botón de abrir app y sin la ayuda manual (alcanza con el QR)', async () => {
  const { app, el } = setup(enrollMock('otpauth://totp/Zancada:a?secret=ABCDEF234567'));
  app.navigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';
  await app.toggleMfa();
  assert.equal(el('mfa-open-app').style.display, 'none');
  assert.equal(el('mfa-setup-manual').style.display, 'none');
});
