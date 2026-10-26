// Los puntos de GPS de una carrera se recortan a ~900 al guardarla (antes: todos, ~3.600 por hora, ~200 KB por carrera dentro de app_state).
// Lo derivado (vueltas por km, desnivel, curva de ritmo) se calcula con TODOS los puntos antes de recortar.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

function route(n) {
  // ~1 punto por segundo corriendo hacia el norte a ~3 m/s, con altitud ondulada
  return Array.from({ length: n }, (_, i) => ({ lat: -34.6 + i * 0.000027, lon: -58.4, t: i, alt: 20 + Math.sin(i / 60) * 5 }));
}

test('downsampleRoute: respeta el tope, conserva primero y último y mantiene el orden', () => {
  const app = loadApp();
  const pts = route(3600);
  const out = app.downsampleRoute(pts, 900);
  assert.equal(out.length, 900);
  assert.equal(out[0], pts[0]);
  assert.equal(out[out.length - 1], pts[pts.length - 1]);
  for (let i = 1; i < out.length; i++) assert.ok(out[i].t > out[i - 1].t, 'el tiempo sigue creciendo');
});

test('downsampleRoute: una ruta corta queda igual y entradas raras no rompen', () => {
  const app = loadApp();
  const pts = route(500);
  assert.equal(app.downsampleRoute(pts, 900), pts);
  assert.deepEqual(Array.from(app.downsampleRoute([], 900)), []);
  assert.deepEqual(Array.from(app.downsampleRoute(null, 900)), []);
  assert.deepEqual(Array.from(app.downsampleRoute(undefined)), []);
});

test('downsampleRoute: la distancia del trazo recortado queda a menos de 1% de la real', () => {
  const app = loadApp();
  const pts = route(7200);
  const dist = p => { let d = 0; for (let i = 1; i < p.length; i++) d += app.haversine(p[i - 1].lat, p[i - 1].lon, p[i].lat, p[i].lon); return d; };
  const full = dist(pts);
  const thin = dist(app.downsampleRoute(pts, 900));
  assert.ok(Math.abs(full - thin) / full < 0.01, 'real ' + full + ' recortada ' + thin);
});

test('al guardar la carrera, las vueltas se calculan con todos los puntos y se guardan solo ~900 puntos', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(src, /points:downsampleRoute\(tracker\.points\)/, 'el guardado recorta los puntos');
  assert.match(src, /splits: computeSplitsFromPoints\(tracker\.points\)/, 'las vueltas usan los puntos completos');
  assert.ok(src.indexOf('thinStoredRoutes()) persist()') > -1, 'las carreras viejas se recortan al abrir la cuenta');
});
