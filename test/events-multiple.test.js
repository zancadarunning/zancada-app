// Varios eventos en "Tus próximos eventos": state.events es la lista y state.event sigue siendo SIEMPRE el más próximo (es lo que lee el plan, el aviso del día de carrera y los relojes).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const iso = n => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const ev = (name, n, extra) => Object.assign({ name, date: iso(n), type: 'ruta', distanceKm: 10 }, extra || {});
const names = list => Array.from(list, e => e.name);
const fresh = () => { const app = loadApp(); app.state.profile = { units: 'metric' }; app.state.event = null; app.state.events = []; app.state.lastEventDate = null; return app; };

test('sanitizeEvents: descarta lo inválido, pone ids únicos, tipo válido y ordena por fecha', () => {
  const app = fresh();
  const out = app.sanitizeEvents([
    { name: 'Tarde', date: iso(40), type: 'trail', distanceKm: 21 },
    { name: 'Pronto', date: iso(5), type: 'raro', distanceKm: -3, id: 7 },
    { name: '  ', date: iso(9) }, { date: iso(9), name: 5 }, { name: 'Sin fecha' }, { name: 'Mala', date: '2026-13-99x' }, null, 'x'
  ]);
  assert.deepEqual(names(out), ['Pronto', 'Tarde']);
  assert.equal(out[0].type, 'ruta', 'tipo desconocido -> ruta');
  assert.equal(out[0].distanceKm, null, 'distancia negativa -> sin distancia');
  assert.equal(out[0].id, 7);
  assert.equal(new Set(out.map(e => e.id)).size, 2, 'ids únicos');
  assert.equal(app.sanitizeEvents('nada').length, 0);
});

test('syncPrimaryEvent: state.event es el evento más próximo que no pasó; sin eventos queda en null', () => {
  const app = fresh();
  app.state.events = [ev('Lejana', 90), ev('Cercana', 12, { type: 'trail', distanceKm: 21 }), ev('Media', 40)];
  app.syncPrimaryEvent();
  assert.equal(app.state.event.name, 'Cercana');
  assert.deepEqual(Array.from(Object.keys(app.state.event)).sort(), ['date', 'distanceKm', 'name', 'type'], 'misma forma que antes (lo que lee el plan)');
  assert.equal(app.state.event.type, 'trail');
  assert.deepEqual(names(app.state.events), ['Cercana', 'Media', 'Lejana'], 'la lista queda ordenada por fecha');
  app.state.events = [];
  app.syncPrimaryEvent();
  assert.equal(app.state.event, null);
});

test('borrar el evento principal NO lo resucita: el siguiente toma su lugar; borrar el último deja la lista vacía', () => {
  const app = fresh();
  app.state.events = [ev('A', 10), ev('B', 30)];
  app.syncPrimaryEvent();
  assert.equal(app.state.event.name, 'A');
  const idA = app.state.events[0].id;
  app.state.events = app.allEvents().filter(e => e.id !== idA);   // lo que hace deleteEvent()
  app.syncPrimaryEvent();
  assert.equal(app.state.event.name, 'B');
  assert.deepEqual(names(app.state.events), ['B']);
  const idB = app.state.events[0].id;
  app.state.events = app.allEvents().filter(e => e.id !== idB);
  app.syncPrimaryEvent();
  assert.equal(app.state.event, null);
  assert.equal(app.state.events.length, 0);
});

test('migración: el evento único de antes pasa a la lista, sin duplicarse', () => {
  const app = fresh();
  const old = { onboarded: true, profile: {}, plan: [], runs: [], shoes: [], chat: [], event: { name: 'Maratón', date: iso(60), type: 'ruta', distanceKm: 42.195 } };
  const s = app.normalizeLoadedState(JSON.parse(JSON.stringify(old)));
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].name, 'Maratón');
  const again = app.normalizeLoadedState(JSON.parse(JSON.stringify(s)));
  assert.equal(again.events.length, 1, 'cargar de nuevo no lo duplica');
  assert.equal(again.event.name, 'Maratón');
});

test('un state.event suelto (sin lista) igual cuenta como evento y se ve en allEvents', () => {
  const app = fresh();
  app.state.event = ev('Suelto', 20);
  assert.deepEqual(names(app.allEvents()), ['Suelto']);
});

test('autoClearPastEvent: saca TODOS los que pasaron, guarda la última fecha para la semana de recuperación y deja el próximo como principal', () => {
  const app = fresh();
  app.state.events = [ev('Vieja', -20), ev('Ayer', -1), ev('Próxima', 15), ev('Hoy', 0)];
  app.syncPrimaryEvent();
  app.autoClearPastEvent();
  assert.deepEqual(names(app.state.events), ['Hoy', 'Próxima'], 'el evento de hoy todavía no pasó');
  assert.equal(app.state.event.name, 'Hoy');
  assert.equal(app.state.lastEventDate, iso(-1), 'la fecha más reciente que ya pasó');
  // sin eventos pasados no toca nada
  const before = JSON.stringify(app.state.events);
  app.autoClearPastEvent();
  assert.equal(JSON.stringify(app.state.events), before);
});

test('autoClearPastEvent sigue funcionando con el evento único de antes (sin lista)', () => {
  const app = fresh();
  app.state.event = ev('Pasada', -2);
  app.autoClearPastEvent();
  assert.equal(app.state.event, null);
  assert.equal(app.state.lastEventDate, iso(-2));
});

test('el plan sigue leyendo solo el evento más próximo: los demás no cambian las semanas', () => {
  const app = fresh();
  app.state.profile = { weeklyKm: 30, currentWeeklyKm: 30, goal: '21k', runnerType: 'active', trainingDays: ['mon', 'wed', 'fri', 'sat', 'sun'], terrain: 'asfalto', units: 'metric', trainBy: 'distance' };
  const mon = '2026-11-02';
  app.state.weekStart = mon; app.state.runs = [];
  const total = p => p.reduce((a, d) => a + (d.dist || 0), 0);
  app.state.events = [ev('Lejana', 200, { distanceKm: 42 })];
  app.syncPrimaryEvent();
  const solo = total(app.generatePlan(app.state.profile, 2, mon));
  app.state.events = [ev('Lejana', 200, { distanceKm: 42 }), ev('Otra lejana', 150, { distanceKm: 21 }), ev('Más', 300)];
  app.syncPrimaryEvent();
  assert.equal(total(app.generatePlan(app.state.profile, 2, mon)), solo, 'más eventos lejanos no cambian esta semana');
  assert.equal(app.state.event.name, 'Otra lejana', 'el principal es el más cercano');
});

test('la pantalla: lista de eventos tocables que abren una pantalla aparte para editar o borrar; sin atajos inline', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(html, /id="event-edit-overlay"/);
  assert.match(html, /data-on-click="openEventEdit\(null\)"/, 'botón Agregar evento');
  assert.match(html, /id="event-delete-btn"[^>]*data-on-click="deleteEvent\(\)"/, 'borrar desde la pantalla de edición');
  assert.match(html, /data-on-click="closeEventEdit\(\)"/, 'volver a la lista');
  assert.match(app, /data-on-click="openEventEdit\(\$\{ev\.id\}\)"/, 'cada evento de la lista abre su edición');
  assert.doesNotMatch(app.match(/const evList = allEvents\(\);[\s\S]*?\}\)\.join\(''\);/)[0], /onclick=|onerror=/i);
  // textos en los 6 idiomas
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const loc = fs.readFileSync(path.join(root, 'locales', l + '.js'), 'utf8');
    for (const k of ['ev_add', 'ev_new_title', 'ev_edit_title', 'ev_plan_tag', 'perfil_events_more', 'ev_limit_err']) assert.ok(loc.includes(k + ':'), l + ' ' + k);
  }
});
