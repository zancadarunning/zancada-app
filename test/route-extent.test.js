// Mapas de Correr: una carrera con el celular quieto (varios puntos casi en el mismo lugar) no muestra una tarjeta de mapa vacía; la de verdad sí. El crédito del mapa va como texto chico (como en Historial).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('routeHasExtent: celular quieto o casi quieto = sin recorrido; una ruta real = con recorrido; datos raros no rompen', () => {
  const a = loadApp();
  const still = Array.from({ length: 20 }, (_, i) => ({ lat: -35.6600 + i * 0.000001, lon: -63.7300 }));   // ~0,1 m por punto
  assert.equal(a.routeHasExtent(still), false, 'quieto');
  const jitter = Array.from({ length: 30 }, (_, i) => ({ lat: -35.6600 + (i % 2) * 0.00005, lon: -63.7300 }));   // ~5 m de ruido de GPS
  assert.equal(a.routeHasExtent(jitter), false, 'ruido de GPS de pocos metros');
  const real = Array.from({ length: 10 }, (_, i) => ({ lat: -35.6600 + i * 0.001, lon: -63.7300 }));   // ~110 m por punto
  assert.equal(a.routeHasExtent(real), true, 'ruta real');
  for (const bad of [null, undefined, [], [{ lat: 1, lon: 1 }], [{ lat: NaN, lon: 1 }, { lat: 2, lon: 2 }], 'x', 5])
    assert.equal(a.routeHasExtent(bad), false, 'datos raros: ' + JSON.stringify(bad));
});

test('el resumen y la lista de Historial usan routeHasExtent; el mapa de Correr se ve un poco más lejos y sin el cartel de créditos de Leaflet', () => {
  assert.ok(app.includes('const hasMap = routeHasExtent(tracker.points);'));
  assert.ok(app.includes('const hasMap = routeHasExtent(r.points);'));
  assert.ok(app.includes('.setView([latitude, longitude], approx ? 13 : 15);'), 'mapa de antes de correr: zoom 15 (antes 16)');
  assert.ok(app.includes('Math.max(liveMap.getZoom(),15)') && app.includes('liveMap.setView(liveMarker.getLatLng(), 16);'), 'mapa en pausa: un poco más lejos');
  assert.match(app, /L\.map\('idleMap', \{[^}]*attributionControl:false/);
  assert.match(app, /L\.map\('liveMap', \{zoomControl:false, attributionControl:false\}/);
  assert.match(html, /\.idle-map-wrap::after\{content:'\\00A9  Mapbox  \\00A9  OpenStreetMap'/, 'crédito chico en el mapa de Correr');
  assert.match(html, /\.map-wrap::after\{content:'\\00A9  Mapbox  \\00A9  OpenStreetMap'/, 'crédito chico en el mapa de la carrera en pausa');
  assert.ok(!/\.idle-map \.leaflet-control-attribution/.test(html) && !/\.map-wrap \.leaflet-control-attribution/.test(html), 'ya no hay cartel de créditos de Leaflet con fondo');
});
