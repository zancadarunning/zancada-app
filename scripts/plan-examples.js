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
    // Escenarios agregados en la tanda de arreglos de la revisión final (transiciones y casos borde).
    { id: 7, title: 'Entrada desde v4: 10k, ya en la semana 13 de v4 (30 km/sem de base, ~46 km reales, 4 dias)',
      runs: [{ label: '10k en 12 semanas, desde la semana 13 de v4', profile: prof('10k', 30, d4, 10, 52 * 60), weeksToRace: 12, wn0: 13, showCurrent: true,
        note: 'La primera fila (v4) es la semana en curso cuando se crea el cronograma; la rampa arranca en lo que v4 daba la semana siguiente.' }] },
    { id: 8, title: 'Cambio de la fecha de carrera a mitad del plan (21k, 35 km/sem, 4 dias)',
      runs: [
        { label: '21k: carrera 1 semana mas tarde (cambio en la semana 7)', profile: prof('21k', 35, d4, 21.0975, 115 * 60), weeksToRace: 16, edit: { atIdx: 6, shiftDays: 7 },
          note: 'El miercoles de la semana 7 se corre la carrera una semana; desde la semana 8 manda el cronograma nuevo.' },
        { label: '21k: carrera 1 dia antes (misma semana, cambio en la semana 7)', profile: prof('21k', 35, d4, 21.0975, 115 * 60), weeksToRace: 16, edit: { atIdx: 6, shiftDays: -1 },
          note: 'Mover la carrera de domingo a sabado de la misma semana conserva el cronograma entero.' },
      ] },
    { id: 9, title: 'Parate de 5 semanas en la fase especifica (42k, 40 km/sem, 5 dias, carrera en 24 semanas)',
      runs: [{ label: '42k: parate de 5 semanas en specific', profile: prof('42k', 40, ['mon', 'tue', 'thu', 'fri', 'sun'], 42.195, 250 * 60), weeksToRace: 24, brk: { lastIdx: 13, backIdx: 18 },
        note: 'Ultima carrera el miercoles de la semana 14; vuelve el miercoles de la semana 19 (rollover con parate: base x0,65, weekNumber 2).' }] },
    { id: 10, title: '5k: corredor de 2 dias (25 km/sem) y corredor de mucho volumen (65 km/sem, 5 dias)',
      runs: [
        { label: '5k en 10 semanas, 2 dias', profile: prof('5k', 25, ['wed', 'sun'], 5, 26 * 60), weeksToRace: 10 },
        { label: '5k en 12 semanas, 65 km/sem', profile: prof('5k', 65, ['mon', 'tue', 'thu', 'fri', 'sun'], 5, 19 * 60), weeksToRace: 12 },
      ] },
    { id: 11, title: 'weekNumber distinto de la semana del plan (21k, 35 km/sem, el plan arranca en la semana 3 de v4)',
      runs: [{ label: '21k en 16 semanas, weekNumber = semana + 2', profile: prof('21k', 35, d4, 21.0975, 115 * 60), weeksToRace: 16, wn0: 2,
        note: 'Las descargas (cut) siguen al plan por fases, no a weekNumber (columna v4 desc.).' }] },
    { id: 12, title: 'Carrera nueva corta elegida en el mantenimiento: 21k (35 km/sem) que un mes despues elige un 10k en 4 semanas',
      runs: [{ label: '21k corrido, en mantenimiento elige un 10k en 4 semanas', profile: prof('21k', 35, d4, 21.0975, 115 * 60), weeksToRace: 16,
        firstIdx: 14, lastIdx: 25, edit: { atIdx: 20, goal: '10k', raceInWeeks: 4 },
        note: 'El miercoles de la semana 21 (mantenimiento) elige un 10k para dentro de 4 semanas: no alcanza para fases (R < 4); desde la semana siguiente manda v4, empalmado con el volumen de mantenimiento de la media (columna v4: el plan de siempre, sin empalme). El pico y el tope de la cabecera son los del cronograma de la media.' }] },
  ];
}

function runExample(def) {
  const app = loadApp();
  const profile = JSON.parse(JSON.stringify(def.profile));
  const startKm = profile.weeklyKm;
  app.Date = makeFrozenDate(FROZEN_TODAY);
  app.persist = () => Promise.resolve(); // sin red ni disco
  app.state.profile = profile;
  app.state.event = null;
  app.state.lastEventDate = null;
  app.state.phaseSchedule = null;

  app.renderChat = () => {};
  app.state.chat = [];
  app.state.runs = [];
  app.state.onboarded = true;
  // weekNumber de v4 en la semana en que se crea el cronograma (wn0, 1 si no se dice): la semana
  // idx del plan es la weekNumber wnBase + idx (wnBase cambia si un evento mueve state.weekNumber).
  const wn0 = def.wn0 || 1;
  app.state.weekNumber = wn0;
  app.state.weekStart = app.getMondayISO(new app.Date());
  const anchor = app.addDaysToIsoLocal(app.state.weekStart, 7);
  const raceMonday = app.addDaysToIsoLocal(anchor, def.weeksToRace * 7);
  profile.raceDate = app.addDaysToIsoLocal(raceMonday, 6); // el domingo de esa semana
  app.refreshPhaseSchedule();
  const schedule = JSON.parse(JSON.stringify(app.state.phaseSchedule));
  if (def.after) app.Date = makeFrozenDate(app.addDaysToIsoLocal(raceMonday, def.after * 7 + 2) + 'T12:00:00');
  // sin wn0 (los 6 ejemplos originales) las filas siguen numeradas como antes: weekNumber = semana del plan
  let wnBase = def.wn0 ? wn0 + 1 : 1;

  // Semanas a imprimir: desde el ancla hasta la de la carrera (o, con `after`, desde 2 antes de
  // la de la carrera hasta N despues de ella; con showCurrent, desde la semana en curso, -1).
  const firstIdx = def.firstIdx !== undefined ? def.firstIdx : def.after ? def.weeksToRace - 2 : def.showCurrent ? -1 : 0;
  const shiftWeeks = def.edit && def.edit.shiftDays > 0 ? Math.round(def.edit.shiftDays / 7) : 0;
  const lastIdx = def.lastIdx !== undefined ? def.lastIdx : def.weeksToRace + (def.after || 0) + shiftWeeks;
  const caps = vm.runInContext('({ LONG_CAP_KM, PEAK_KM })', app);
  const weekOf = idx => app.addDaysToIsoLocal(anchor, idx * 7);
  const wednesday = idx => makeFrozenDate(app.addDaysToIsoLocal(weekOf(idx), 2) + 'T12:00:00');
  // Parate: historia de 8 semanas corriendo la base hasta el miércoles de la semana brk.lastIdx.
  if (def.brk) {
    for (let w = 0; w < 8; w++) {
      app.state.runs.push({ id: 'r' + w, source: 'manual', date: app.addDaysToIsoLocal(weekOf(def.brk.lastIdx), -7 * w + 2) + 'T08:00:00',
        distanceKm: profile.weeklyKm / 3, durationSec: profile.weeklyKm / 3 * 330 });
    }
  }
  const events = [];

  const summarize = (days) => {
    const hard = {};
    let km = 0, longKm = 0, maxEasyKm = 0, racePace = false, racePaceBlock = false;
    days.forEach(d => {
      km += d.dist || 0;
      if (d.typeKey === 'long') longKm = Math.max(longKm, d.dist || 0);
      if (d.typeKey === 'easy') maxEasyKm = Math.max(maxEasyKm, d.dist || 0);
      if (HARD_TYPES.includes(d.typeKey)) hard[d.typeKey] = (hard[d.typeKey] || 0) + 1;
      if (d.racePaceSec) racePace = true;
      if (d.racePaceBlockKm) racePaceBlock = true;
    });
    const hardList = Object.keys(hard).sort().map(k => hard[k] > 1 ? k + 'x' + hard[k] : k);
    return { km: r1(km), longKm: r1(longKm), maxEasyKm: r1(maxEasyKm), hard: hardList, racePace, racePaceBlock };
  };

  const rows = [];
  for (let idx = firstIdx; idx <= lastIdx; idx++) {
    const weekStart = weekOf(idx);
    // Cambio de fecha de carrera: el miércoles de la semana edit.atIdx (lo que sigue usa el cronograma nuevo).
    if (def.edit && idx === def.edit.atIdx + 1) {
      app.Date = wednesday(def.edit.atIdx);
      app.state.weekStart = weekOf(def.edit.atIdx);
      app.state.weekNumber = wnBase + def.edit.atIdx;
      if (def.edit.goal) {
        // meta y carrera nuevas (como con modificar_perfil): la carrera en raceInWeeks semanas, domingo
        profile.goal = def.edit.goal;
        profile.raceDate = app.addDaysToIsoLocal(weekOf(def.edit.atIdx), def.edit.raceInWeeks * 7 + 6);
      } else {
        profile.raceDate = app.addDaysToIsoLocal(profile.raceDate, def.edit.shiftDays);
      }
      app.refreshPhaseSchedule();
      wnBase = app.state.weekNumber - def.edit.atIdx;
      events.push('semana ' + (def.edit.atIdx + 1) + ': ' + (def.edit.goal ? 'meta nueva ' + profile.goal + ' el ' : 'carrera movida a ') + profile.raceDate +
        ' (ancla ' + app.state.phaseSchedule.anchor + (Number.isFinite(app.state.phaseSchedule.peakKm) ? '' : ', sin fases: R < 4') + ')' +
        (app.state.curveWeekOffset ? ', curva de v4 corrida ' + app.state.curveWeekOffset + ' semanas' : ''));
    }
    // Parate: semanas sin correr (no hay plan que mostrar) y la vuelta por el rollover de verdad.
    if (def.brk && idx > def.brk.lastIdx && idx < def.brk.backIdx) {
      const zero = { km: 0, longKm: 0, maxEasyKm: 0, hard: [], racePace: false, racePaceBlock: false, targetKm: null };
      rows.push({ weekNumber: wnBase + idx, weekStart, phase: 'parate', weeksToRace: null, weeksAfter: 0, cutback: false, plan: zero, v4: Object.assign({ cutback: false }, zero) });
      continue;
    }
    if (def.brk && idx === def.brk.backIdx) {
      app.state.weekStart = weekOf(def.brk.lastIdx);
      app.state.weekNumber = wnBase + def.brk.lastIdx;
      app.state.plan = app.generatePlan(profile, app.state.weekNumber, app.state.weekStart);
      app.Date = wednesday(def.brk.backIdx);
      const before = profile.weeklyKm;
      app.checkWeekRollover();
      wnBase = app.state.weekNumber - idx;
      events.push('semana ' + (idx + 1) + ': vuelta del parate, base ' + before + ' -> ' + profile.weeklyKm + ' km, weekNumber ' + app.state.weekNumber +
        (app.state.phaseSchedule && Number.isFinite(app.state.phaseSchedule.peakKm) ? ', rampa reiniciada (ancla ' + app.state.phaseSchedule.anchor + ', pico ' + r1(app.state.phaseSchedule.peakKm) + ' km)' : ', vuelve a v4'));
    }
    const weekNumber = wnBase + idx;
    const info = app.phaseForWeek(profile, weekStart, app.state.phaseSchedule);
    const phased = summarize(app.generatePlan(profile, weekNumber, weekStart));
    // Volumen que el motor se propone esa semana (antes del taper): lo que km deberia seguir.
    phased.targetKm = info.active
      ? r1(app.phasedWeeklyKm(profile, app.trainingCaution(profile), info, app.phaseEffectiveWeeklyKm(profile, false)).km) : null;
    // v4: el mismo perfil sin cronograma (la descarga de v4 es cada 4ta semana, salvo en el taper).
    // (sin el corrimiento de la curva del empalme: es el v4 de antes de la rama)
    const saved = app.state.phaseSchedule, savedOffset = app.state.curveWeekOffset;
    app.state.phaseSchedule = null;
    app.state.curveWeekOffset = 0;
    const v4 = summarize(app.generatePlan(profile, weekNumber, weekStart));
    v4.cutback = app.isCutbackWeek(weekNumber) && app.taperMultiplier(profile, weekStart) >= 1;
    app.state.phaseSchedule = saved;
    app.state.curveWeekOffset = savedOffset;
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
  const finalSched = app.state.phaseSchedule;
  return {
    note: def.note || null, events,
    peakAfterKm: finalSched && Number.isFinite(finalSched.peakKm) && r1(finalSched.peakKm) !== r1(schedule.peakKm) ? r1(finalSched.peakKm) : null,
    label: def.label, goal: profile.goal, raceDate: profile.raceDate, anchor,
    weeklyKm: startKm, trainingDays: profile.trainingDays.join('/'),
    refRace: profile.refRace.distanceKm + ' km en ' + app.fmtDurationShort(profile.refRace.durationSec),
    racePace: pace ? app.fmtPace(pace / 60) + ' /km' : null,
    peakKm: Number.isFinite(schedule.peakKm) ? r1(schedule.peakKm) : null,
    limited: !!schedule.limited,
    // tope de la tirada del plan por fases: el de la distancia, agrandado si el pico lo pasa (phaseLongCapKm)
    goalPeakKm: caps.PEAK_KM[profile.goal], longCapKm: app.phaseLongCapKm(profile.goal, schedule.peakKm),
    rows,
  };
}

// Devuelve los grupos de ejemplos (los 6 originales + 6 de transiciones y casos borde): [{id, title, runs: [{label, rows, ...}]}].
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
  if (row.phase === 'parate') return '-';
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
      run.limited + '   Tope de tirada: ' + run.longCapKm + ' km' + (run.peakAfterKm !== null ? '   Pico despues del evento: ' + run.peakAfterKm + ' km' : ''),
  ];
  if (run.note) info.push('Escenario: ' + run.note);
  run.events.forEach(e => info.push('Evento: ' + e));
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
