// Resumen semanal del domingo (api/_lib/weekly-summary.js) y mapa de calor (heatmapRuns / heatmapFocusBounds en app.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWeeklySummary } = require('../api/_lib/weekly-summary.js');

// domingo 11/10/2026, 20:00 en Buenos Aires (UTC-3) = 23:00 UTC
const NOW = Date.UTC(2026, 9, 11, 23, 0, 0);
const TZ = 'America/Argentina/Buenos_Aires';
const run = (iso, km) => ({ date: iso, distanceKm: km });
const base = { tz: TZ, lang: 'es', imperial: false, now: NOW };

test('semana con salidas: km, cantidad, diferencia con la anterior, sesiones del plan y racha', () => {
  const runs = [
    run('2026-10-06T10:00:00Z', 8), run('2026-10-08T10:00:00Z', 6), run('2026-10-10T12:00:00Z', 12.4),   // esta semana (lun 5 a dom 11)
    run('2026-09-30T10:00:00Z', 10), run('2026-10-03T10:00:00Z', 10.3)                                    // la anterior
  ];
  const plan = [{ dist: 8, status: 'done' }, { dist: 0 }, { dist: 6, status: 'done' }, { dist: 0 }, { dist: 12, status: 'done' }, { dist: 5, status: 'skipped' }, { dist: 0 }];
  const m = buildWeeklySummary({ ...base, runs, plan, weekStart: '2026-10-05', streak: '3' });
  assert.equal(m.title, 'Tu semana en Zancada');
  assert.match(m.body, /26\.4 km en 3 salidas \(\+6\.1 km vs la semana anterior\)\./);
  assert.match(m.body, /Sesiones del plan: 3 de 4\./);
  assert.match(m.body, /Racha: 3 semanas seguidas\./);
});

test('sin ninguna salida esta semana: no se manda nada', () => {
  assert.equal(buildWeeklySummary({ ...base, runs: [run('2026-09-20T10:00:00Z', 5)], plan: [], weekStart: '2026-10-05', streak: 0 }), null);
});

test('una carrera de la noche del domingo (23:30 local) cuenta en esta semana, no en la siguiente', () => {
  const m = buildWeeklySummary({ ...base, runs: [run('2026-10-11T02:00:00Z', 5)], plan: null, weekStart: null, streak: 0 });   // sáb 10 23:00 local
  assert.match(m.body, /5\.0 km en 1 salida\./);
});

test('plan de otra semana: no se cuentan sesiones; millas e inglés', () => {
  const m = buildWeeklySummary({ ...base, lang: 'en', imperial: true, runs: [run('2026-10-07T10:00:00Z', 10)], plan: [{ dist: 10, status: 'done' }], weekStart: '2026-09-28', streak: 1 });
  assert.match(m.body, /6\.2 mi in 1 run\./);
  assert.doesNotMatch(m.body, /Plan sessions/);
  assert.doesNotMatch(m.body, /Streak/);
});

// ---- mapa de calor ----
const { loadApp } = require('./support/load-app.js');

test('mapa de calor: solo carreras con GPS y dentro del período', () => {
  const app = loadApp();
  const now = Date.now();
  const pts = [{ lat: -34.6, lon: -58.4 }, { lat: -34.601, lon: -58.401 }];
  app.state.runs = [
    { id: 'a', date: new Date(now - 5 * 864e5).toISOString(), points: pts },
    { id: 'b', date: new Date(now - 200 * 864e5).toISOString(), points: pts },
    { id: 'c', date: new Date(now - 2 * 864e5).toISOString() },
    { id: 'd', date: new Date(now - 800 * 864e5).toISOString(), points: pts }
  ];
  const ids = r => JSON.stringify(app.heatmapRuns(r, now).map(x => x.id));
  assert.equal(ids('all'), JSON.stringify(['a', 'b', 'd']));
  assert.equal(ids('year'), JSON.stringify(['a', 'b']));
  assert.equal(ids('90'), JSON.stringify(['a']));
});

test('mapa de calor: el encuadre ignora una salida aislada en otra ciudad', () => {
  const app = loadApp();
  const home = (dLat) => ({ id: 'h' + dLat, date: new Date().toISOString(), points: [{ lat: -34.6 + dLat, lon: -58.4 }, { lat: -34.61 + dLat, lon: -58.41 }] });
  const far = { id: 'far', date: new Date().toISOString(), points: [{ lat: 40.4, lon: -3.7 }, { lat: 40.41, lon: -3.71 }] };
  const b = JSON.parse(JSON.stringify(app.heatmapFocusBounds([home(0), home(0.001), home(0.002), far])));
  assert.ok(b[0][0] < -34 && b[1][0] < -34, 'el encuadre se queda en Buenos Aires');
  assert.equal(JSON.stringify(app.heatmapFocusBounds([])), 'null');
});

// ---- reparto del resumen semanal en turnos de media hora ----
const { weeklySlotOf, currentWeeklySlot, isWeeklySlot, hasSundaySession, WEEKLY_SLOTS, NORMAL_SLOTS, LATE_FIRST_SLOT } = require('../api/_lib/weekly-summary.js');

test('resumen semanal: sin sesión el domingo, turnos 0-5 (19:00-21:30); con sesión el domingo, turnos 6-9 (22:00-23:30); reparto parejo', () => {
  assert.equal(WEEKLY_SLOTS, 10);
  const normal = new Array(NORMAL_SLOTS).fill(0), late = new Array(4).fill(0);
  for (let i = 0; i < 8000; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const a = weeklySlotOf(id, false), b = weeklySlotOf(id, true);
    assert.ok(a >= 0 && a < NORMAL_SLOTS, 'sin sesión: antes de las 22:00');
    assert.ok(b >= LATE_FIRST_SLOT && b <= 9, 'con sesión: de 22:00 en adelante');
    assert.equal(weeklySlotOf(id, true), b, 'siempre el mismo turno para el mismo usuario');
    normal[a]++; late[b - LATE_FIRST_SLOT]++;
  }
  normal.forEach(c => assert.ok(c > 1000 && c < 1700, 'reparto parejo (sin sesión): ' + JSON.stringify(normal)));
  late.forEach(c => assert.ok(c > 1700 && c < 2300, 'reparto parejo (con sesión): ' + JSON.stringify(late)));
});

test('resumen semanal: el turno actual sale de la hora y el minuto locales, y fuera de 19:00-24:00 no hay turno', () => {
  assert.equal(currentWeeklySlot(19, 0), 0);
  assert.equal(currentWeeklySlot(19, 29), 0);
  assert.equal(currentWeeklySlot(19, 30), 1);
  assert.equal(currentWeeklySlot(22, 0), 6);
  assert.equal(currentWeeklySlot(23, 30), 9);
  assert.equal(currentWeeklySlot(18, 59), -1);
  assert.equal(currentWeeklySlot(8, 0), -1);
  // cada usuario recibe el resumen en exactamente UNA de las corridas de la noche (con o sin sesión el domingo)
  for (const sunday of [false, true]) {
    let hits = 0;
    for (let h = 0; h < 24; h++) for (const m of [0, 30]) if (isWeeklySlot('usuario-de-prueba', h, m, sunday)) hits++;
    assert.equal(hits, 1);
  }
});

test('hasSundaySession: solo cuenta el plan de la semana en curso y que el domingo tenga distancia', () => {
  const now = Date.UTC(2026, 9, 11, 23, 0, 0);   // domingo 11/10, 20:00 en Buenos Aires
  const tz = 'America/Argentina/Buenos_Aires';
  const withSun = [{ dist: 5 }, { dist: 0 }, { dist: 5 }, { dist: 0 }, { dist: 5 }, { dist: 0 }, { dist: 10 }];
  const noSun = [{ dist: 5 }, { dist: 0 }, { dist: 5 }, { dist: 0 }, { dist: 5 }, { dist: 8 }, { dist: 0 }];
  assert.equal(hasSundaySession(withSun, '2026-10-05', tz, now), true);
  assert.equal(hasSundaySession(noSun, '2026-10-05', tz, now), false);
  assert.equal(hasSundaySession(withSun, '2026-09-28', tz, now), false, 'plan de otra semana');
  assert.equal(hasSundaySession(null, '2026-10-05', tz, now), false);
});

// ---- pausa de racha ----
test('pausa de racha: una semana sin cumplir NO corta la racha mientras está en pausa, y sin pausa sí', () => {
  const app = loadApp();
  const monday = app.getMondayISO(new Date());
  const plan = [{ dist: 8, status: 'skipped' }, { dist: 5 }, { dist: 0 }];
  app.state.runs = [];

  app.state.streakWeeks = 5; app.state.streakPause = null;
  app.buildWeeklyRecapMessage(plan, monday, 1);
  assert.equal(app.state.streakWeeks, 0, 'sin pausa se corta');

  app.state.streakWeeks = 5; app.state.streakPause = { since: monday };
  const msg = app.buildWeeklyRecapMessage(plan, monday, 1);
  assert.equal(app.state.streakWeeks, 5, 'con pausa se conserva');
  assert.match(msg, /⏸/);

  // aunque el corredor haya desaparecido varias semanas (diffWeeks > 1), la pausa la sostiene
  app.state.streakWeeks = 5; app.state.streakPause = { since: monday };
  app.buildWeeklyRecapMessage(plan, monday, 3);
  assert.equal(app.state.streakWeeks, 5);
});

test('pausa de racha: si igual cumple el plan sigue sumando; vence a las 4 semanas y se limpia', () => {
  const app = loadApp();
  const monday = app.getMondayISO(new Date());
  const done = [{ dist: 8, status: 'done' }, { dist: 5, status: 'done' }];
  app.state.runs = [];
  app.state.streakWeeks = 3; app.state.streakPause = { since: monday };
  app.buildWeeklyRecapMessage(done, monday, 1);
  assert.equal(app.state.streakWeeks, 4, 'cumplió: suma aunque esté en pausa');

  const old = new Date(Date.now() - 6 * 7 * 864e5);
  app.state.streakPause = { since: app.getMondayISO(old) };
  assert.equal(app.streakPauseActive(), false, 'una pausa de hace 6 semanas ya venció');

  const fourWeeksAgo = app.getMondayISO(new Date(Date.now() - 4 * 7 * 864e5));
  app.state.streakWeeks = 6; app.state.streakPause = { since: fourWeeksAgo };
  assert.equal(app.streakPauseActive(), true, 'a las 4 semanas todavía cubre esa última semana');
  app.buildWeeklyRecapMessage([{ dist: 8, status: 'skipped' }], monday, 1);
  assert.equal(app.state.streakWeeks, 6);
  assert.equal(app.state.streakPause, null, 'agotada: se limpia sola');
});
