// Pedido del dueño 2026-11-22: al correr (o hacer un ejercicio) la barra de abajo desaparece y queda solo el botón de pausa; vuelve al terminar o al quitar el ejercicio.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('el CSS esconde la barra con body.exercising (con !important, porque el JS le pone display inline)', () => {
  assert.match(html, /body\.exercising nav\.tabbar\{display:none !important;\}/);
});

test('el botón de pausa baja al borde cuando no hay barra', () => {
  assert.match(html, /body\.exercising \.track-active-group \.track-pause-circle\{bottom:calc\(28px \+ var\(--safe-bottom\)\);\}/);
});

test('la clase se calcula donde ya se decide el estado del ejercicio y solo con la vista Correr a la vista', () => {
  assert.match(app, /document\.body\.classList\.toggle\('exercising', !!\(inExercise && document\.getElementById\('view-correr'\)\.classList\.contains\('active'\)\)\)/);
});

test('arrancar y terminar la carrera vuelven a calcularla (la barra reaparece en el resumen)', () => {
  // actuallyStartRun y showRunSummaryUI llaman a updateCoachFabVisibility, que es donde se alterna la clase
  const start = app.indexOf("document.getElementById('runActive').style.display='block';");
  const startCall = app.indexOf('updateCoachFabVisibility();', start);
  assert.ok(start > 0 && startCall > start && startCall - start < 400, 'al arrancar');
  const sum = app.indexOf('function showRunSummaryUI()');
  const sumCall = app.indexOf('updateCoachFabVisibility();', sum);
  assert.ok(sum > 0 && sumCall > sum && sumCall - sum < 400, 'al terminar');
});

test('la tarjeta "Sesión completada" usa mm:ss y las cajas pueden achicarse (se veía cortada: 00:02:49 desbordaba)', () => {
  assert.match(app, /getElementById\('run-done-time'\)\.textContent = fmtRaceTime\(todayRun\.durationSec\)/);
  assert.match(html, /\.stat-box\{flex:1; min-width:0;/);
});

test('los números de la tarjeta "Sesión completada" no se parten en dos líneas', () => {
  assert.match(html, /#run-done-today-card \.stat-box \.n\{font-size:clamp\(15px, 4\.6vw, 20px\); white-space:nowrap;\}/);
});

test('con la sesión de hoy hecha, la tarjeta "Programado" se oculta y queda correr libre', () => {
  assert.match(app, /getElementById\('run-mode-scheduled'\)\.style\.display = doneToday \? 'none' : ''/);
  assert.match(app, /selectedRunMode = doneToday \? 'free' : 'scheduled'/);
});
