// Auditoría 2026-11-03, grupo 3: Atrás de Android en el consentimiento, fecha de Polar, tope del ajuste de volumen y series del coach que bajan sus repeticiones.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const { polarStartIso, exerciseToRun } = require('../api/_lib/polar-activity-helpers');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').split(String.fromCharCode(13)).join('');

test('el botón Atrás de Android no cierra la pantalla de consentimientos (dejaba la app en blanco y colgada)', () => {
  assert.ok(SRC.includes("'recovery-set-password','consent-modal'].includes(el.id)) return false;"));
});

test('Polar: la hora local sin huso se convierte a un instante UTC real con start_time_utc_offset', () => {
  assert.equal(polarStartIso({ start_time: '2026-10-20T21:30:00', start_time_utc_offset: -180 }), '2026-10-21T00:30:00.000Z', 'Argentina (UTC-3): corrida de la noche = ya es el día siguiente en UTC');
  assert.equal(polarStartIso({ start_time: '2026-10-20T08:00:00', start_time_utc_offset: 120 }), '2026-10-20T06:00:00.000Z');
  assert.equal(polarStartIso({ start_time: '2026-10-20T08:00:00' }), '2026-10-20T08:00:00', 'sin huso queda como venía');
  assert.equal(polarStartIso({ start_time: '2026-10-20T08:00:00Z', start_time_utc_offset: 60 }), '2026-10-20T08:00:00Z', 'si ya trae huso no se toca');
  assert.equal(polarStartIso({ start_time: 'abc', start_time_utc_offset: 60 }), 'abc');
  assert.equal(polarStartIso({ start_time: '2026-10-20T08:00:00', start_time_utc_offset: 99999 }), '2026-10-20T08:00:00');
});

test('Polar: la carrera guardada lleva el instante UTC, y el día local del plan sigue saliendo de la hora local', async () => {
  const run = await exerciseToRun({ id: 'x1', start_time: '2026-10-20T21:30:00', start_time_utc_offset: -180, distance: 5000, duration: 'PT30M' }, null);
  assert.equal(run.date, '2026-10-21T00:30:00.000Z');
  assert.equal(run.planMonday, '2026-10-19', 'el lunes de esa semana según la hora LOCAL (martes 20)');
  assert.equal(run.planDayIndex, 1, 'martes');
});

test('el ajuste de volumen hacia arriba nunca pasa del 115 % de lo que la persona corre de verdad, y hacia abajo sigue igual', () => {
  const app = loadApp();
  const mon = app.getMondayISO(new Date());
  app.state.weekStart = mon;
  app.state.runs = [8, 15, 22].map((d, i) => ({ id: i + 1, date: new Date(Date.now() - d * 86400000).toISOString(), distanceKm: 20, durationSec: 7200 }));
  assert.equal(app.adjustedWeeklyKm(30, 1.05), 30, 'corre ~20 km/semana: no se sube un plan de 30 por encima de lo que ya tiene');
  assert.equal(Math.round(app.adjustedWeeklyKm(18, 1.05) * 10) / 10, 18.9, 'si está por debajo de su promedio sube normal');
  assert.equal(app.adjustedWeeklyKm(30, 0.9), 27, 'hacia abajo no se limita');
  assert.equal(app.adjustedWeeklyKm(2, 0.9), 5, 'piso de 5 km');
  app.state.runs = [];
  assert.equal(Math.round(app.adjustedWeeklyKm(30, 1.05) * 10) / 10, 31.5, 'sin historial no hay tope que aplicar');
  assert.ok(SRC.includes('adjustedWeeklyKm(state.profile.weeklyKm||0, adj.factor)') && SRC.includes('Math.round(adjustedWeeklyKm(state.profile.weeklyKm, adj.factor))'), 'lo usan la vista previa y el cambio de semana');
});

test('bajar el volumen reduce también las repeticiones de una sesión armada por el coach (custom): cambia el entrenamiento, no solo el número', () => {
  const app = loadApp();
  app.state.profile = { name: 'A', weeklyKm: 30, goal: '10k', runnerType: 'active', currentWeeklyKm: 30, trainBy: 'distance', units: 'metric', trainingDays: ['tue'] };
  const d = { day: 'tue', typeKey: 'intervals', custom: true, type: 'Series', desc: 'Series de 400', dist: 8, interval: { reps: 10, repMeters: 400, recoveryMin: 1 } };
  app.scaleDayAmount(d, 0.6);
  assert.equal(d.interval.reps, 6, 'las repeticiones bajan igual que los km');
  assert.equal(d.dist, 5);
  const min = { day: 'tue', typeKey: 'intervals', custom: true, dist: 1, interval: { reps: 1, repMeters: 400, recoveryMin: 1 } };
  app.scaleDayAmount(min, 0.1);
  assert.equal(min.interval.reps, 1, 'mínimo 1 repetición');
  const plain = { day: 'tue', typeKey: 'easy', custom: true, dist: 8 };
  app.scaleDayAmount(plain, 0.5);
  assert.equal(plain.interval, undefined, 'una sesión sin repeticiones no se toca');
});
