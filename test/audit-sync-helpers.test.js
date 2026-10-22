// Auditoría octubre 2026: una falla pasajera al pedir parciales/streams (límite de uso, servicio caído) NO puede dejar la carrera marcada como "completa" (splitsV 3) para siempre.
const test = require('node:test');
const assert = require('node:assert/strict');
const { activityToRun, fetchStreams } = require('../api/_lib/strava-activity-helpers');
const { fetchFitSplits: polarFit } = require('../api/_lib/polar-activity-helpers');
const { fetchFitSplits: wahooFit } = require('../api/_lib/wahoo-activity-helpers');

const act = { id: 99, start_date: '2026-10-20T10:00:00Z', start_date_local: '2026-10-20T07:00:00Z', distance: 5000, moving_time: 1500, name: 'x', map: null };
const withFetch = async (impl, fn) => { const real = global.fetch; global.fetch = impl; try { return await fn(); } finally { global.fetch = real; } };
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });

test('Strava: con 429 o 5xx los streams quedan _failed y la carrera NO se marca splitsV 3 (se reintenta)', async () => {
  for (const status of [429, 500, 503]) {
    const run = await withFetch(async () => resp(status, { message: 'Rate Limit Exceeded' }), () => activityToRun(act, 'tok'));
    assert.equal(run.splitsV, undefined, 'status ' + status);
  }
  const f = await withFetch(async () => { throw new Error('fetch failed'); }, () => fetchStreams(99, 'tok'));
  assert.equal(f._failed, true);
});

test('Strava: una actividad sin streams (404, manual) sí es definitiva: splitsV 3', async () => {
  const run = await withFetch(async () => resp(404, { message: 'Record Not Found' }), () => activityToRun(act, 'tok'));
  assert.equal(run.splitsV, 3);
});

test('Polar y Wahoo: 429/5xx y cortes de red marcan _failed; un 404 (sin archivo) es definitivo', async () => {
  for (const [name, fn] of [['polar', () => polarFit('ex1', 'tok')], ['wahoo', () => wahooFit('https://x.test/file.fit', 'tok')]]) {
    assert.equal((await withFetch(async () => resp(429, {}), fn))._failed, true, name + ' 429');
    assert.equal((await withFetch(async () => resp(503, {}), fn))._failed, true, name + ' 503');
    assert.equal((await withFetch(async () => { throw new Error('fetch failed'); }, fn))._failed, true, name + ' red');
    assert.equal((await withFetch(async () => resp(404, {}), fn))._failed, undefined, name + ' 404');
  }
});
