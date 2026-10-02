// test/device-calendar.test.js
//
// Calendario del teléfono escrito directo desde la app nativa (syncDeviceCalendar y
// compañía en app.js), con un plugin CapacitorCalendar de mentira en memoria. Lo que importa
// probar: un toque agrega el plan, un cambio de plan reescribe SOLO el día que cambió (nunca
// duplica), una sesión salteada desaparece, y quitarlo borra el calendario entero.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

function fakeCalendarPlugin() {
  const cal = { calendars: {}, events: {}, nextId: 1, calls: [] };
  cal.plugin = {
    async requestFullCalendarAccess() { return { result: 'granted' }; },
    async listCalendars() { return { result: Object.keys(cal.calendars).map(id => ({ id })) }; },
    async createCalendar(o) { const id = String(cal.nextId++); cal.calendars[id] = o.title; return { id }; },
    async deleteCalendar({ id }) {
      delete cal.calendars[id];
      Object.keys(cal.events).forEach(k => { if (cal.events[k].calendarId === id) delete cal.events[k]; });
    },
    async createEvent(o) { const id = String(cal.nextId++); cal.events[id] = o; cal.calls.push('create'); return { id }; },
    async deleteEventsById({ ids }) { ids.forEach(id => delete cal.events[id]); cal.calls.push('delete'); return { result: { deleted: ids, failed: [] } }; },
  };
  return cal;
}

function setup() {
  const app = loadApp();
  const cal = fakeCalendarPlugin();
  app.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { CapacitorCalendar: cal.plugin } };
  app.setCurrentUserId('user-1');
  const profile = {
    weeklyKm: 30, currentWeeklyKm: 30, weeklyGoalKm: 0, goal: '10k', runnerType: 'active',
    trainingDays: ['tue', 'wed', 'fri', 'sun'], terrain: 'asfalto', units: 'metric', trainBy: 'distance',
    birth: null, weight: null, height: null,
  };
  app.state.profile = profile;
  app.state.event = null;
  app.state.weekNumber = 1;
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.plan = app.generatePlan(profile, 1, app.state.weekStart);
  return { app, cal };
}

test('enableDeviceCalendar: un toque crea el calendario Zancada con esta semana y la próxima', async () => {
  const { app, cal } = setup();
  assert.equal(await app.enableDeviceCalendar(), true);
  assert.deepEqual(Object.values(cal.calendars), ['Zancada']);
  const sessions = app.state.plan.filter(d => d.dist > 0).length;
  const events = Object.values(cal.events);
  assert.ok(events.length > sessions, 'también debería incluir la semana siguiente');
  assert.ok(events.every(e => e.isAllDay && e.availability === 1));
  assert.equal(app.deviceCalendarEnabled(), true);
});

test('syncDeviceCalendar: sin cambios no reescribe nada; un día cambiado se reescribe solo ese', async () => {
  const { app, cal } = setup();
  await app.enableDeviceCalendar();
  const before = Object.keys(cal.events).length;
  cal.calls.length = 0;

  await app.syncDeviceCalendar();
  assert.deepEqual(cal.calls, [], 'nada cambió: no debería tocar el calendario');

  const day = app.state.plan.find(d => d.dist > 0);
  day.status = 'done';
  await app.syncDeviceCalendar();
  assert.equal(cal.calls.filter(c => c === 'create').length, 1);
  assert.equal(cal.calls.filter(c => c === 'delete').length, 1);
  assert.equal(Object.keys(cal.events).length, before, 'nunca duplica');
  assert.ok(Object.values(cal.events).some(e => e.title.startsWith('✓ ')));
});

test('syncDeviceCalendar: una sesión salteada desaparece del calendario', async () => {
  const { app, cal } = setup();
  await app.enableDeviceCalendar();
  const before = Object.keys(cal.events).length;
  app.state.plan.find(d => d.dist > 0).status = 'skipped';
  await app.syncDeviceCalendar();
  assert.equal(Object.keys(cal.events).length, before - 1);
});

test('syncDeviceCalendar: si el usuario borró el calendario a mano, lo vuelve a crear completo', async () => {
  const { app, cal } = setup();
  await app.enableDeviceCalendar();
  const before = Object.keys(cal.events).length;
  const calId = Object.keys(cal.calendars)[0];
  await cal.plugin.deleteCalendar({ id: calId });
  await app.syncDeviceCalendar();
  assert.equal(Object.keys(cal.calendars).length, 1);
  assert.equal(Object.keys(cal.events).length, before);
});

test('removeDeviceCalendar: borra el calendario entero y deja de sincronizar', async () => {
  const { app, cal } = setup();
  await app.enableDeviceCalendar();
  await app.removeDeviceCalendar();
  assert.deepEqual(cal.calendars, {});
  assert.deepEqual(cal.events, {});
  assert.equal(app.deviceCalendarEnabled(), false);
  cal.calls.length = 0;
  await app.syncDeviceCalendar();
  assert.deepEqual(cal.calls, []);
});

test('sin el plugin (web) el botón no intenta nada nativo', async () => {
  const app = loadApp();
  assert.equal(app.deviceCalendarPlugin(), null);
  assert.equal(await app.enableDeviceCalendar(), false);
});
