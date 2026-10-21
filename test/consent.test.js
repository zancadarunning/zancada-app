// Edad mínima (16) y consentimiento explícito para datos de salud: app.js (hasConsent / ensureConsent / acceptConsent / declineConsent).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

function setup() {
  const app = loadApp();
  const reg = new Map();
  const realGet = app.document.getElementById;
  app.document.getElementById = id => { if (!reg.has(id)) reg.set(id, realGet(id)); return reg.get(id); };
  return { app, el: id => app.document.getElementById(id) };
}

test('hasConsent: exige versión vigente, 16+ y salud en true', () => {
  const { app } = setup();
  const ok = { v: 1, at: '2026-10-21T00:00:00Z', age16: true, health: true };
  app.state.consent = undefined; assert.equal(app.hasConsent(), false);
  app.state.consent = ok; assert.equal(app.hasConsent(), true);
  app.state.consent = Object.assign({}, ok, { age16: false }); assert.equal(app.hasConsent(), false);
  app.state.consent = Object.assign({}, ok, { health: false }); assert.equal(app.hasConsent(), false);
  app.state.consent = Object.assign({}, ok, { v: 0 }); assert.equal(app.hasConsent(), false, 'versión vieja: se vuelve a pedir');
  app.state.consent = { v: 1, age16: 'true', health: 'true' }; assert.equal(app.hasConsent(), false, 'tiene que ser true de verdad');
});

test('ensureConsent: si ya aceptó no muestra nada; si no, muestra la pantalla y espera la respuesta', async () => {
  const { app, el } = setup();
  app.state.consent = { v: 1, at: 'x', age16: true, health: true };
  assert.equal(await app.ensureConsent(), true);
  assert.notEqual(el('consent-modal').style.display, 'block', 'no se muestra');

  app.state.consent = undefined;
  const p = app.ensureConsent();
  assert.equal(el('consent-modal').style.display, 'block');
  assert.equal(el('consent-accept-btn').disabled, true, 'el botón arranca gris');
  assert.ok(el('consent-title').textContent.length > 3 && el('consent-body').textContent.includes('Zonda'), 'los textos salen de los locales');
  // sin tildar nada no acepta
  app.acceptConsent();
  assert.equal(app.state.consent, undefined);
  // tilda solo la edad: sigue gris; tilda las dos: se habilita
  el('consent-age').checked = true; app.updateConsentButton(); assert.equal(el('consent-accept-btn').disabled, true);
  el('consent-health').checked = true; app.updateConsentButton(); assert.equal(el('consent-accept-btn').disabled, false);
  app.acceptConsent();
  assert.equal(await p, true);
  assert.equal(app.state.consent.v, 1); assert.equal(app.state.consent.age16, true); assert.equal(app.state.consent.health, true);
  assert.ok(!Number.isNaN(Date.parse(app.state.consent.at)));
  assert.equal(el('consent-modal').style.display, 'none');
  assert.equal(app.hasConsent(), true);
});

test('rechazar: resuelve false (el llamador cierra la sesión) y no guarda nada', async () => {
  const { app, el } = setup();
  app.state.consent = undefined;
  const p = app.ensureConsent();
  app.declineConsent();
  assert.equal(await p, false);
  assert.equal(app.state.consent, undefined);
  assert.equal(el('consent-modal').style.display, 'none');
});

test('loadUserAndEnter pide el consentimiento (cuenta existente y cuenta nueva) antes de entrar', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').split(String.fromCharCode(13)).join('');
  const body = src.slice(src.indexOf('async function loadUserAndEnter'), src.indexOf('function isPasswordStrong'));
  const existing = body.indexOf('if(!hasConsent()){');
  const enter = body.indexOf('enterApp();\n      return;');
  assert.ok(existing > 0 && existing < enter, 'cuenta existente: se pide antes de enterApp()');
  const fresh = body.indexOf('if(!(await ensureConsent()))');
  const onboard = body.indexOf("document.getElementById('onboard').style.display='block'");
  assert.ok(fresh > 0 && fresh < onboard, 'cuenta nueva: se pide antes del onboarding');
});

test('los textos del consentimiento existen en los 6 idiomas', () => {
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.js'), 'utf8');
    for (const k of ['consent_title', 'consent_body', 'consent_age', 'consent_health', 'consent_accept', 'consent_decline']) assert.ok(s.includes(k + ':'), l + ' sin ' + k);
    assert.match(s, /16/, l + ' menciona la edad mínima');
  }
});
