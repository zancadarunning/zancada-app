// Las carreras que llegan de relojes se vinculan con el plan en la base (sql/merge_*_runs.sql). Mismo mínimo que el cliente (ver
// test/session-min-run.test.js): la función de la base tiene que existir, tener la misma regla y estar llamada por los cinco merges.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = f => fs.readFileSync(path.join(__dirname, '..', 'sql', f), 'utf8');

test('los cinco merge_*_runs.sql solo marcan el día como hecho si la carrera pasa run_counts_for_session', () => {
  for (const b of ['strava', 'polar', 'wahoo', 'coros', 'suunto']) {
    const s = sql(`merge_${b}_runs.sql`);
    assert.match(s, /AND public\.run_counts_for_session\(v_plan -> v_day_idx, v_run_clean\)/, b);
    assert.ok(s.indexOf('run_counts_for_session') < s.indexOf("'linkedRunId'"), b + ': el chequeo va antes de vincular');
  }
});

test('run_counts_for_session usa el mismo 30% y el Test de 12 minutos que runCountsForSession() de app.js', () => {
  const s = sql('run_counts_for_session.sql');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(app, /SESSION_MIN_FRACTION = 0\.3/);
  assert.match(s, /v_run_km >= v_km \* 0\.3/);
  assert.match(s, /v_run_sec >= v_min \* 60 \* 0\.3/);
  assert.match(s, /typeKey' = 'test' THEN\s+v_min := 12/);
  assert.match(s, /EXCEPTION WHEN OTHERS THEN\s+RETURN true/, 'un plan con datos raros no rompe la sincronización');
});
