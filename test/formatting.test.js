// test/formatting.test.js
//
// Pruebas de los formateadores de distancia/ritmo/tiempo (fmtDist, fmtPace,
// fmtTime, fmtDurationShort) y de la clasificación de clima (classifyWeatherCode)
// -- funciones puras, sin dependencia de la pantalla, así que son las más
// baratas de cubrir y las que más rápido detectan una regresión de cálculo.

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

test('classifyWeatherCode: tormenta gana sobre cualquier otra condición', () => {
  const app = loadApp();
  // código de tormenta (95) + lluvia altísima + calor extremo: tormenta manda igual
  assert.equal(app.classifyWeatherCode(95, 100, 40, 20), 'storm');
});

test('classifyWeatherCode: lluvia por código o por probabilidad alta', () => {
  const app = loadApp();
  assert.equal(app.classifyWeatherCode(61, 0, 20, 10), 'rain'); // código de lluvia
  assert.equal(app.classifyWeatherCode(0, 75, 20, 10), 'rain'); // sin código de lluvia pero prob>=60
  assert.equal(app.classifyWeatherCode(0, 59, 20, 10), null); // 59% no alcanza
});

test('classifyWeatherCode: calor y frío por umbral de temperatura, sin lluvia ni tormenta', () => {
  const app = loadApp();
  assert.equal(app.classifyWeatherCode(0, 0, 31, 15), 'heat');
  assert.equal(app.classifyWeatherCode(0, 0, 29, 15), null); // 29 no llega a 30
  assert.equal(app.classifyWeatherCode(0, 0, 20, 2), 'cold');
  assert.equal(app.classifyWeatherCode(0, 0, 20, 3), 'cold'); // 3 es el límite, inclusive
  assert.equal(app.classifyWeatherCode(0, 0, 20, 4), null); // 4 ya no es frío
});

test('classifyWeatherCode: día templado sin lluvia/calor/frío no devuelve alerta', () => {
  const app = loadApp();
  assert.equal(app.classifyWeatherCode(2, 10, 22, 12), null);
});
