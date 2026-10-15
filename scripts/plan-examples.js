#!/usr/bin/env node
// Ejemplos del plan por fases, semana por semana, junto al plan de siempre (v4).
//
// Uso:   node scripts/plan-examples.js [--md]
//
// Carga app.js en el mismo "navegador de mentira" que usan los tests (test/support/load-app),
// congela el reloj y, para cada corredor de ejemplo, arma el cronograma con las funciones de la
// app (refreshPhaseSchedule) y genera cada semana con generatePlan: una vez con el cronograma
// activo (plan por fases) y otra con state.phaseSchedule = null (el plan v4 de siempre, con
// weekNumber 1, 2, 3... en orden). No reimplementa nada del plan: solo lee lo que la app arma.
// Imprime por stdout (tablas de texto, o Markdown con --md) y no escribe nada más.
//
// "Carrera en N semanas": la carrera cae en el domingo de la semana N+1 del plan, o sea que la
// primera semana impresa tiene weeksToRace = N. (Con N = 6 son las 6 semanas útiles mínimas
// para que el plan por fases arranque: R = N - 2 >= 4.)

const path = require('node:path');
const vm = require('node:vm');
const { loadApp } = require(path.join(__dirname, '..', 'test', 'support', 'load-app'));

// "Hoy" congelado (miércoles): el ancla del cronograma es el lunes siguiente, 2026-10-19.
const FROZEN_TODAY = '2026-10-14T12:00:00';
const HARD_TYPES = ['tempo', 'intervals', 'hills', 'fartlek', 'progression'];

function makeFrozenDate(nowIso) {
  const frozen = new Date(nowIso).getTime();
  class FrozenDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(frozen);
      else super(...args);
    }
    static now() { return frozen; }
  }
  return FrozenDate;
}

const r1 = x => Math.round(x * 10) / 10;

// Los ejemplos: cada uno es un grupo con una o más corridas (el de 42k tiene dos).
function exampleDefs() {
  const prof = (goal, km, days, refKm, refSec) => ({
    goal, runnerType: 'active', weeklyKm: km, currentWeeklyKm: km, weeklyGoalKm: 0,
    trainingDays: days, terrain: 'asfalto', units: 'metric', trainBy: 'distance',
    birth: null, weight: null, height: null,
    refRace: { distanceKm: refKm, durationSec: refSec, date: '2026-09-20' },
  });
  const d4 = ['tue', 'wed', 'fri', 'sun'];
  return [
    { id: 1, title: 'Activo 10k, carrera en 10 semanas (30 km/sem, 4 dias)',
      runs: [{ label: '10k en 10 semanas', profile: prof('10k', 30, d4, 10, 52 * 60), weeksToRace: 10 }] },
    { id: 2, title: 'Activo 21k, carrera en 16 semanas (35 km/sem, 4 dias)',
      runs: [{ label: '21k en 16 semanas', profile: prof('21k', 35, d4, 21.0975, 115 * 60), weeksToRace: 16 }] },
    { id: 3, title: 'Activo 42k (40 km/sem, 5 dias): carrera en 20 y en 30 semanas',
      runs: [20, 30].map(w => ({ label: '42k en ' + w + ' semanas',
        profile: prof('42k', 40, ['mon', 'tue', 'thu', 'fri', 'sun'], 42.195, 250 * 60), weeksToRace: w })) },
    { id: 4, title: 'Activo 5k, carrera en 6 semanas (25 km/sem, 3 dias): caso comprimido',
      runs: [{ label: '5k en 6 semanas', profile: prof('5k', 25, ['tue', 'thu', 'sun'], 5, 27 * 60), weeksToRace: 6 }] },
    { id: 5, title: 'Activo 21k con la carrera ya pasada: la semana de carrera y las 8 siguientes',
      runs: [{ label: '21k, carrera pasada', profile: prof('21k', 35, d4, 21.0975, 115 * 60), weeksToRace: 16, after: 8 }] },
    { id: 6, title: 'Base baja y ambicioso: 10 km/sem a un 42k en 24 semanas (3 dias)',
      runs: [{ label: '42k en 24 semanas, base 10 km', profile: prof('42k', 10, ['tue', 'thu', 'sun'], 5, 33 * 60), weeksToRace: 24 }] },
  ];
}

function runExample(def) {
  const app = loadApp();
  const profile = JSON.parse(JSON.stringify(def.profile));
  app.Date = makeFrozenDate(FROZEN_TODAY);
  app.persist = () => Promise.resolve(); // sin red ni disco
  app.state.profile = profile;
  app.state.event = null;
  app.state.lastEventDate = null;
  app.state.phaseSchedule = null;

  const anchor = app.addDaysToIsoLocal(app.getMondayISO(new app.Date()), 7);
  const raceMonday = app.addDaysToIsoLocal(anchor, def.weeksToRace * 7);
  profile.raceDate = app.addDaysToIsoLocal(raceMonday, 6); // el domingo de esa semana
  app.refreshPhaseSchedule();
  const schedule = JSON.parse(JSON.stringify(app.state.phaseSchedule));
  if (def.after) app.Date = makeFrozenDate(app.addDaysToIsoLocal(raceMonday, def.after * 7 + 2) + 'T12:00:00');

  // Semanas a imprimir: desde el ancla hasta la de la carrera (o, con `after`, desde 2 antes de
  // la de la carrera hasta N despues de ella). weekNumber de v4 = semanas desde el ancla + 1.
  const firstIdx = def.after ? def.weeksToRace - 2 : 0;
  const lastIdx = def.weeksToRace + (def.after || 0);
  const caps = vm.runInContext('({ LONG_CAP_KM, PEAK_KM })', app);

  const summarize = (days) => {
    const hard = {};
    let km = 0, longKm = 0, racePace = false, racePaceBlock = false;
    days.forEach(d => {
      km += d.dist || 0;
      if (d.typeKey === 'long') longKm = Math.max(longKm, d.dist || 0);
      if (HARD_TYPES.includes(d.typeKey)) hard[d.typeKey] = (hard[d.typeKey] || 0) + 1;
      if (d.racePaceSec) racePace = true;
      if (d.racePaceBlockKm) racePaceBlock = true;
    });
    const hardList = Object.keys(hard).sort().map(k => hard[k] > 1 ? k + 'x' + hard[k] : k);
    return { km: r1(km), longKm: r1(longKm), hard: hardList, racePace, racePaceBlock };
  };

  const rows = [];
  for (let idx = firstIdx; idx <= lastIdx; idx++) {
    const weekStart = app.addDaysToIsoLocal(anchor, idx * 7);
    const weekNumber = idx + 1;
    const info = app.phaseForWeek(profile, weekStart, app.state.phaseSchedule);
    const phased = summarize(app.generatePlan(profile, weekNumber, weekStart));
    // Volumen que el motor se propone esa semana (antes del taper): lo que km deberia seguir.
    phased.targetKm = info.active
      ? r1(app.phasedWeeklyKm(profile, app.trainingCaution(profile), info, app.phaseEffectiveWeeklyKm(profile, false)).km) : null;
    // v4: el mismo perfil sin cronograma (la descarga de v4 es cada 4ta semana, salvo en el taper).
    const saved = app.state.phaseSchedule;
    app.state.phaseSchedule = null;
    const v4 = summarize(app.generatePlan(profile, weekNumber, weekStart));
    v4.cutback = app.isCutbackWeek(weekNumber) && app.taperMultiplier(profile, weekStart) >= 1;
    app.state.phaseSchedule = saved;
    rows.push({
      weekNumber, weekStart,
      phase: info.active ? info.phase : 'v4',
      weeksToRace: info.active ? info.weeksToRace : null,
      weeksAfter: info.active && info.weeksAfter ? info.weeksAfter : 0,
      cutback: app.phaseIsCutbackWeek(info),
      plan: phased, v4,
    });
  }

  const pace = app.phaseRacePaceSec(profile.goal);
  return {
    label: def.label, goal: profile.goal, raceDate: profile.raceDate, anchor,
    weeklyKm: profile.weeklyKm, trainingDays: profile.trainingDays.join('/'),
    refRace: profile.refRace.distanceKm + ' km en ' + app.fmtDurationShort(profile.refRace.durationSec),
    racePace: pace ? app.fmtPace(pace / 60) + ' /km' : null,
    peakKm: Number.isFinite(schedule.peakKm) ? r1(schedule.peakKm) : null,
    limited: !!schedule.limited,
    goalPeakKm: caps.PEAK_KM[profile.goal], longCapKm: caps.LONG_CAP_KM[profile.goal],
    rows,
  };
}

// Devuelve los 6 grupos de ejemplos: [{id, title, runs: [{label, rows, ...}]}].
function buildExamples() {
  return exampleDefs().map(g => ({ id: g.id, title: g.title, runs: g.runs.map(runExample) }));
}

function tagsOf(row) {
  const t = [];
  if (row.plan.racePace) t.push(row.plan.racePaceBlock ? 'RP+L' : 'RP');
  if (row.cutback) t.push('cut');
  return t.join(' ');
}
function weekLabel(row) {
  if (row.weeksAfter) return '+' + row.weeksAfter;
  return row.weeksToRace === null ? '-' : String(row.weeksToRace);
}

function renderRun(run, md) {
  const head = ['#', 'Semana', 'Fase', 'A carrera', 'km', 'Obj.', 'Larga', 'Fuertes', 'Ritmo carr.', 'Desc.', '', 'v4 km', 'v4 larga', 'v4 fuertes', 'v4 desc.'];
  const body = run.rows.map(row => [
    String(row.weekNumber), row.weekStart, row.phase, weekLabel(row),
    row.plan.km.toFixed(1), row.plan.targetKm === null ? '-' : row.plan.targetKm.toFixed(1), row.plan.longKm.toFixed(1), row.plan.hard.join(',') || '-',
    row.plan.racePace ? (row.plan.racePaceBlock ? 'RP+L' : 'RP') : '', row.cutback ? 'cut' : '',
    '|',
    row.v4.km.toFixed(1), row.v4.longKm.toFixed(1), row.v4.hard.join(',') || '-', row.v4.cutback ? 'cut' : '',
  ]);
  const lines = [];
  const info = [
    'Carrera: ' + run.raceDate + ' (' + run.goal + ')   Ancla (semana 1): ' + run.anchor,
    'Perfil: ' + run.weeklyKm + ' km/sem, dias ' + run.trainingDays + '   Marca de referencia: ' + run.refRace,
    'Ritmo de carrera: ' + (run.racePace || 'sin prediccion') + '   Pico del cronograma (peakKm): ' +
      (run.peakKm === null ? 'n/d' : run.peakKm + ' km') + ' (techo de la distancia ' + run.goalPeakKm + ' km)   limited: ' +
      run.limited + '   Tope de tirada: ' + run.longCapKm + ' km',
  ];
  if (md) {
    lines.push('### ' + run.label, '');
    info.forEach(l => lines.push('- ' + l));
    lines.push('', '| ' + head.map(h => h || ' ').join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|');
    body.forEach(r => lines.push('| ' + r.map(c => c === '|' ? ' ' : c).join(' | ') + ' |'));
  } else {
    lines.push('--- ' + run.label + ' ---');
    info.forEach(l => lines.push(l));
    const widths = head.map((h, i) => Math.max(h.length, ...body.map(r => r[i].length)));
    const fmt = r => r.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
    lines.push(fmt(head), fmt(widths.map(w => '-'.repeat(w))));
    body.forEach(r => lines.push(fmt(r)));
  }
  lines.push('');
  return lines.join('\n');
}

function renderExamples(groups, md) {
  const out = [];
  out.push(md ? '# Ejemplos del plan por fases (frente al plan v4)' : 'EJEMPLOS DEL PLAN POR FASES (frente al plan v4)');
  out.push('');
  out.push('Reloj congelado en ' + FROZEN_TODAY.slice(0, 10) + '. "A carrera" = semanas hasta la semana de la carrera (+n = n semanas despues). ' +
    'Fuertes = sesiones tempo/intervals/hills/fartlek/progression. RP = hay sesiones al ritmo de carrera, RP+L = ademas un bloque en la tirada. ' +
    'Obj. = volumen que el motor se propone esa semana (antes del taper); km = lo que suman las sesiones ya armadas. cut = semana de descarga. Las columnas v4 son el plan de siempre (sin cronograma).');
  out.push('');
  groups.forEach(g => {
    out.push(md ? '## ' + g.id + '. ' + g.title : g.id + '. ' + g.title.toUpperCase());
    out.push('');
    g.runs.forEach(run => out.push(renderRun(run, md)));
  });
  return out.join('\n');
}

module.exports = { buildExamples, renderExamples };

if (require.main === module) {
  const md = process.argv.includes('--md');
  process.stdout.write(renderExamples(buildExamples(), md) + '\n');
}
