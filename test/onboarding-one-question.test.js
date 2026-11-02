// Inicio para usuarios nuevos: una pregunta por pantalla (estilo del video de referencia), con vidrio líquido. Todos los campos que finishOnboard lee siguen existiendo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const app = read('app.js');
const block = html.slice(html.indexOf('<div class="overlay" id="onboard">'), html.indexOf('<header class="top" id="mainHeader"'));

test('hay 18 pantallas numeradas sin huecos; solo las de "ya corre" se saltan para quien es nuevo', () => {
  const steps = [...block.matchAll(/<div class="ob-step[^"]*" data-step="(\d+)"([^>]*)>/g)];
  assert.deepEqual(steps.map(m => Number(m[1])), Array.from({ length: 18 }, (_, i) => i + 1));
  assert.deepEqual(steps.filter(m => /data-when="active"/.test(m[2])).map(m => Number(m[1])), [3, 4, 5]);
});

test('cada campo que lee finishOnboard sigue en el inicio', () => {
  for (const id of ['ob-name', 'ob-runnertype', 'ob-currentkm', 'ob-returning', 'ob-refrace-dist', 'ob-refrace-min', 'ob-terrain', 'ob-trainby', 'ob-days', 'ob-availmin', 'ob-goal', 'ob-racedate', 'ob-birth', 'ob-weight', 'ob-height', 'ob-gender', 'ob-pregnancy', 'ob-healthnotes', 'ob-sports-selected', 'ob-sport-days', 'ob-referral']) {
    assert.ok(block.includes(`id="${id}"`), id);
  }
});

test('los botones de nombre, fecha de nacimiento y peso/altura arrancan deshabilitados y la lógica los habilita con lo suyo', () => {
  for (const id of ['ob-name-continue-btn', 'ob-birth-continue-btn', 'ob-step2-continue-btn']) assert.match(block, new RegExp(`id="${id}"[^>]*disabled`), id);
  assert.match(app, /nameBtn\.disabled = !document\.getElementById\('ob-name'\)\.value\.trim\(\)/);
  assert.match(app, /birthBtn\.disabled = !birth/);
  assert.match(app, /btn\.disabled = !\(weight>0 && height>0\);/);
});

test('la navegación salta los pasos que no aplican y la barra cuenta solo los que le tocan', () => {
  assert.match(app, /function obStepApplies\(el\)/);
  assert.match(app, /el\.dataset\.when === 'active'/);
  assert.match(app, /find\(el => parseInt\(el\.dataset\.step,10\) > obCurrentStep && obStepApplies\(el\)\)/);
  assert.match(app, /function updateObProgress\(\)/);
});

test('"¿Cómo conociste Zancada?" se guarda en el perfil solo con valores de la lista, y no hay "Cerrar sesión" arriba del inicio', () => {
  assert.match(app, /const referral = document\.querySelector\('#ob-referral \.choice\.active'\)\?\.dataset\.v \|\| null;/);
  assert.match(app, /state\.profile = \{email:pendingEmail, name, weight, height, birth, gender, referral,/);
  const options = [...block.matchAll(/<div class="choice" data-v="([a-z]+)"[^>]*>[^<]*<\/div>/g)].map(m => m[1]);
  for (const v of ['instagram', 'tiktok', 'youtube', 'google', 'facebook', 'x', 'reddit', 'store', 'friend', 'ai', 'other']) assert.ok(options.includes(v), v);
  assert.ok(!block.includes('confirmLogout'), 'sin cerrar sesión en el inicio');
});

test('el vidrio del inicio respeta "reducir transparencia" y los dos temas; los textos están en los 6 idiomas', () => {
  assert.ok(html.includes('id="ob-glass-css"'));
  assert.match(html, /@media \(prefers-reduced-transparency:reduce\)/);
  assert.match(html, /:root\[data-theme="light"\] #onboard/);
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = read('locales/' + l + '.js');
    for (const k of ['ob_q_name', 'ob_q_body', 'ob_q_referral', 'ob_ref_store', 'ob_ref_friend', 'ob_ref_ai', 'ob_ref_other', 'ob_skip', 'ob_done_title', 'ob_done_lead']) assert.ok(s.includes(k + ':'), l + ' ' + k);
  }
});

test('el plan habla de "fecha objetivo", no de "fecha de carrera", en pantalla y en los mensajes del coach', () => {
  const expected = { es: 'Fecha objetivo (opcional)', en: 'Target date (optional)', pt: 'Data objetivo (opcional)', fr: 'Date objectif (facultatif)', it: 'Data obiettivo (opzionale)', de: 'Zieldatum (optional)' };
  for (const [l, text] of Object.entries(expected)) {
    const s = read('locales/' + l + '.js');
    assert.ok(s.includes(`ob_racedate_label:"${text}"`), l);
    assert.ok(!/ob_racedate_label:"[^"]*(race date|carrera|prova|course|gara|Rennen)/i.test(s), l + ' sin "carrera"');
  }
  assert.ok(!/perfil_weeklykm_auto_note:"[^"]*fecha de carrera/.test(read('locales/es.js')));
  assert.match(app, /changes\.push\('fecha objetivo'\)/);
  assert.match(app, /La fecha objetivo "\$\{input\.fecha_carrera\}" no es válida/);
});

test('al crear la cuenta se ofrece "Conectá tu reloj" (lista de integraciones), ya no "Traé tu historial"', () => {
  assert.ok(!html.includes('history-import-overlay') && !app.includes('history-import-overlay'));
  assert.ok(!/hist_import_(title|lead)/.test(html + app));
  assert.match(app, /setTimeout\(maybeOpenConnectWatch, 1600\)/);
  const overlay = html.slice(html.indexOf('id="connect-watch-overlay"'), html.indexOf('id="connect-watch-overlay"') + 6000);
  for (const brand of ['garmin', 'suunto', 'wahoo', 'coros', 'polar', 'healthconnect']) assert.ok(overlay.includes(`data-conn="${brand}"`), brand);
  assert.ok(!overlay.includes('connectStrava'), 'Strava ya no se ofrece acá');
  assert.match(app, /row\.disabled = on/);
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = read('locales/' + l + '.js');
    for (const k of ['conn_title', 'conn_lead', 'conn_section', 'conn_connect', 'conn_continue', 'conn_skip']) assert.ok(s.includes(k + ':'), l + ' ' + k);
    assert.ok(!s.includes('hist_import_title:'), l);
  }
});
