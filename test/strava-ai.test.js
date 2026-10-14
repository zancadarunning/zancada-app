// API Policy de Strava (2026), sección 5.3: los datos de Strava no pueden usarse como contexto de una IA.
// El contexto que arma app.js para Zonda tiene que salir solo de carreras que NO son de Strava.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const body = fn => {
  const i = src.indexOf(`function ${fn}`);
  assert.ok(i >= 0, `falta ${fn}`);
  const j = src.indexOf('\nfunction ', i + 10);
  return src.slice(i, j > 0 ? j : i + 4000);
};

test('aiVisibleRuns descarta las carreras importadas de Strava', () => {
  assert.match(body('aiVisibleRuns'), /source\s*!==\s*'strava'/);
});

test('el contexto de Zonda usa solo carreras sin Strava', () => {
  const i = src.indexOf('const aiRuns = aiVisibleRuns()');
  assert.ok(i > 0, 'el contexto del coach debe partir de aiVisibleRuns()');
  const ctx = src.slice(i, i + 6000);
  assert.match(ctx, /runsByDateAsc\(aiRuns\)/);
  assert.match(ctx, /aiRuns\.filter\(/);
  assert.match(ctx, /hasStravaRuns \? null : calcTrainingLoad\(aiRuns\)/);
  assert.doesNotMatch(ctx.split('=== PLAN DE ESTA SEMANA')[0], /state\.runs\.(filter|slice|map|reduce)/);
});
