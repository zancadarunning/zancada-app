// test/run-tracker.test.js
//
// Bug reportado (encontrado en una auditoría, no por un usuario todavía): al recuperar una
// carrera trackeada después de que la app se cerrara sola a mitad de un entrenamiento (poca
// batería, el sistema mata la pestaña, etc. -- ver actuallyStartRun/startRun), elapsedSec se
// recalculaba como Date.now()-startedAt, es decir el reloj de pared COMPLETO desde que arrancó
// la carrera. Eso contaba cualquier rato con la app cerrada (justo el caso que esta
// recuperación existe para cubrir) como si hubiera sido tiempo corriendo -- cerrar la app 2
// horas a mitad de una carrera y recuperarla después inflaba la duración guardada en 2 horas,
// arruinando el ritmo/las calorías de esa carrera para siempre. distanceKm/points/hrLog ya se
// restauraban tal cual quedaron guardados (sin extrapolar nada, porque no se grabó ningún punto
// de GPS durante el cierre) -- la solución hace que elapsedSec se comporte igual: se guarda en
// cada saveRunProgress() y se restaura tal cual en actuallyStartRun, sin depender del reloj.
//
// actuallyStartRun en sí no es fácil de probar acá (necesita geolocalización real, un mapa de
// Leaflet, etc. -- nada de eso existe en este sandbox mínimo), así que este test cubre el lado
// que sí es lógica pura: que el progreso guardado en localStorage efectivamente incluya
// elapsedSec, que es la pieza de datos que faltaba.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

test('saveRunProgress guarda elapsedSec (no solo distanceKm/points/hrLog)', () => {
  const app = loadApp();
  app.setTracker({
    startedAt: Date.now() - 20 * 60 * 1000, // arrancó hace 20 minutos de reloj
    points: [{ lat: 0, lon: 0, t: 0, alt: null }],
    distanceKm: 3.2,
    hrLog: [],
    lastAnnouncedKm: 3,
    elapsedSec: 754, // tiempo activo real -- bastante menos que los 20 minutos de reloj, porque hubo una pausa
  });

  app.saveRunProgress();
  const saved = app.readRunProgress();

  assert.equal(saved.elapsedSec, 754, 'el progreso guardado tiene que llevar elapsedSec tal cual, para no tener que recalcularlo con el reloj de pared al recuperar la carrera');
  assert.equal(saved.distanceKm, 3.2);
  assert.equal(saved.lastAnnouncedKm, 3);
});

test('saveRunProgress guarda running (para no reanudar corriendo una carrera que se pausó a mano)', () => {
  // Bug hermano del de elapsedSec (ver el comentario de arriba del archivo): togglePause()
  // llama a saveRunProgress() justo al pausar a mano, para poder recuperar el progreso lo más
  // cerca posible del momento real de la pausa -- pero sin este campo, actuallyStartRun() no
  // tenía forma de saber que la carrera estaba pausada al cerrarse la app (batería, el sistema
  // mata la app, etc.) y la recuperaba SIEMPRE como si estuviera corriendo, retomando GPS y
  // distancia sin que el corredor tocara nada.
  const app = loadApp();
  app.setTracker({
    startedAt: Date.now() - 10 * 60 * 1000,
    points: [],
    distanceKm: 2,
    hrLog: [],
    lastAnnouncedKm: 2,
    elapsedSec: 500,
    running: false, // pausada a mano justo antes de guardar
  });

  app.saveRunProgress();
  const saved = app.readRunProgress();

  assert.equal(saved.running, false, 'el progreso guardado tiene que reflejar que la carrera estaba pausada, no asumir que sigue corriendo');
});

test('saveRunProgress no guarda nada si no hay una carrera en curso (sin startedAt)', () => {
  const app = loadApp();
  app.setTracker({ startedAt: null, points: [], distanceKm: 0, hrLog: [], lastAnnouncedKm: 0, elapsedSec: 0 });

  app.saveRunProgress();

  assert.equal(app.readRunProgress(), null);
});

test('clearRunProgress borra el progreso guardado', () => {
  const app = loadApp();
  app.setTracker({ startedAt: Date.now(), points: [], distanceKm: 1, hrLog: [], lastAnnouncedKm: 1, elapsedSec: 300 });

  app.saveRunProgress();
  assert.ok(app.readRunProgress());

  app.clearRunProgress();
  assert.equal(app.readRunProgress(), null);
});
