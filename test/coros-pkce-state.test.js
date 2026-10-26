// COROS: el code_verifier de PKCE viaja CIFRADO dentro del state (que va en la URL de autorización): si fuera legible, PKCE no protegería nada.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
process.env.COROS_STATE_SECRET = 'secreto-de-prueba-del-state';
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
const handler = require('../api/coros-init.js');
const { decToken } = require('../api/_lib/token-crypto.js');

function mkRes() { const r = { code: null, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.end = () => r; return r; }

test('coros-init: el verifier no aparece en claro en el state y se puede recuperar descifrándolo', async () => {
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01' }), text: async () => '' });
  const res = mkRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://zancada.org' }, body: {} }, res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  const { state, codeChallenge } = res.body;
  const parts = state.split('.');
  assert.equal(parts.length, 4);
  const verifier = decToken(Buffer.from(parts[2], 'base64url').toString());
  assert.equal(crypto.createHash('sha256').update(verifier).digest('base64url'), codeChallenge, 'el verifier descifrado corresponde al challenge');
  assert.ok(!state.includes(verifier), 'el verifier NO está en claro en el state');
});

// ---- Auditoria ronda 3: entradas hostiles que antes rompian algo ----
test('strava-webhook GET: un %XX roto en un parametro ya no lanza una excepcion (500 sin autenticar)', async () => {
  process.env.STRAVA_VERIFY_TOKEN = 'tok';
  delete require.cache[require.resolve('../api/strava-webhook.js')];
  const wh = require('../api/strava-webhook.js');
  const res = { code: null, setHeader() {}, status(c) { this.code = c; return this; }, json() { return this; }, send() { return this; }, end() { return this; } };
  await wh({ method: 'GET', url: '/api/strava-webhook?hub_mode=%E0%A4%A&hub.mode=subscribe', query: {}, headers: {} }, res);
  assert.ok([200, 403].includes(res.code), 'respondió ' + res.code);
});

test('sanitizeActivityNumbers: acota elevacion/cadencia/potencia/calorias y recorta el nombre', () => {
  const { sanitizeActivityNumbers } = require('../api/_lib/activity-sanity.js');
  const r = sanitizeActivityNumbers({ distanceKm: 5, durationSec: 1500, elevationGain: 1e300, elevationLoss: 'Infinity', avgCadence: 9999, avgPower: -5, calories: 1e9, name: 'x'.repeat(5000) });
  assert.equal(r.elevationGain, 30000);
  assert.equal(r.elevationLoss, null);
  assert.equal(r.avgCadence, null);
  assert.equal(r.avgPower, null);
  assert.equal(r.calories, null);
  assert.equal(r.name.length, 120);
});

test('resumen semanal: una fecha invalida en las carreras se ignora (no lanza RangeError)', () => {
  const { buildWeeklySummary } = require('../api/_lib/weekly-summary.js');
  const msg = buildWeeklySummary({ runs: [{ date: 'garbage', distanceKm: 5 }, { date: '2026-10-21T12:00:00Z', distanceKm: 8 }], plan: null, weekStart: null, streak: 0, tz: 'America/Argentina/Buenos_Aires', lang: 'es', imperial: false, now: Date.parse('2026-10-25T23:00:00Z') });
  assert.ok(msg && /8\.0 km/.test(msg.body), JSON.stringify(msg));
});
