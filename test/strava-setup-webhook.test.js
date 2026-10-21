// La dirección que se le da a Strava no puede pasar por una redirección (Strava la rechaza con "GET to callback URL does not return 200").
const test = require('node:test');
const assert = require('node:assert/strict');

test('strava-setup-webhook: el callback va directo a www, con el secreto, aunque SITE_URL apunte al dominio sin www', async () => {
  process.env.CRON_SECRET = 'cron-test'; process.env.SITE_URL = 'https://zancada.org';
  process.env.STRAVA_WEBHOOK_SECRET = 'abc123'; process.env.STRAVA_VERIFY_TOKEN = 'vt'; process.env.STRAVA_CLIENT_ID = '1'; process.env.STRAVA_CLIENT_SECRET = 's';
  delete process.env.STRAVA_WEBHOOK_BASE_URL;
  let sent = null;
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => { sent = { url: String(url), body: JSON.parse(opts.body) }; return { json: async () => ({ id: 42 }) }; };
  try {
    delete require.cache[require.resolve('../api/strava-setup-webhook')];
    const handler = require('../api/strava-setup-webhook');
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {} };
    await handler({ headers: { authorization: 'Bearer cron-test' }, url: '/api/strava-setup-webhook', method: 'POST' }, res);
    assert.equal(res.code, 200);
    assert.equal(sent.body.callback_url, 'https://www.zancada.org/api/strava-webhook?k=abc123');
    assert.equal(sent.body.verify_token, 'vt');
  } finally { global.fetch = realFetch; }
});
