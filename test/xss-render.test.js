// Barrido de XSS al dibujar pantallas: se cargan textos con un payload HTML en todos los campos libres (nombre, carreras, zapatillas,
// dolores, charla, plan con tipo/descripción propios) y se dibujan las pantallas principales. En ningún lugar puede aparecer el payload
// sin escapar; y en las pantallas que muestran esos campos tiene que aparecer escapado (prueba de que el barrido llegó hasta ahí).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

const PAY = '"><img src=x onerror=alert(1)>';

test('ningún campo libre del estado se dibuja sin escapar en las pantallas principales', () => {
  const app = loadApp();
  const reg = new Map();
  const realGet = app.document.getElementById;
  app.document.getElementById = id => { if (!reg.has(id)) reg.set(id, realGet(id)); return reg.get(id); };
  app.state.profile = { name: PAY, weeklyKm: 30, goal: '10k', runnerType: 'active', trainingDays: ['tue', 'thu', 'sun'], terrain: 'asfalto', units: 'metric', trainBy: 'distance', hrMax: 190, hrZones: app.computeZones(190), raceName: PAY, coachNotes: [{ id: 1, text: PAY, date: '2026-10-10' }], injuries: PAY };
  app.state.runs = [{ id: 'a1', date: '2026-10-12T10:00:00.000Z', distanceKm: 8, durationSec: 2900, name: PAY, notes: PAY, note: PAY, title: PAY, shoeId: 's1', source: 'strava', points: [], hrLog: [], location: PAY, city: PAY, description: PAY }];
  app.state.shoes = [{ id: 's1', name: PAY, brand: PAY, model: PAY, km: 100 }];
  app.state.painLog = [{ id: 'p1', date: '2026-10-10', part: PAY, level: 3, notes: PAY, note: PAY }];
  app.state.chat = [{ role: 'assistant', content: PAY, text: PAY }, { role: 'user', content: PAY, text: PAY }];
  app.state.plan = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => ({ day: d, typeKey: 'easy', dist: 5, type: PAY, desc: PAY, description: PAY, custom: true, terrain: 'asfalto' }));
  app.state.onboarded = true; app.state.weekStart = '2026-10-12'; app.state.levelTest = null;
  const screens = ['renderHome', 'renderPlan', 'renderPerfil', 'renderHistory', 'renderChat', 'renderPastWeeks', 'renderZones', 'renderHomePain', 'renderPainLog',
    'renderReadinessCard', 'renderPersonalRecordsCard', 'renderFitnessCard', 'renderProgressCard', 'renderHomeRecap', 'renderHomeAdjust', 'renderHomeLoad',
    'renderRacePlanEntry', 'renderHomeReturn', 'renderHomeRecal', 'renderRunTodayCard', 'renderWorkoutGuide', 'renderHistoryCalibCard', 'renderRacePredictionsCard', 'renderAll'];
  for (const f of screens) assert.equal(typeof app[f], 'function', f + ' ya no existe: actualizá la lista del test');
  for (const f of screens) app[f]();
  const raw = [...reg].filter(([, el]) => String(el.innerHTML || '').includes('<img src=x onerror')).map(([id]) => id);
  assert.deepEqual(raw, [], 'payload sin escapar en: ' + raw.join(', '));
  const escaped = [...reg].filter(([, el]) => String(el.innerHTML || '').includes('&lt;img')).map(([id]) => id);
  for (const id of ['plan-list', 'history-list', 'pain-log-list', 'shoe-list', 'chatLog']) assert.ok(escaped.includes(id), id + ' no mostró el campo de prueba (el barrido no llegó)');
});
