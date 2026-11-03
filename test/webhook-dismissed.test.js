// Auditoría 2026-11-03, ronda 2: las carreras que la persona borró a mano no vuelven por los webhooks (Strava, Garmin, Suunto), igual que ya no vuelven por los crons.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withoutDismissed } = require('../api/_lib/known-run-ids');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split(String.fromCharCode(13)).join('');

function mockState(dismissed, ok = true) {
  const real = global.fetch;
  const seen = [];
  global.fetch = async url => { seen.push(String(url)); return { ok, status: ok ? 200 : 500, json: async () => [{ dismissed }] }; };
  return { seen, restore: () => { global.fetch = real; } };
}

test('withoutDismissed saca las carreras borradas a mano (id numérico o texto) y deja las demás', async () => {
  const m = mockState([{ k: 'strava:123', t: 1 }, { k: 'garmin:abc', t: 1 }]);
  try {
    const runs = [{ stravaId: 123 }, { stravaId: 456 }];
    assert.deepEqual(await withoutDismissed('https://x.test', {}, 'u1', 'strava', 'stravaId', runs), [{ stravaId: 456 }]);
    assert.deepEqual(await withoutDismissed('https://x.test', {}, 'u1', 'garmin', 'garminId', [{ garminId: 'abc' }, { garminId: 'def' }]), [{ garminId: 'def' }]);
    assert.deepEqual(await withoutDismissed('https://x.test', {}, 'u1', 'suunto', 'suuntoId', [{ suuntoId: 'abc' }]), [{ suuntoId: 'abc' }], 'la clave es por proveedor');
    assert.ok(m.seen[0].includes('user_id=eq.u1') && m.seen[0].includes('dismissedRuns'));
  } finally { m.restore(); }
});

test('si no hay descartadas, o la lectura falla, no se filtra nada (como antes)', async () => {
  let m = mockState([]);
  try { assert.deepEqual(await withoutDismissed('https://x.test', {}, 'u1', 'strava', 'stravaId', [{ stravaId: 1 }]), [{ stravaId: 1 }]); } finally { m.restore(); }
  m = mockState([{ k: 'strava:1' }], false);
  try { assert.deepEqual(await withoutDismissed('https://x.test', {}, 'u1', 'strava', 'stravaId', [{ stravaId: 1 }]), [{ stravaId: 1 }]); } finally { m.restore(); }
  const real = global.fetch;
  global.fetch = async () => { throw new Error('red'); };
  try { assert.deepEqual(await withoutDismissed('https://x.test', {}, 'u1', 'strava', 'stravaId', [{ stravaId: 1 }]), [{ stravaId: 1 }]); } finally { global.fetch = real; }
  assert.deepEqual(await withoutDismissed('https://x.test', {}, 'u1', 'strava', 'stravaId', []), []);
});

test('los tres webhooks filtran por las descartadas antes de guardar', () => {
  const s = read('api/strava-webhook.js'), g = read('api/garmin-webhook.js'), u = read('api/suunto-webhook.js');
  assert.ok(s.includes("withoutDismissed(base, headers, conn.user_id, 'strava', 'stravaId', [newRun])"));
  assert.ok(u.includes("withoutDismissed(base, headers, c.user_id, 'suunto', 'suuntoId', [run])"));
  assert.equal((g.match(/withoutDismissed\(base, headers, row\.user_id, 'garmin', 'garminId', \[run\]\)/g) || []).length, 3, 'los tres caminos de Garmin (actividad, corregida a mano y detalle)');
  assert.ok(!/mergeGarminRuns\(base, headers, row\.user_id, \[run\]/.test(g), 'ningún merge de Garmin recibe la carrera sin filtrar');
});

test('el respaldo local que no se pudo escribir (servidor más nuevo) NO se estampa con la hora de ahora', () => {
  const src = read('app.js');
  assert.ok(src.includes('function savePendingBackup(tsOverride){'));
  assert.ok(src.includes('if(!hasPendingBackup()) savePendingBackup(new Date(loadedStateVersion).getTime());'));
  assert.ok(!/else \{\s*\n?\s*savePendingBackup\(\);\s*\/\/ no se escribió/.test(src), 'ya no se llama sin argumento en la rama skipWrite');
});
