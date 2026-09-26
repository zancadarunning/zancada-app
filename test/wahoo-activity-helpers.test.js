// test/wahoo-activity-helpers.test.js
//
// Prueba de workoutToRun (api/_lib/wahoo-activity-helpers.js) para el caso puntual de
// avgHr/avgCadence/calories cuando Wahoo no tuvo sensor pareado para esa métrica.
//
// Reportado en una auditoría: los campos numéricos de workout_summary vienen SIEMPRE
// como string (ej. "24909.71") -- pero cuando Wahoo no tiene un dato real (sin banda de
// FC, sin podómetro), en vez de omitir la clave manda un string de cero ("0.0"), que es
// truthy en JS. El chequeo `summary.heart_rate_avg ? ... : null` (chequeando el STRING
// crudo, antes de parsearlo) pasaba igual con ese "0.0", así que una sesión sin sensor
// terminaba con avgHr:0/avgCadence:0/calories:0 en vez de null -- y el detalle de la
// carrera mostraba "0 bpm"/"0 spm" como si el reloj hubiera medido cero de verdad, en vez
// de ocultar esa fila (que es lo que hace cuando el valor es null).
//
// workoutToRun(workout, accessToken) solo busca los splits reales del FIT si accessToken
// es truthy (ver el comentario en el propio archivo) -- pasando null evita esa parte
// (de red, no testeable acá) y deja probar el resto de los campos con un `workout`
// sintético.

const test = require('node:test');
const assert = require('node:assert/strict');
const { workoutToRun } = require('../api/_lib/wahoo-activity-helpers');

function baseWorkout(summaryOverrides) {
  return {
    id: 123,
    starts: '2026-09-20T10:00:00.000Z',
    name: 'Rodaje',
    minutes: 30,
    workout_summary: Object.assign({
      distance_accum: '5000.0',
      duration_active_accum: '1800',
      ascent_accum: '10',
    }, summaryOverrides),
  };
}

test('workoutToRun: un sensor sin dato real ("0.0") da null, no 0', async () => {
  const run = await workoutToRun(baseWorkout({
    heart_rate_avg: '0.0',
    cadence_avg: '0',
    calories_accum: '0.0',
  }), null);

  assert.equal(run.avgHr, null, 'sin banda de FC pareada, avgHr debería quedar null, no 0');
  assert.equal(run.avgCadence, null, 'sin podómetro pareado, avgCadence debería quedar null, no 0');
  assert.equal(run.calories, null, 'calorías en "0.0" (sin dato real) debería quedar null, no 0');
});

test('workoutToRun: un valor real (aunque venga como string) se parsea y redondea bien', async () => {
  const run = await workoutToRun(baseWorkout({
    heart_rate_avg: '142.7',
    cadence_avg: '87.3',
    calories_accum: '310.9',
  }), null);

  assert.equal(run.avgHr, 143);
  assert.equal(run.avgCadence, 87);
  assert.equal(run.calories, 311);
});
