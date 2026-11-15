// La tabla chat_usage (límite diario del coach y topes por hora/día de los endpoints) crece sin fin si nadie la limpia.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pruneUsage } = require('../api/_lib/daily-cap');

test('pruneUsage borra solo las filas de más de N días (DELETE con usage_date < corte) y manda las credenciales', async () => {
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => { calls.push({ url: String(url), opts }); return { ok: true, status: 204 }; };
  try {
    await pruneUsage('https://x.supabase.co', { apikey: 'k', Authorization: 'Bearer k' }, 35);
  } finally { global.fetch = realFetch; }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.method, 'DELETE');
  const m = calls[0].url.match(/^https:\/\/x\.supabase\.co\/rest\/v1\/chat_usage\?usage_date=lt\.(\d{4}-\d{2}-\d{2})$/);
  assert.ok(m, calls[0].url);
  const diasAtras = Math.round((Date.now() - Date.parse(m[1] + 'T00:00:00Z')) / 86400000);
  assert.ok(diasAtras >= 35 && diasAtras <= 36, 'el corte es de ~35 días: ' + diasAtras);
  assert.equal(calls[0].opts.headers.apikey, 'k');
});

test('pruneUsage nunca tira: si la red falla, el cron sigue', async () => {
  const realFetch = global.fetch;
  global.fetch = async () => { throw new Error('sin red'); };
  try { await assert.doesNotReject(() => pruneUsage('https://x.supabase.co', {}, 35)); }
  finally { global.fetch = realFetch; }
});

test('send-reminders limpia los contadores de uso en la limpieza semanal', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'send-reminders.js'), 'utf8');
  assert.match(src, /const \{ pruneUsage \} = require\('\.\/_lib\/daily-cap'\)/);
  assert.match(src, /=== 0\) await pruneUsage\(base, headers, 35\)/);
});
