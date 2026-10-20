// test/privacy-trim.test.js
//
// Privacidad al compartir: la imagen y el video de una carrera salen sin el tramo del inicio y del final de la ruta (casi siempre la casa).
// Lo que ve el corredor dentro de la app no cambia: la ruta guardada sigue completa.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

// Ruta recta hacia el este, un punto cada 10 m (a la latitud de Buenos Aires, 1 grado de longitud ~ 92 km)
const M_PER_DEG_LON = 92500;
function straightRoute(totalM, stepM = 10) {
  const pts = [];
  for (let d = 0; d <= totalM; d += stepM) pts.push({ lat: -34.6, lon: -58.4 + d / M_PER_DEG_LON, t: d });
  return pts;
}
function lengthM(app, pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += app.haversine(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon) * 1000;
  return s;
}

test('por defecto se ocultan 200 m al inicio y 200 m al final', () => {
  const app = loadApp();
  app.state.profile = {};
  assert.equal(app.privacyTrimMeters(), 200);
  const pts = straightRoute(5000);
  const out = app.trimRouteForSharing(pts);
  assert.ok(out.length < pts.length);
  const first = out[0], last = out[out.length - 1];
  const fromStart = app.haversine(pts[0].lat, pts[0].lon, first.lat, first.lon) * 1000;
  const toEnd = app.haversine(last.lat, last.lon, pts[pts.length - 1].lat, pts[pts.length - 1].lon) * 1000;
  assert.ok(fromStart >= 199 && fromStart < 215, 'inicio: ' + fromStart);
  assert.ok(toEnd >= 199 && toEnd < 215, 'final: ' + toEnd);
  assert.ok(Math.abs(lengthM(app, out) - (lengthM(app, pts) - 400)) < 25, 'queda el medio, sin 200 m en cada punta');
});

test('las opciones 500 m y 1 km ocultan más; "no ocultar" devuelve la ruta tal cual', () => {
  const app = loadApp();
  const pts = straightRoute(6000);
  app.state.profile = { privacyTrimM: 500 };
  assert.ok(Math.abs(lengthM(app, app.trimRouteForSharing(pts)) - (lengthM(app, pts) - 1000)) < 25);
  app.state.profile = { privacyTrimM: 1000 };
  assert.ok(Math.abs(lengthM(app, app.trimRouteForSharing(pts)) - (lengthM(app, pts) - 2000)) < 25);
  app.state.profile = { privacyTrimM: 0 };
  assert.equal(app.trimRouteForSharing(pts).length, pts.length);
  // un valor inválido guardado vuelve al predeterminado (200), no a "sin ocultar"
  app.state.profile = { privacyTrimM: 7 };
  assert.equal(app.privacyTrimMeters(), 200);
});

test('una carrera corta nunca queda en blanco: se oculta como mucho el 20 % de cada punta', () => {
  const app = loadApp();
  app.state.profile = {};
  const pts = straightRoute(600);
  const out = app.trimRouteForSharing(pts);
  assert.ok(out.length >= 2);
  const len = lengthM(app, out);
  assert.ok(Math.abs(len - lengthM(app, pts) * 0.6) < 25, 'queda ~60 %: ' + len);
});

test('puntos inválidos se descartan, y con muy pocos puntos igual no se devuelve el recorrido completo ni vacío', () => {
  const app = loadApp();
  app.state.profile = {};
  const pts = straightRoute(2000);
  const dirty = [{ lat: NaN, lon: 1 }, null, ...pts, { lat: 'x', lon: 2 }];
  const out = app.trimRouteForSharing(dirty);
  assert.ok(out.every(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)));
  assert.ok(out.length >= 2 && out.length < pts.length);
  // puntos muy espaciados (cada 2 km): no queda nada en el medio y NUNCA se devuelve el inicio ni el final
  const sparse = straightRoute(4000, 2000);
  const sp = app.trimRouteForSharing(sparse);
  assert.ok(sp.length < 2);
  assert.ok(!sp.includes(sparse[0]) && !sp.includes(sparse[sparse.length - 1]));
  assert.equal(app.trimRouteForSharing(undefined).length, 0);
});

test('runForSharing no toca la carrera guardada: solo la copia que se dibuja sale recortada', () => {
  const app = loadApp();
  app.state.profile = {};
  const pts = straightRoute(3000);
  const run = { id: 'r1', distanceKm: 3, points: pts };
  const shared = app.runForSharing(run);
  assert.equal(run.points.length, pts.length, 'la ruta guardada sigue completa');
  assert.ok(shared.points.length < pts.length);
  assert.equal(shared.distanceKm, 3);
});

test('las etiquetas de las opciones siguen la unidad: m / km en métrico, yardas / millas en imperial', () => {
  const app = loadApp();
  app.state.profile = { units: 'metric' };
  assert.deepEqual([200, 500, 1000].map(m => app.privacyTrimLabel(m)), ['200 m', '500 m', '1 km']);
  app.state.profile = { units: 'imperial' };
  assert.deepEqual([200, 500, 1000].map(m => app.privacyTrimLabel(m)), ['220 yd', '550 yd', '0.6 mi']);
});
