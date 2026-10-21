// test/coach-tools-enums.test.js
//
// Las herramientas del coach (IA) declaran enums en su input_schema, pero la API no los hace cumplir: un valor inventado o inyectado en la charla
// se rechaza antes de guardarse (esos valores terminan como claves de traducción y en textos de la pantalla).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

function setup() {
  const app = loadApp();
  app.state.profile = { name: 'Ana', weeklyKm: 30, goal: '10k', runnerType: 'active', trainingDays: ['tue', 'thu', 'sun'], terrain: 'asfalto', units: 'metric', trainBy: 'distance', hrMax: 190, hrZones: app.computeZones(190) };
  app.state.painLog = [];
  app.state.plan = ['mon','tue','wed','thu','fri','sat','sun'].map(d => ({ day: d, typeKey: 'rest', dist: 0 }));
  return app;
}
const INJECT = '<img src=x onerror=alert(1)>';

test('applyPlanChange rechaza un tipo_categoria o un terreno inventado y no toca el plan', () => {
  const app = setup();
  app.state.plan = [{ day: 'sun', typeKey: 'rest', dist: 0 }];
  const before = JSON.stringify(app.state.plan);
  const r1 = app.applyPlanChange({ dia: 'sun', tipo: 'Rodaje', tipo_categoria: INJECT, descripcion: 'x', distancia_km: 5 });
  assert.match(r1, /no es válido/);
  assert.ok(r1.length < 250, 'el valor se recorta');
  const r2 = app.applyPlanChange({ dia: 'sun', tipo: 'Rodaje', tipo_categoria: 'easy', terreno: INJECT, descripcion: 'x', distancia_km: 5 });
  assert.match(r2, /terreno/);
  const r3 = app.applyPlanChange({ dia: 'sun', tipo: 'Rodaje', descripcion: 'x', distancia_km: 5 });   // sin tipo_categoria
  assert.match(r3, /tipo_categoria/);
  assert.equal(JSON.stringify(app.state.plan), before, 'el plan quedó igual');
  assert.equal(app.state.chat.length, 0, 'no se escribió ningún mensaje en la charla');
});

test('applyProfileChange: un objetivo o terreno inventado se rechaza pero el resto del pedido válido se aplica', () => {
  const app = setup();
  const r = app.applyProfileChange({ objetivo: INJECT, terreno: INJECT, fc_maxima: 185 });
  assert.match(r, /objetivo/);
  assert.equal(app.state.profile.goal, '10k');
  assert.equal(app.state.profile.terrain, 'asfalto');
  assert.equal(app.state.profile.hrMax, 185, 'lo válido sí se aplicó');
});

test('applyProfileChange: los valores válidos siguen funcionando', () => {
  const app = setup();
  app.applyProfileChange({ objetivo: '21k', terreno: 'trail' });
  assert.equal(app.state.profile.goal, '21k');
  assert.equal(app.state.profile.terrain, 'trail');
});

test('applyCoachNote: una zona del cuerpo inventada guarda la nota pero no crea una molestia', () => {
  const app = setup();
  const r = app.applyCoachNote({ nota: 'me duele algo', zona_cuerpo: INJECT });
  assert.ok(r);
  assert.equal(app.state.profile.coachNotes.length, 1);
  assert.equal(app.state.painLog.length, 0);
});
