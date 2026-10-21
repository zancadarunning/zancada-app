// test/token-migration-columns.test.js
//
// scripts/encrypt-existing-tokens.js pide a cada tabla solo las columnas de tokens que existen (Polar no tiene refresh_token: pedirla da un error 400).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'encrypt-existing-tokens.js'), 'utf8');

function columnsFor(brand) {
  const start = script.indexOf(brand + '_connections: [');
  assert.ok(start >= 0, brand + ': falta en el script');
  const list = script.slice(script.indexOf('[', start) + 1, script.indexOf(']', start));
  return list.split(',').map(c => c.trim().replace(/'/g, '')).filter(Boolean);
}

for (const brand of ['strava', 'polar', 'wahoo', 'coros', 'suunto']) {
  test(brand + ': el script pide solo columnas que existen', () => {
    const cols = columnsFor(brand);
    assert.ok(cols.includes('access_token'));
    const sqlFile = path.join(__dirname, '..', 'sql', 'create_' + brand + '_connections.sql');
    if (!fs.existsSync(sqlFile)) return;   // la tabla de Strava se creó a mano, sin archivo en sql/
    const hasRefresh = fs.readFileSync(sqlFile, 'utf8').split('\n').some(l => l.trim().startsWith('refresh_token'));
    assert.equal(cols.includes('refresh_token'), hasRefresh, 'refresh_token');
  });
}
