// Zonas de frecuencia cardíaca con el pulso en reposo (método Karvonen): más ajustadas que el % de la FC máxima sola, opcionales, y todas las rutas que recalculan zonas lo respetan.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

test('Karvonen: las zonas salen de reposo + % de la reserva (FC máxima menos reposo)', () => {
  const app = loadApp();
  const z = app.computeZonesKarvonen(190, 50);   // reserva 140
  assert.equal(z[1].min, 120); assert.equal(z[1].max, 134);   // 50 + 140*0.5 ; 50 + 140*0.6
  assert.equal(z[2].min, 135); assert.equal(z[2].max, 148);
  assert.equal(z[5].max, 190, 'la zona 5 llega a la FC máxima');
  for (let n = 1; n < 5; n++) assert.ok(z[n].max < z[n + 1].min, 'zonas ascendentes sin solaparse: ' + n);
  const std = app.computeZones(190);
  assert.notEqual(z[2].min, std[2].min, 'distinto del cálculo estándar');
});

test('con un pulso en reposo válido se usa Karvonen; sin él o con uno que no cierra, el cálculo de siempre', () => {
  const app = loadApp();
  assert.deepEqual(JSON.parse(JSON.stringify(app.computeZonesFor({ hrRest: 55 }, 185))), JSON.parse(JSON.stringify(app.computeZonesKarvonen(185, 55))));
  const std = JSON.parse(JSON.stringify(app.computeZones(185)));
  for (const bad of [undefined, null, '', 20, 120, 170, NaN]) assert.deepEqual(JSON.parse(JSON.stringify(app.computeZonesFor({ hrRest: bad }, 185))), std, 'reposo inválido: ' + bad);
  assert.deepEqual(JSON.parse(JSON.stringify(app.computeZonesFor(null, 185))), std);
});

test('las rutas que recalculan zonas (FC máxima observada, estimada, del coach) respetan el pulso en reposo', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  for (const call of ['computeZonesFor(p, maxHr)', 'computeZonesFor(p, newEstimate)', 'computeZonesFor(state.profile, observedMax)', 'computeZonesFor(state.profile, input.fc_maxima)']) assert.ok(src.includes(call), call);
});

test('la FC máxima observada ignora las carreras de menos de 10 minutos', () => {
  const app = loadApp();
  app.state.profile = { hrMax: 180, hrKnown: false, hrZones: app.computeZones(180), hrZonesCustom: false, birth: '1990-01-01' };
  app.state.runs = [{ durationSec: 300, maxHr: 205 }, { durationSec: 400, maxHr: 204 }, { durationSec: 2400, maxHr: 186 }, { durationSec: 3000, maxHr: 185 }];
  app.checkHrMaxFromRuns();
  assert.equal(app.state.profile.hrMax, 185, 'el 2.º valor más alto de las carreras largas, no los picos de las cortas');
});

test('el pulso en reposo se carga desde las zonas y los textos están en los 6 idiomas', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes('id="zones-rest"') && html.includes('data-on-click="applyRestHrZones()"'));
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.js'), 'utf8');
    for (const k of ['zones_rest_label', 'zones_rest_btn', 'zones_rest_hint', 'zones_rest_err', 'zones_karvonen_status', 'zones_rest_cleared']) assert.ok(s.includes(k + ':'), l + ' ' + k);
  }
});
