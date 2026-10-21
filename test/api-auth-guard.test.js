// Ningún endpoint de api/ puede quedar abierto por descuido: cada archivo tiene que autenticar de alguna de las formas conocidas.
// Si agregás un endpoint nuevo y este test falla, ES A PROPÓSITO: o usa verifyUser (sesión), requireCronSecret (crons), una firma de
// webhook, o se suma acá a una lista con el motivo escrito.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'api');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
const src = f => fs.readFileSync(path.join(dir, f), 'utf8');

// Abiertos a propósito, con la defensa que tienen en lugar de la sesión:
const PUBLIC = {
  'strava-auth.js': /verifyState/,      // vuelta del OAuth: el "state" lo firmó nuestro servidor
  'polar-auth.js': /verifyState/,
  'wahoo-auth.js': /verifyState/,
  'suunto-auth.js': /verifyState/,
  'coros-auth.js': /verifyState/,
  'calendar-feed.js': /\[a-z0-9-\]\{10,80\}/i,   // suscripción de calendario: token aleatorio largo y validado
  'strava-webhook.js': /STRAVA_WEBHOOK_SECRET/,  // avisos de Strava: secreto en la URL + subscription_id
  'suunto-webhook.js': /signatureMatches/         // avisos de Suunto: firma HMAC del cuerpo
};
const SESSION = /verifyUser\(/;
const CRON = /requireCronSecret\(/;

for (const f of files) {
  test(`api/${f}: exige autenticación`, () => {
    const s = src(f);
    if (PUBLIC[f]) {
      assert.match(s, PUBLIC[f], `${f} es público a propósito pero perdió su defensa`);
      return;
    }
    assert.ok(SESSION.test(s) || CRON.test(s), `${f} no llama a verifyUser ni a requireCronSecret: quedaría abierto a cualquiera`);
  });
}

test('los endpoints de cron comparan el secreto en tiempo constante', () => {
  const s = fs.readFileSync(path.join(dir, '_lib', 'require-cron-secret.js'), 'utf8');
  assert.match(s, /timingSafeEqual/);
});

test('ningún endpoint devuelve el mensaje interno de un error al cliente', () => {
  for (const f of files) {
    const s = src(f);
    assert.doesNotMatch(s, /res\.status\(500\)\.json\(\{\s*error:\s*(err|e|error)\.message/, `${f} filtra err.message`);
  }
});
