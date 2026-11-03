// Auditoría 2026-11-03 (#29): al reanudar de una pausa (o recuperar una carrera cerrada) el primer punto nuevo queda lejos del último grabado;
// sumar ese salto en línea recta inflaba parciales, curva de ritmo, ritmo en vivo y video.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').split(String.fromCharCode(13)).join('');
const DEG_PER_KM = 1 / 111.195;

// n tramos de 50 m hacia el norte, 15 s cada uno (5:00 /km), arrancando en (lat0, t0). Con gapFirst el primer punto viene de una pausa: el reloj apenas avanza 1 s.
function leg(points, n, lat0, t0, gapFirst) {
  const off = gapFirst ? 1 - 15 : 0;
  for (let i = 0; i < n; i++) {
    const p = { lat: lat0 + (i + 1) * 0.05 * DEG_PER_KM, lon: -58.4, t: t0 + (i + 1) * 15 + (i >= 0 ? off : 0), alt: null };
    if (i === 0 && gapFirst) p.gap = true;
    points.push(p);
  }
}
function route() {
  const pts = [{ lat: -34.6, lon: -58.4, t: 0, alt: null }];
  leg(pts, 30, -34.6, 0, false);                           // 1,5 km
  const last = pts[pts.length - 1];
  leg(pts, 20, last.lat + 5 * DEG_PER_KM, last.t, true);   // pausa: el corredor aparece 5 km más allá; 1 km más
  return pts;
}

test('parciales: el salto de una pausa no cuenta como distancia (2,4 km reales, no 7,4)', () => {
  const app = loadApp();
  const splits = app.computeSplitsFromPoints(route());
  assert.equal(splits.filter(s => Number.isInteger(s.km)).length, 2, 'dos kilómetros completos');
  splits.forEach(s => assert.ok(s.paceMin > 4.8 && s.paceMin < 5.4, 'ritmo creíble en cada parcial: ' + s.paceMin));
});

test('sin la marca gap (carreras viejas) el comportamiento anterior no cambia', () => {
  const app = loadApp();
  const pts = route().map(p => { const q = Object.assign({}, p); delete q.gap; return q; });
  assert.ok(app.computeSplitsFromPoints(pts).length >= 7, 'sin marca se sigue contando todo (no hay forma de saber que hubo pausa)');
});

test('curva de ritmo: ninguna ventana sale con un ritmo imposible por el salto', () => {
  const app = loadApp();
  const series = app.computePaceSeriesFromPoints(route());
  assert.ok(series && series.paceMin.length >= 2);
  series.paceMin.forEach(p => assert.ok(p > 4 && p < 6.5, 'ritmo ' + p));
});

test('recortar la ruta guardada conserva siempre los puntos de pausa', () => {
  const app = loadApp();
  const pts = [];
  for (let i = 0; i < 3000; i++) pts.push({ lat: -34.6 + i * 1e-5, lon: -58.4, t: i, alt: null });
  pts[1501].gap = true;
  const out = app.downsampleRoute(pts, 900);
  assert.ok(out.includes(pts[1501]), 'el punto con gap sigue en la ruta recortada');
  assert.equal(out[0], pts[0]);
  assert.equal(out[out.length - 1], pts[pts.length - 1]);
  assert.ok(out.length <= 901);
  for (let i = 1; i < out.length; i++) assert.ok(out[i].t > out[i - 1].t, 'sigue en orden');
});

test('el rastreo marca el primer punto tras una pausa y tras recuperar una carrera; el ritmo en vivo, los parciales, el plan y el video usan gpsStepKm', () => {
  assert.ok(SRC.includes('if(tracker.gapPending && tracker.points.length) pt.gap = true;'));
  assert.ok(SRC.includes('} else if(!active){\n    tracker.gapPending = true;'));
  assert.ok(SRC.includes('lastFixMs:null, gapPending:true}'), 'recuperar una carrera deja marcado el próximo punto');
  assert.equal((SRC.match(/gpsStepKm\(/g) || []).length >= 8, true, 'los siete cálculos de distancia entre puntos pasan por el helper');
  // ningún cálculo de distancia entre dos puntos consecutivos de la ruta quedó sin el helper (el de onPos usa lastRawPoint a propósito)
  const raw = SRC.split('\n').filter(l => l.includes('haversine(') && /\[(i|k|j)(-1|\+1)?\]/.test(l) && !l.includes('function haversine'));
  assert.deepEqual(raw, [], 'quedan haversine sobre puntos consecutivos: ' + raw.join(' | ').slice(0, 300));
});
