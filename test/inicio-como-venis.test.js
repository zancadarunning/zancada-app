// Inicio "Cómo venís" (datos propios en lugar de la frase del día) y gráfico de Tendencias proporcional con línea de promedio. 2026-11-11.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split(String.fromCharCode(13)).join('');
const HTML = read('index.html');
const APP = read('app.js');
const DAY = 86400000;
const NOW = Date.parse('2026-11-11T15:00:00Z');
const run = (daysAgo, km, secPerKm, extra) => Object.assign({ id: daysAgo * 100 + km, date: new Date(NOW - daysAgo * DAY).toISOString(), distanceKm: km, durationSec: Math.round(km * secPerKm) }, extra || {});

test('homeInsights: km de 7 días contra los 7 anteriores, ritmo de 28 días contra los 28 anteriores y la salida más larga', () => {
  const app = loadApp();
  app.state.profile = { units: 'metric' };
  app.state.runs = [run(1, 5, 330), run(3, 8, 330), run(9, 10, 330), run(20, 12, 330), run(35, 6, 340), run(50, 6, 340)];
  const ins = app.homeInsights(NOW);
  assert.equal(ins.km7, 13);
  assert.equal(ins.kmPrev7, 10);
  assert.equal(ins.pctKm, 30);
  assert.ok(Math.abs(ins.pace28 - 5.5) < 0.01, '5:30/km');
  assert.equal(ins.paceDeltaSec, -10, '10 s por km más rápido que los 28 días anteriores');
  assert.equal(ins.longKm, 12);
  assert.equal(ins.hasGarmin, false);
});

test('homeInsights: sin carreras en 28 días devuelve null (Inicio muestra la frase del día); sin período anterior no inventa comparaciones', () => {
  const app = loadApp();
  app.state.profile = { units: 'metric' };
  app.state.runs = [run(40, 8, 330)];
  assert.equal(app.homeInsights(NOW), null);
  app.state.runs = [run(2, 8, 330)];
  const ins = app.homeInsights(NOW);
  assert.equal(ins.pctKm, null);
  assert.equal(ins.paceDeltaSec, null);
  app.state.runs = [];
  assert.equal(app.homeInsights(NOW), null);
});

test('homeInsights: ignora carreras rotas y ritmos imposibles, y avisa si hay datos de Garmin (atribución)', () => {
  const app = loadApp();
  app.state.profile = { units: 'metric' };
  app.state.runs = [run(1, 5, 330), { id: 9, date: 'no es fecha', distanceKm: 5, durationSec: 100 }, { id: 8, date: new Date(NOW - DAY).toISOString(), distanceKm: NaN, durationSec: 100 }, run(2, 5, 30), run(4, 1, 330), run(5, 6, 330, { source: 'garmin' })];
  const ins = app.homeInsights(NOW);
  assert.equal(ins.km7, 17, 'suma las carreras válidas (5 + 5 + 1 + 6)');
  assert.ok(Math.abs(ins.pace28 - 5.5) < 0.01, 'el ritmo deja fuera la de 30 s/km y la de menos de 2 km');
  assert.equal(ins.hasGarmin, true);
});

test('la tarjeta se dibuja con textos escapados y no usa datos de Zonda', () => {
  const body = APP.slice(APP.indexOf('function renderHomeInsights(){'), APP.indexOf('function renderDailyTip(){'));
  assert.ok(body.includes("escapeHtml(t('home_insights_title'))"));
  assert.ok(body.includes("if(quote) quote.style.display = 'none';"));
  assert.ok(body.includes("t('garmin_derived_note')"), 'con carreras de Garmin lleva la nota de atribución');
  assert.doesNotMatch(body, /aiVisibleRuns|buildContext/);
  assert.ok(HTML.includes('<div class="card" id="home-insights-card" style="display:none;"></div>'));
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const src = read('locales/' + l + '.js');
    for (const k of ['home_insights_title', 'ins_7d', 'ins_pace', 'ins_long', 'ins_28d', 'ins_vs7', 'ins_faster', 'ins_slower', 'ins_same', 'ins_first', 'trend_avg']) assert.ok(src.includes(k + ':"'), l + ' ' + k);
  }
});

test('Tendencias: las barras no se aplastan (zona de 70 px + etiqueta) y hay línea de promedio con 2 días corridos o más', () => {
  assert.match(HTML, /\.trend-bars\{height:88px;\}/);
  assert.match(HTML, /\.trend-stroke\{width:min\(12px, 62%\); border-radius:4px; flex-shrink:0;\}/);
  const app = loadApp();
  app.state.profile = { units: 'metric' };
  const mk = kms => kms.map((km, i) => ({ km, day: String(i), date: '2026-11-0' + (i + 1) }));
  assert.equal(app.trendAvgLine(mk([0, 5, 0]), 5), '', 'con un solo día corrido no hay línea');
  const line = app.trendAvgLine(mk([10, 0, 5]), 10);
  assert.match(line, /class="trend-avg" style="bottom:71px;"/, 'promedio 7,5 de 10 -> 53 px + 18 de la etiqueta');
  assert.match(line, /7\.5 km/);
});
