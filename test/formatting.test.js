// test/formatting.test.js
//
// Pruebas de los formateadores de distancia/ritmo/tiempo (fmtDist, fmtPace,
// fmtTime, fmtDurationShort) -- funciones puras, sin dependencia de la
// pantalla, así que son las más baratas de cubrir y las que más rápido
// detectan una regresión de cálculo.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

test('fmtDist: en métrico devuelve los km tal cual, con los decimales pedidos', () => {
  const app = loadApp();
  app.state.profile = { units: 'metric' };
  assert.equal(app.fmtDist(10, 1), '10.0');
  assert.equal(app.fmtDist(5.256, 2), '5.26');
});

test('fmtDist: en imperial convierte a millas', () => {
  const app = loadApp();
  app.state.profile = { units: 'imperial' };
  // 10km ~ 6.21 millas
  assert.equal(app.fmtDist(10, 2), '6.21');
});

test('parseDistInput: en imperial convierte lo tipeado (millas) a km antes de guardarlo', () => {
  // saveManualRun/saveEditRun (Historial) guardaban el valor tipeado en el campo de
  // distancia con un parseFloat crudo, directo en distanceKm -- sin pasar por
  // parseDistInput, que es la función que YA usa el resto de la app (el km/semana de
  // Perfil, por ejemplo) para esta misma conversión. Alguien en modo imperial que tipeaba
  // "3.1" pensando en millas (lo que ve en toda la app) terminaba con una carrera guardada
  // de 3.1KM, no de 3.1 millas (~5km) -- silenciosamente casi la mitad de la distancia real.
  const app = loadApp();
  app.state.profile = { units: 'imperial' };
  const km = app.parseDistInput('3.1');
  assert.ok(Math.abs(km - 4.989) < 0.01, `3.1 millas debería guardarse como ~4.99km, dio ${km}`);
});

test('parseDistInput: en métrico deja el valor tal cual (ya está en km)', () => {
  const app = loadApp();
  app.state.profile = { units: 'metric' };
  assert.equal(app.parseDistInput('10'), 10);
});

test('parseDistInput: valores inválidos o negativos dan 0, no NaN ni un número negativo guardado', () => {
  const app = loadApp();
  app.state.profile = { units: 'metric' };
  assert.equal(app.parseDistInput('-5'), 0);
  assert.equal(app.parseDistInput('abc'), 0);
  assert.equal(app.parseDistInput(''), 0);
});

test('fmtPace: da minutos:segundos por km, o el placeholder si no hay ritmo', () => {
  const app = loadApp();
  app.state.profile = { units: 'metric' };
  assert.equal(app.fmtPace(5.5), '5:30'); // 5.5 min/km = 5min30s
  assert.equal(app.fmtPace(0), '—');
  assert.equal(app.fmtPace(null), '—');
});

test('fmtPace: en imperial convierte el ritmo a minutos por milla', () => {
  const app = loadApp();
  app.state.profile = { units: 'imperial' };
  // 6 min/km * 1.60934 ~= 9.656 min/mi -> 9:39
  const pace = app.fmtPace(6);
  assert.equal(pace, '9:39');
});

test('fmtTime: da horas:minutos:segundos con ceros a la izquierda', () => {
  const app = loadApp();
  assert.equal(app.fmtTime(0), '00:00:00');
  assert.equal(app.fmtTime(65), '00:01:05');
  assert.equal(app.fmtTime(3661), '01:01:01');
});

test('fmtDurationShort: redondea a los 15s más cercanos y cambia a minutos al llegar al minuto', () => {
  const app = loadApp();
  // 10s -> redondea a 15s, todavía por debajo del minuto
  assert.equal(app.fmtDurationShort(10), `15 ${app.t('time_unit_sec')}`);
  // 65s -> redondea a 60s -> ya se muestra en minutos (1)
  assert.equal(app.fmtDurationShort(65), `1 ${app.t('time_unit_min')}`);
  // 185s -> redondea a 180s -> 3 minutos
  assert.equal(app.fmtDurationShort(185), `3 ${app.t('time_unit_min')}`);
});
