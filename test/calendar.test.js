// test/calendar.test.js
//
// Pruebas del widget de calendario compartido (openCalendar/calNavigate/renderCalendar,
// usado para nacimiento, fecha de carrera, y fecha de una carrera manual/editada) -- solo
// la parte de lógica pura que no depende de leer valores reales del DOM (calNavigate/
// openCalendar sí dependen, y el harness de test no cachea elementos por id -- ver el
// comentario en test/support/load-app.js -- así que esos quedan fuera de acá).
//
// Reportado en una auditoría: calNavigate() nunca se fijaba en los límites de fecha
// (calBoundsFor) para decidir si dejar navegar a un mes que queda ENTERO fuera de rango --
// el usuario podía llegar a un mes con las ~30 celdas deshabilitadas, sin ningún aviso de
// por qué. calMonthOutOfBounds() es la pieza nueva que decide esto.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

test('calMonthOutOfBounds: bloquea avanzar a un mes que queda ENTERO después del máximo permitido', () => {
  const app = loadApp();
  const viewDate = new Date(2026, 8, 1); // septiembre 2026 (el mes que contiene el máximo)
  const bounds = { max: '2026-09-24' };

  assert.equal(app.calMonthOutOfBounds(viewDate, 1, bounds), true, 'octubre queda entero después del máximo -- debería bloquearse');
  assert.equal(app.calMonthOutOfBounds(viewDate, -1, bounds), false, 'agosto es anterior al máximo -- tiene que poder verse');
  assert.equal(app.calMonthOutOfBounds(viewDate, 0, bounds), false, 'el mes que contiene el máximo (con días válidos antes de esa fecha) no debería bloquearse a sí mismo');
});

test('calMonthOutOfBounds: bloquea retroceder a un mes que queda ENTERO antes del mínimo permitido', () => {
  const app = loadApp();
  const viewDate = new Date(2026, 9, 1); // octubre 2026 (el mes que contiene el mínimo)
  const bounds = { min: '2026-10-24' };

  assert.equal(app.calMonthOutOfBounds(viewDate, -1, bounds), true, 'septiembre queda entero antes del mínimo -- debería bloquearse');
  assert.equal(app.calMonthOutOfBounds(viewDate, 1, bounds), false, 'noviembre es posterior al mínimo -- tiene que poder verse');
});

test('calMonthOutOfBounds: sin límites, nunca bloquea', () => {
  const app = loadApp();
  const viewDate = new Date(2026, 5, 1);
  assert.equal(app.calMonthOutOfBounds(viewDate, 1, {}), false);
  assert.equal(app.calMonthOutOfBounds(viewDate, -1, {}), false);
});

test('calBoundsFor: cada input tiene el límite que le corresponde (nacimiento no futuro, carreras no pasadas)', () => {
  const app = loadApp();
  const today = app.todayLocalISO();

  // {...x}: calBoundsFor() devuelve un objeto armado en el contexto vm sandboxeado del
  // harness, con un Object de ESE realm -- deepEqual estricto compara también el
  // constructor, así que hay que "aterrizarlo" a un objeto del realm del test primero
  // (mismo motivo que Array.from() en los tests que comparan arrays, ver coach-tools.test.js).
  assert.deepEqual({...app.calBoundsFor('ob-birth')}, { max: today });
  assert.deepEqual({...app.calBoundsFor('ob-racedate')}, { min: today });
  assert.deepEqual({...app.calBoundsFor('perfil-racedate')}, { min: today });
  assert.deepEqual({...app.calBoundsFor('ev-date')}, { min: today });
  assert.deepEqual({...app.calBoundsFor('man-date')}, { max: today });
  assert.deepEqual({...app.calBoundsFor('edit-run-date')}, { max: today });
  assert.deepEqual({...app.calBoundsFor('algo-sin-limite')}, {});
});
