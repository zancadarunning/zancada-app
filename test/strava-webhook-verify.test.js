// Verificación GET que hace Strava al registrar la suscripción: tiene que devolver el hub.challenge con el verify_token correcto,
// también si Strava pega los parámetros a una dirección que ya trae su propio "?k=..." usando otro "?".
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.STRAVA_VERIFY_TOKEN = 'vtoken-123';
const handler = require('../api/strava-webhook');
const mkRes = () => ({ code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.code = this.code || 200; this.body = b; return this; }, send(b) { this.body = b; return this; }, setHeader() {} });

test('GET normal con hub.* en la query: responde el challenge', async () => {
  const res = mkRes();
  await handler({ method: 'GET', url: '/api/strava-webhook?k=abc&hub.mode=subscribe&hub.verify_token=vtoken-123&hub.challenge=xyz', query: { k: 'abc', 'hub.mode': 'subscribe', 'hub.verify_token': 'vtoken-123', 'hub.challenge': 'xyz' }, headers: {} }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { 'hub.challenge': 'xyz' });
});

test('GET con los parámetros pegados con un segundo "?": se leen de la URL cruda', async () => {
  const res = mkRes();
  const url = '/api/strava-webhook?k=abc?hub.verify_token=vtoken-123&hub.challenge=xyz&hub.mode=subscribe';
  await handler({ method: 'GET', url, query: { k: 'abc?hub.verify_token=vtoken-123', 'hub.challenge': 'xyz', 'hub.mode': 'subscribe' }, headers: {} }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { 'hub.challenge': 'xyz' });
});

test('GET con token equivocado, sin token o en otro modo: 403', async () => {
  for (const q of ['hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1', 'hub.mode=subscribe&hub.challenge=1', 'hub.mode=unsubscribe&hub.verify_token=vtoken-123&hub.challenge=1', '']) {
    const res = mkRes();
    const query = Object.fromEntries(new URLSearchParams(q));
    await handler({ method: 'GET', url: '/api/strava-webhook' + (q ? '?' + q : ''), query, headers: {} }, res);
    assert.equal(res.code, 403, q);
  }
});
