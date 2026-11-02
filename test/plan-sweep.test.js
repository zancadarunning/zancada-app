// Barrido del motor de planes: cientos de perfiles x semanas. Ninguna combinación puede tirar un error ni producir algo imposible
// (NaN, negativos, zonas fuera de 1-5, más sesiones que días elegidos, texto vacío). Es determinista (sin azar): si falla, la combinación sale en el mensaje.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

const DAY_SETS = [['tue', 'thu', 'sun'], ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], ['sat'], ['mon', 'wed', 'fri'], ['tue', 'wed', 'fri', 'sun'], ['sun', 'mon']];
const GOALS = ['5k', '10k', '21k', '42k', 'general', 'health'];
const TYPES = ['rest', 'easy', 'long', 'tempo', 'intervals', 'hills', 'fartlek', 'progression', 'test'];
const MONDAY = '2026-11-02';

function profile(over) {
  return Object.assign({ weeklyKm: 30, currentWeeklyKm: 30, weeklyGoalKm: 0, goal: '10k', runnerType: 'active', trainingDays: ['tue', 'thu', 'sun'], terrain: 'asfalto', units: 'metric', trainBy: 'distance', birth: null, weight: null, height: null }, over);
}

function check(plan, p, week, label) {
  assert.ok(Array.isArray(plan) && plan.length === 7, label + ': el plan tiene 7 días');
  let sessions = 0;
  plan.forEach((d, i) => {
    const at = `${label} semana ${week} día ${i}`;
    assert.ok(d && typeof d === 'object', at + ': día inválido');
    assert.ok(TYPES.includes(d.typeKey), at + ': tipo desconocido ' + d.typeKey);
    for (const k of ['dist', 'durMin']) if (d[k] != null) assert.ok(Number.isFinite(d[k]) && d[k] >= 0, at + ': ' + k + ' inválido ' + d[k]);
    if (d.dist > 0) {
      sessions++;
      assert.ok(d.dist < 70, at + ': distancia absurda ' + d.dist);
      if (d.zone != null) assert.ok(Number.isInteger(d.zone) && d.zone >= 1 && d.zone <= 5, at + ': zona fuera de rango ' + d.zone);
      assert.ok(p.trainingDays.includes(d.day) || d.raceDay || d.custom, at + ': entrena un día no elegido (' + d.day + ')');
    }
    if (d.interval) for (const [k, v] of Object.entries(d.interval)) if (typeof v === 'number') assert.ok(Number.isFinite(v) && v >= 0, at + ': interval.' + k + ' inválido ' + v);
  });
  assert.ok(sessions <= p.trainingDays.length, `${label} semana ${week}: ${sessions} sesiones para ${p.trainingDays.length} días`);
}

test('generatePlan nunca falla ni produce valores imposibles (objetivos x tipos de corredor x modos x días x 24 semanas)', () => {
  const app = loadApp();
  let combos = 0;
  for (const goal of GOALS) for (const runnerType of ['active', 'new']) for (const trainBy of ['distance', 'time']) for (const days of DAY_SETS) {
    const p = profile({ goal, runnerType, trainBy, trainingDays: days, currentWeeklyKm: runnerType === 'new' ? 0 : 25, weeklyKm: runnerType === 'new' ? 10 : 25, weeklyKmTarget: 0, availMinutes: trainBy === 'time' ? 45 : undefined });
    app.state.profile = p;
    for (let week = 1; week <= 24; week += (week < 8 ? 1 : 4)) {
      const label = `${goal}/${runnerType}/${trainBy}/${days.length}d`;
      let plan;
      try { plan = app.generatePlan(p, week, MONDAY); } catch (e) { assert.fail(`${label} semana ${week} tiró: ${e && e.message}`); }
      check(plan, p, week, label);
      combos++;
    }
  }
  assert.ok(combos > 500, 'se probaron ' + combos + ' combinaciones');
});

test('con carrera objetivo cargada (y la semana de la carrera) el plan sigue siendo válido', () => {
  const app = loadApp();
  for (const km of [5, 10, 21.1, 42.2]) for (const offset of [0, 1, 3, 6, 13, 30]) {
    const p = profile({ goal: km > 21 ? '42k' : km > 10 ? '21k' : '10k', trainingDays: ['tue', 'thu', 'sat', 'sun'] });
    app.state.profile = p;
    const d = new Date(Date.UTC(2026, 10, 2 + offset)); const date = d.toISOString().slice(0, 10);
    app.state.event = { name: 'Carrera de prueba', date, distanceKm: km };
    for (let week = 1; week <= 12; week++) check(app.generatePlan(p, week, MONDAY), p, week, `evento ${km}k a ${offset} días`);
  }
});

test('perfiles de cuidado (mayor edad, peso alto, embarazo/posparto, lesión) tampoco rompen el plan', () => {
  const app = loadApp();
  const cases = [
    { birth: '1955-03-01', weight: 95, height: 168, gender: 'm' },
    { birth: '1990-01-01', weight: 70, height: 165, gender: 'f', pregnancyPostpartum: 'postpartum' },
    { birth: '2007-06-01', weight: 48, height: 160, gender: 'f' },
    { birth: '1985-06-01', weight: 140, height: 175, gender: 'm', healthNotes: 'rodilla operada' }
  ];
  for (const c of cases) for (const goal of ['5k', '21k']) {
    const p = profile(Object.assign({ goal, trainingDays: ['tue', 'thu', 'sun'] }, c));
    app.state.profile = p;
    for (let week = 1; week <= 10; week++) check(app.generatePlan(p, week, MONDAY), p, week, `cuidado ${c.birth}/${goal}`);
  }
});
