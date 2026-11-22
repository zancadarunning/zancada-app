// Encontrado en la prueba en el A33 (2026-11-22): la frase de Zonda decía "Tu tramo más rápido fue el 1: 0:01/km" (salto de GPS) y el Historial mostraba "Distancia total 0" con una carrera de 0,2 km.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('un tramo con ritmo imposible (menos de 2:00/km) no se elige como "el más rápido"', () => {
  const a = loadApp();
  const run = { distanceKm: 4.2, durationSec: 1500, splits: [{ km: '1', paceMin: 0.02 }, { km: '2', paceMin: 6.1 }, { km: '3', paceMin: 6.0 }, { km: '4', paceMin: 6.2 }] };
  const h = a.computeRunHighlight(run, []);
  assert.ok(!h || !(h.key === 'hl_fast_km' && h.vars.n === '1'), JSON.stringify(h));
});

test('un tramo claramente más rápido pero humano sí se destaca', () => {
  const a = loadApp();
  const run = { distanceKm: 4.2, durationSec: 1500, splits: [{ km: '1', paceMin: 5.0 }, { km: '2', paceMin: 6.6 }, { km: '3', paceMin: 6.1 }, { km: '4', paceMin: 7.0 }, { km: '5', paceMin: 6.5 }] };
  const h = a.computeRunHighlight(run, []);
  assert.ok(h && h.key === 'hl_fast_km', JSON.stringify(h));
});

test('la distancia total del Historial muestra un decimal hasta 100 km (antes 0,2 km se veía como 0)', () => {
  assert.match(app, /fmtDist\(tr\.totalKm, tr\.totalKm < 100 \? 1 : 0\)/);
});

test('los tiempos de menos de una hora se muestran mm:ss (no 00:02:49) en Inicio, Historial y el detalle de la carrera', () => {
  assert.match(app, /home-done-time'\)\.textContent = fmtRunClock\(/);
  assert.match(app, /<span class="mono">\$\{fmtRunClock\(r\.durationSec\)\}<\/span><span class="muted" style="font-size:11px;">\$\{t\('run_time'\)\}/);
  assert.match(app, /tiles\.push\(\[t\('run_time'\), fmtRunClock\(r\.durationSec\)\]\);/);
  const a = loadApp();
  assert.equal(a.fmtRunClock(169), '02:49');
  assert.equal(a.fmtRunClock(3725), '01:02:05');
});
