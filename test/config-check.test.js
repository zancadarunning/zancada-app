// Aviso de configuración de seguridad incompleta (api/_lib/config-check.js): detecta la falta de una variable esencial o una clave de cifrado
// inválida, avisa una vez por ventana y nunca incluye valores.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cc = require('../api/_lib/config-check');

const GOOD = {
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k', CRON_SECRET: 'c', STRAVA_STATE_SECRET: 's', STRAVA_WEBHOOK_SECRET: 'w'
};
function withEnv(env, fn) {
  const saved = {};
  for (const n of [...cc.ESSENTIAL, 'TOKEN_ENCRYPTION_KEY']) { saved[n] = process.env[n]; delete process.env[n]; }
  Object.assign(process.env, env);
  return Promise.resolve(fn()).finally(() => { for (const [n, v] of Object.entries(saved)) { if (v === undefined) delete process.env[n]; else process.env[n] = v; } });
}
const KEY = crypto.randomBytes(32).toString('base64');

test('con todo cargado no falta nada', () => withEnv({ ...GOOD, TOKEN_ENCRYPTION_KEY: KEY }, () => assert.deepEqual(cc.missingConfig(), [])));

test('detecta una variable esencial vacía o ausente', () => withEnv({ ...GOOD, CRON_SECRET: '   ', TOKEN_ENCRYPTION_KEY: KEY }, () => assert.deepEqual(cc.missingConfig(), ['CRON_SECRET'])));

test('la clave de cifrado de tokens: ausente o con largo equivocado cuenta como mal configurada', async () => {
  await withEnv({ ...GOOD }, () => assert.deepEqual(cc.missingConfig(), ['TOKEN_ENCRYPTION_KEY']));
  await withEnv({ ...GOOD, TOKEN_ENCRYPTION_KEY: Buffer.from('corta').toString('base64') }, () => assert.deepEqual(cc.missingConfig(), ['TOKEN_ENCRYPTION_KEY']));
});

test('avisa una sola vez por ventana de 12 horas y solo con NOMBRES (nunca valores)', async () => {
  cc.resetAlertThrottle();
  const calls = [];
  const report = (msg, ctx) => { calls.push({ msg, ctx }); };
  await withEnv({ ...GOOD, STRAVA_STATE_SECRET: '', TOKEN_ENCRYPTION_KEY: KEY }, async () => {
    const T0 = 1800000000000;   // una fecha real (Date.now() es del orden de 1.7e12)
    await cc.alertIfMisconfigured(report, T0);
    await cc.alertIfMisconfigured(report, T0 + 60 * 60 * 1000);          // 1 hora después: no repite
    await cc.alertIfMisconfigured(report, T0 + 13 * 60 * 60 * 1000);     // 13 horas después: vuelve a avisar
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].msg, /STRAVA_STATE_SECRET/);
  assert.ok(!JSON.stringify(calls).includes(GOOD.SUPABASE_SERVICE_KEY + KEY), 'no debe filtrar valores');
  assert.ok(!JSON.stringify(calls).includes(KEY));
});

test('si todo está bien no avisa; si el aviso falla no tira error', async () => {
  cc.resetAlertThrottle();
  const calls = [];
  await withEnv({ ...GOOD, TOKEN_ENCRYPTION_KEY: KEY }, () => cc.alertIfMisconfigured(() => calls.push(1)));
  assert.equal(calls.length, 0);
  cc.resetAlertThrottle();
  await withEnv({ ...GOOD }, () => cc.alertIfMisconfigured(() => Promise.reject(new Error('sentry caído'))));   // no lanza
});

test('el cron de recordatorios lo llama (y no frena el envío si falla)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'send-reminders.js'), 'utf8');
  assert.match(src, /alertIfMisconfigured\(reportSecurityEvent\)\.catch\(/);
});
