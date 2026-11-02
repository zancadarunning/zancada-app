// Consentimientos antes de empezar (v2): Términos y Privacidad, datos de salud, análisis con IA y 16+ en una pantalla, con "Aceptar todo" y un ⓘ que explica cada uno.
// app.js: hasConsent / ensureConsent / toggleConsentAll / updateConsentButton / acceptConsent / declineConsent.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split(String.fromCharCode(13)).join('');

function setup() {
  const app = loadApp();
  const reg = new Map();
  const realGet = app.document.getElementById;
  app.document.getElementById = id => { if (!reg.has(id)) reg.set(id, realGet(id)); return reg.get(id); };
  return { app, el: id => app.document.getElementById(id) };
}
const FULL = { v: 2, at: '2026-11-02T00:00:00Z', age16: true, health: true, ai: true, terms: true };

test('hasConsent: exige versión vigente y los cuatro en true (16+, salud, IA y Términos)', () => {
  const { app } = setup();
  app.state.consent = undefined; assert.equal(app.hasConsent(), false);
  app.state.consent = FULL; assert.equal(app.hasConsent(), true);
  for (const k of ['age16', 'health', 'ai', 'terms']) {
    app.state.consent = Object.assign({}, FULL, { [k]: false }); assert.equal(app.hasConsent(), false, k);
    app.state.consent = Object.assign({}, FULL); delete app.state.consent[k]; assert.equal(app.hasConsent(), false, 'sin ' + k);
  }
  app.state.consent = Object.assign({}, FULL, { v: 1 }); assert.equal(app.hasConsent(), false, 'versión 1 (antes de separar IA y Términos): se vuelve a pedir');
  app.state.consent = { v: 2, age16: 'true', health: 'true', ai: 'true', terms: 'true' }; assert.equal(app.hasConsent(), false, 'tiene que ser true de verdad');
});

test('ensureConsent: si ya aceptó no muestra nada; si no, muestra la pantalla y espera; "Aceptar todo" tilda los cuatro', async () => {
  const { app, el } = setup();
  app.state.consent = FULL;
  assert.equal(await app.ensureConsent(), true);
  assert.notEqual(el('consent-modal').style.display, 'block', 'no se muestra');

  app.state.consent = undefined;
  const p = app.ensureConsent();
  assert.equal(el('consent-modal').style.display, 'block');
  assert.equal(el('consent-accept-btn').disabled, true, 'el botón arranca gris');
  assert.ok(el('consent-title').textContent.length > 3 && el('consent-all-label').textContent.length > 3, 'los textos salen de los locales');
  assert.equal(el('consent-info').style.display, 'none', 'el panel de información arranca cerrado');
  // sin tildar nada no acepta
  app.acceptConsent();
  assert.equal(app.state.consent, undefined);
  // con tres de cuatro sigue gris, y "Aceptar todo" no queda tildado
  for (const k of ['terms', 'health', 'ai']) el('consent-' + k).checked = true;
  app.updateConsentButton();
  assert.equal(el('consent-accept-btn').disabled, true); assert.equal(el('consent-all').checked, false);
  el('consent-age').checked = true; app.updateConsentButton();
  assert.equal(el('consent-accept-btn').disabled, false); assert.equal(el('consent-all').checked, true, 'con los cuatro, "Aceptar todo" se tilda solo');
  // "Aceptar todo" destilda y tilda
  el('consent-all').checked = false; app.toggleConsentAll();
  assert.deepEqual(['terms', 'health', 'ai', 'age'].map(k => el('consent-' + k).checked), [false, false, false, false]);
  assert.equal(el('consent-accept-btn').disabled, true);
  el('consent-all').checked = true; app.toggleConsentAll();
  assert.deepEqual(['terms', 'health', 'ai', 'age'].map(k => el('consent-' + k).checked), [true, true, true, true]);
  assert.equal(el('consent-accept-btn').disabled, false);
  app.acceptConsent();
  assert.equal(await p, true);
  const c = app.state.consent;
  assert.equal(c.v, 2); assert.equal(c.age16, true); assert.equal(c.health, true); assert.equal(c.ai, true); assert.equal(c.terms, true);
  assert.ok(!Number.isNaN(Date.parse(c.at)));
  assert.equal(el('consent-modal').style.display, 'none');
  assert.equal(app.hasConsent(), true);
});

test('el ⓘ abre el panel "Sobre los consentimientos" y el botón volver lo cierra', async () => {
  const { app, el } = setup();
  app.state.consent = undefined;
  const p = app.ensureConsent();
  app.showConsentInfo(true);
  assert.equal(el('consent-info').style.display, 'flex'); assert.equal(el('consent-main').style.display, 'none');
  assert.ok(el('consent-info-p-ai').textContent.includes('Zonda'));
  app.showConsentInfo(false);
  assert.equal(el('consent-info').style.display, 'none'); assert.equal(el('consent-main').style.display, 'flex');
  app.declineConsent(); await p;
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
  const src = read('app.js');
  const body = src.slice(src.indexOf('async function loadUserAndEnter'), src.indexOf('function isPasswordStrong'));
  const existing = body.indexOf('if(!hasConsent()){');
  const enter = body.indexOf('enterApp();\n      return;');
  assert.ok(existing > 0 && existing < enter, 'cuenta existente: se pide antes de enterApp()');
  const fresh = body.indexOf('if(!(await ensureConsent()))');
  const onboard = body.indexOf("document.getElementById('onboard').style.display='block'");
  assert.ok(fresh > 0 && fresh < onboard, 'cuenta nueva: se pide antes del onboarding');
});

test('la pantalla: cuatro casilleros + "Aceptar todo" + ⓘ, enlaces armados sin innerHTML, y los textos existen en los 6 idiomas', () => {
  const html = read('index.html');
  const modal = html.slice(html.indexOf('id="consent-modal"'), html.indexOf('id="whats-new-modal"'));
  for (const id of ['consent-all', 'consent-terms', 'consent-health', 'consent-ai', 'consent-age', 'consent-info-btn', 'consent-back-btn', 'consent-accept-btn', 'consent-decline-btn']) assert.ok(modal.includes(`id="${id}"`), id);
  assert.ok(!/onclick=|onchange=/i.test(modal), 'sin manejadores en línea (CSP)');
  const fn = read('app.js');
  const terms = fn.slice(fn.indexOf('function fillConsentTerms'), fn.indexOf('function showConsentInfo'));
  assert.ok(!terms.includes('innerHTML'), 'los enlaces se arman como nodos');
  const KEYS = ['consent_title', 'consent_lead', 'consent_all', 'consent_terms', 'consent_health', 'consent_ai', 'consent_age', 'consent_accept', 'consent_decline', 'consent_info_label', 'consent_back', 'consent_info_title',
    'consent_info_h_health', 'consent_info_p_health', 'consent_info_hl1', 'consent_info_hl2', 'consent_info_hl3', 'consent_info_hl4', 'consent_info_h_ai', 'consent_info_p_ai', 'consent_info_ai1', 'consent_info_ai2', 'consent_info_ai3', 'consent_info_medical', 'consent_info_withdraw'];
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = read('locales/' + l + '.js');
    for (const k of KEYS) assert.ok(s.includes(k + ':'), l + ' sin ' + k);
    assert.match(s, /consent_terms:"[^"]*\{terms\}[^"]*\{privacy\}/, l + ': el texto de Términos lleva los dos enlaces');
    assert.match(s, /consent_age:"[^"]*16/, l + ' menciona la edad mínima');
  }
});
