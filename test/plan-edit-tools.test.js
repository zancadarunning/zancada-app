// test/plan-edit-tools.test.js
//
// Recortes y cambios del plan que hace el coach (o la app tras una molestia / un "mal"): el texto del día tiene que quedar resuelto (sin "undefined" ni "NaNm"),
// y en un plan por TIEMPO los minutos (durMin) tienen que cambiar junto con la distancia, porque es lo que muestra la pantalla.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

const ZONES = { 1: { min: 100, max: 120 }, 2: { min: 120, max: 140 }, 3: { min: 140, max: 150 }, 4: { min: 150, max: 165 }, 5: { min: 165, max: 190 } };

function setup(over) {
  const app = loadApp();
  app.state.onboarded = true;
  app.state.profile = { units: 'metric', trainBy: 'distance', goal: '10k', runnerType: 'active', currentWeeklyKm: 30, weeklyKm: 30, trainingDays: ['tue', 'thu', 'sun'], createdAt: '2020-01-01', hrZones: ZONES, terrain: 'asfalto', ...(over && over.profile) };
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.plan = [
    { day: 'mon', typeKey: 'rest', dist: 0 },
    { day: 'tue', typeKey: 'intervals', dist: 7, zone: 4, interval: { reps: 6, repMeters: 800, recoveryMin: 2 } },
    { day: 'wed', typeKey: 'rest', dist: 0 },
    { day: 'thu', typeKey: 'easy', dist: 8, zone: 2 },
    { day: 'fri', typeKey: 'rest', dist: 0 },
    { day: 'sat', typeKey: 'rest', dist: 0 },
    { day: 'sun', typeKey: 'long', dist: 14, zone: 2 },
  ];
  if (over && over.plan) app.state.plan = over.plan;
  return app;
}
const shown = (app, d) => JSON.stringify(app.planLabel(d));

test('bajar la intensidad deja cada día con su texto resuelto: nada de "undefined" ni "NaNm", y las series bajan de repeticiones', () => {
  const app = setup();
  app.lowerRemainingIntensity(-15);
  for (const d of app.state.plan.filter(x => x.dist > 0)) {
    assert.equal(d.custom, true);
    assert.ok(d.type && d.desc, d.day + ' tiene type/desc');
    assert.doesNotMatch(shown(app, d), /undefined|NaN|null/, d.day);
  }
  const tue = app.state.plan[1];
  assert.match(tue.desc, /5 repeticiones/, '6 reps -15% = 5');
});

test('bajar la sesión de hoy: con un decimal (2 km no se quedan en 2 km) y protegida contra la regeneración', () => {
  const app = setup({ plan: Array.from({ length: 7 }, (_, i) => ({ day: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][i], typeKey: 'easy', dist: 2, zone: 2 })) });
  const idx = (new Date().getDay() + 6) % 7;
  assert.equal(app.lowerTodaySession(-15), true);
  const d = app.state.plan[idx];
  assert.equal(d.dist, 1.7);
  assert.equal(d.custom, true);
  assert.doesNotMatch(shown(app, d), /undefined|NaN/);
});

test('plan por tiempo: bajar la intensidad cambia los minutos (lo que muestra la pantalla), también con trote/caminata', () => {
  const app = setup({
    profile: { trainBy: 'time' },
    plan: [
      { day: 'mon', typeKey: 'rest', dist: 0 },
      { day: 'tue', typeKey: 'easy', dist: 4, zone: 2, durMin: 40, timeBased: true },
      { day: 'wed', typeKey: 'rest', dist: 0 },
      { day: 'thu', typeKey: 'easy', dist: 2, zone: 2, durMin: 20, timeBased: true, runWalk: { reps: 5, runSec: 120, walkSec: 120 } },
      { day: 'fri', typeKey: 'rest', dist: 0 }, { day: 'sat', typeKey: 'rest', dist: 0 }, { day: 'sun', typeKey: 'rest', dist: 0 },
    ],
  });
  app.lowerRemainingIntensity(-25);
  assert.equal(app.state.plan[1].durMin, 30);
  assert.equal(app.state.plan[3].runWalk.reps, 4);
  assert.equal(app.state.plan[3].durMin, 16, '4 repeticiones de 2 + 2 minutos');
});

test('mover la sesión en un plan por tiempo: los minutos viajan con ella', () => {
  const app = setup({
    profile: { trainBy: 'time' },
    plan: [
      { day: 'mon', typeKey: 'rest', dist: 0 },
      { day: 'tue', typeKey: 'easy', dist: 4, zone: 2, durMin: 30, timeBased: true },
      { day: 'wed', typeKey: 'rest', dist: 0 }, { day: 'thu', typeKey: 'rest', dist: 0 }, { day: 'fri', typeKey: 'rest', dist: 0 },
      { day: 'sat', typeKey: 'long', dist: 9, zone: 2, durMin: 60, timeBased: true },
      { day: 'sun', typeKey: 'rest', dist: 0 },
    ],
  });
  assert.equal(app.swapPlanDaySessions(app.state.plan[1], app.state.plan[5]), true);
  assert.equal(app.state.plan[1].typeKey, 'long');
  assert.equal(app.state.plan[1].durMin, 60);
  assert.equal(app.state.plan[5].typeKey, 'easy');
  assert.equal(app.state.plan[5].durMin, 30);
});

test('coach: ajustar el volumen en un plan por tiempo cambia durMin; y modificar_sesion con duracion_min fija los minutos', () => {
  const app = setup({
    profile: { trainBy: 'time' },
    plan: [
      { day: 'mon', typeKey: 'rest', dist: 0 }, { day: 'tue', typeKey: 'rest', dist: 0 }, { day: 'wed', typeKey: 'rest', dist: 0 }, { day: 'thu', typeKey: 'rest', dist: 0 },
      { day: 'fri', typeKey: 'rest', dist: 0 }, { day: 'sat', typeKey: 'rest', dist: 0 },
      { day: 'sun', typeKey: 'long', dist: 9, zone: 2, durMin: 60, timeBased: true },
    ],
  });
  // el domingo es el último día de la semana: solo queda ajustable si hoy no es posterior (aislamos de la fecha del reloj marcando "hoy" = lunes)
  const realDay = Date.prototype.getDay;
  Date.prototype.getDay = function () { return 1; };
  try {
    app.applyVolumeAdjust({ porcentaje: 25 });
    assert.equal(app.state.plan[6].durMin, 75);
    assert.doesNotMatch(shown(app, app.state.plan[6]), /undefined|NaN/);
    const r = app.applyPlanChange({ dia: 'sun', tipo: 'Rodaje', tipo_categoria: 'easy', descripcion: 'suave', duracion_min: 45, zona: 2 });
    assert.match(r, /^OK/);
    assert.equal(app.state.plan[6].durMin, 45);
  } finally { Date.prototype.getDay = realDay; }
});

test('modificar_sesion sobre un día de descanso sin distancia ni duración se rechaza (antes decía OK y dejaba 0 km)', () => {
  const app = setup();
  const realDay = Date.prototype.getDay;
  Date.prototype.getDay = function () { return 1; };
  try {
    const r = app.applyPlanChange({ dia: 'wed', tipo: 'Rodaje', tipo_categoria: 'easy', descripcion: 'suave', zona: 2 });
    assert.match(r, /Falta distancia_km o duracion_min/);
    assert.equal(app.state.plan[2].custom, undefined, 'no tocó el día');
    assert.match(app.applyPlanChange({ dia: 'wed', tipo: 'Rodaje', tipo_categoria: 'easy', descripcion: 'suave', zona: 2, distancia_km: 5 }), /^OK/);
  } finally { Date.prototype.getDay = realDay; }
});
