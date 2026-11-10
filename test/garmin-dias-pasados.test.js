// Garmin: una sesión que se pasó de día y se devolvió dejaba un entrenamiento de más en el calendario (caso reportado 2026-11-10: martes -> lunes -> martes el mismo lunes).
// Causa: solo se borraban de Garmin las fechas POSTERIORES a hoy y los registros se leían desde hoy, así que el entrenamiento del día "de hoy" (o de un día ya pasado) quedaba para siempre.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');
const { staleGarminDates } = require('../api/_lib/garmin-plan-sync');

const rec = id => ({ workoutId: String(id), scheduleId: String(id + 1), hash: 'abc' });
const set = a => new Set(a);

test('el caso reportado: la sesión se pasó al lunes y se devolvió al martes el MISMO lunes -> el lunes se borra de Garmin', () => {
  // hoy es lunes 9; el plan vuelve a tener la sesión el martes 10
  const known = { '2026-11-09': rec(1), '2026-11-12': rec(3), '2026-11-14': rec(5) };
  const planDates = set(['2026-11-10', '2026-11-12', '2026-11-14', '2026-11-17']);
  const stale = staleGarminDates(known, { today: '2026-11-09', weekStart: '2026-11-09', keepDates: set(['2026-11-10', '2026-11-12', '2026-11-14']), planDates, dayDates: set(['2026-11-10', '2026-11-12', '2026-11-14']) });
  assert.deepEqual(stale, ['2026-11-09']);
});

test('y al día siguiente (el lunes ya pasó) el huérfano que quedó de antes también se limpia', () => {
  const known = { '2026-11-09': rec(1), '2026-11-10': rec(2), '2026-11-12': rec(3) };
  const planDates = set(['2026-11-10', '2026-11-12']);
  const stale = staleGarminDates(known, { today: '2026-11-10', weekStart: '2026-11-09', keepDates: set(['2026-11-10', '2026-11-12']), planDates, dayDates: set(['2026-11-10', '2026-11-12']) });
  assert.deepEqual(stale, ['2026-11-09']);
});

test('una sesión de hoy ya HECHA no se borra de Garmin (sigue en planDates aunque no se reenvíe)', () => {
  const known = { '2026-11-10': rec(2), '2026-11-12': rec(3) };
  const planDates = set(['2026-11-10', '2026-11-12']);   // hoy figura: está hecha, no quitada
  const stale = staleGarminDates(known, { today: '2026-11-10', weekStart: '2026-11-09', keepDates: set(['2026-11-12']), planDates, dayDates: set(['2026-11-12']) });
  assert.deepEqual(stale, []);
});

test('no toca semanas anteriores ni lo que se está reenviando, y mira hasta la semana próxima', () => {
  const known = { '2026-11-02': rec(1), '2026-11-11': rec(2), '2026-11-18': rec(3), '2026-11-23': rec(4) };
  const planDates = set(['2026-11-12']);
  const stale = staleGarminDates(known, { today: '2026-11-10', weekStart: '2026-11-09', keepDates: set(['2026-11-12']), planDates, dayDates: set(['2026-11-11']) });
  assert.deepEqual(stale, ['2026-11-18'], 'la semana pasada no se mira; el 11 se reenvía; el 23 está fuera de la ventana de 14 días');
});

test('sin planDates (app vieja) o con un lunes inverosímil se mantiene la regla de antes: solo fechas posteriores a hoy', () => {
  const known = { '2026-11-09': rec(1), '2026-11-10': rec(2), '2026-11-13': rec(3) };
  const keep = set(['2026-11-12']);
  assert.deepEqual(staleGarminDates(known, { today: '2026-11-10', weekStart: '2026-11-09', keepDates: keep, planDates: set([]), dayDates: set([]) }), ['2026-11-13']);
  assert.deepEqual(staleGarminDates(known, { today: '2026-11-10', weekStart: '2026-10-01', keepDates: keep, planDates: set(['2026-11-12']), dayDates: set([]) }), ['2026-11-13'], 'el lunes está a más de una semana: no se confía');
  assert.deepEqual(staleGarminDates(known, { today: '2026-11-10', weekStart: null, keepDates: keep, planDates: set(['2026-11-12']), dayDates: set([]) }), ['2026-11-13']);
});

test('el servidor lee planDates y weekStart y los usa (hash, lectura desde el lunes y borrado)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'garmin-push-plan.js'), 'utf8').split(String.fromCharCode(13)).join('');
  assert.match(src, /const planDates = new Set\(\(Array\.isArray\(body\.planDates\)/);
  assert.match(src, /loadKnown\(base, headers, userId, usePlanDates \? weekStart : \(today \|\| '0000-00-00'\)\)/);
  assert.match(src, /staleGarminDates\(known, \{ today, weekStart, keepDates, planDates,/);
  assert.match(src, /planHash = payloadHash\(\{ v: 3,[^}]*planDates:/);
});

test('la app manda planDates: las fechas con sesión (hecha o pendiente) de esta semana y la próxima; las de descanso no', () => {
  const app = loadApp();
  const p = { name: 'Ana', weight: 60, height: 165, birth: '1990-05-01', gender: 'f', weeklyKm: 35, currentWeeklyKm: 30, goal: '10k', runnerType: 'active', trainingDays: ['tue', 'thu', 'sat'], units: 'metric', trainBy: 'distance', terrain: 'asfalto', hrZones: app.computeZones(190), hrMax: 190 };
  app.state.profile = p; app.state.onboarded = true; app.state.weekNumber = 5;
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.plan = app.generatePlan(p, 5);
  const dates = app.watchPlanDates();
  const mon = app.state.weekStart;
  const iso = i => app.addDaysToIsoLocal(mon, i);
  const withSession = app.state.plan.map((d, i) => (d && d.dist > 0 && d.typeKey !== 'rest') ? iso(i) : null).filter(Boolean);
  for (const d of withSession) assert.ok(dates.includes(d), 'incluye ' + d);
  app.state.plan.forEach((d, i) => { if (!d || !(d.dist > 0) || d.typeKey === 'rest') assert.ok(!dates.includes(iso(i)), 'no incluye el descanso ' + iso(i)); });
  // una sesión ya hecha sigue figurando (Garmin no la tiene que borrar)
  const idx = app.state.plan.findIndex(d => d && d.dist > 0 && d.typeKey !== 'rest');
  app.state.plan[idx].status = 'done';
  assert.ok(app.watchPlanDates().includes(iso(idx)), 'la sesión hecha figura');
  // una sesión quitada (pasó a descanso) deja de figurar: es lo que hace que Garmin borre ese día
  app.state.plan[idx] = Object.assign({}, app.state.plan[idx], { typeKey: 'rest', dist: 0, status: undefined });
  assert.ok(!app.watchPlanDates().includes(iso(idx)), 'la sesión quitada ya no figura');
});

test('syncPlanToGarmin envía planDates junto con keepDates', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').split(String.fromCharCode(13)).join('');
  assert.ok(src.includes('body: JSON.stringify({ days:changed, keepDates:keep, planDates:watchPlanDates(), weekStart,'));
});
