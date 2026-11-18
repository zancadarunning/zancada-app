const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildLimits, alertLevel, buildAlertEmail } = require('../api/_lib/usage-limits');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('el nivel de alerta sube a 70, 90 y 100 % y vuelve a 0 por debajo del 70 %', () => {
  assert.equal(alertLevel(0), 0);
  assert.equal(alertLevel(69), 0);
  assert.equal(alertLevel(70), 70);
  assert.equal(alertLevel(89), 70);
  assert.equal(alertLevel(90), 90);
  assert.equal(alertLevel(99), 90);
  assert.equal(alertLevel(100), 100);
  assert.equal(alertLevel(250), 100);
  assert.equal(alertLevel(NaN), 0);
});

test('los límites salen de las estadísticas y se ajustan con variables de entorno (plan gratis por defecto)', () => {
  const stats = { users: { signed_in_30d: 40000, new_7d: 700 }, watches: { strava: 9 }, db: { size_bytes: 400 * 1024 * 1024 }, chat: { max_user_today: 30, global_today: 1500 } };
  const l = Object.fromEntries(buildLimits(stats).map(x => [x.key, x]));
  assert.equal(l.strava.pct, 90);
  assert.equal(l.db.used, 400); assert.equal(l.db.pct, 80);
  assert.equal(l.mau.pct, 80);
  assert.equal(l.chat.pct, 50);
  assert.equal(l.chat_global.pct, 75);
  assert.equal(l.signups_day.used, 100); assert.equal(l.signups_day.pct, 100);
  process.env.SUPABASE_DB_LIMIT_MB = '8192';
  try { assert.equal(Object.fromEntries(buildLimits(stats).map(x => [x.key, x])).db.pct, 5); }
  finally { delete process.env.SUPABASE_DB_LIMIT_MB; }
});

test('el correo de aviso nombra los límites que cambiaron y dice qué no se puede medir desde la app', () => {
  const all = buildLimits({ users: { signed_in_30d: 10, new_7d: 0 }, watches: { strava: 9 }, db: { size_bytes: 0 }, chat: {} });
  const changed = all.filter(l => alertLevel(l.pct) > 0).map(l => Object.assign({}, l, { level: alertLevel(l.pct) }));
  assert.equal(changed.length, 1);
  const mail = buildAlertEmail(changed, all);
  assert.match(mail.subject, /por llegar al tope/);
  assert.match(mail.text, /Strava/);
  assert.match(mail.text, /tráfico de salida de Supabase/);
  assert.doesNotMatch(mail.text, /re_[A-Za-z0-9]/, 'sin claves');
});

test('el aviso diario está programado, protegido con el secreto de los procesos automáticos y usa la tabla de estado', () => {
  assert.match(read('vercel.json'), /"path": "\/api\/usage-alert", "schedule": "0 13 \* \* \*"/);
  const src = read('api/usage-alert.js');
  assert.match(src, /requireCronSecret/);
  assert.match(src, /usage_alert_state/);
  assert.match(read('sql/usage_alert_state.sql'), /ENABLE ROW LEVEL SECURITY/);
  assert.match(read('sql/usage_alert_state.sql'), /REVOKE ALL ON public\.usage_alert_state FROM anon, authenticated/);
});

test('el panel de administración y el aviso diario usan la misma lista de límites', () => {
  assert.match(read('api/admin-stats.js'), /require\('\.\/_lib\/usage-limits'\)/);
  assert.match(read('api/usage-alert.js'), /require\('\.\/_lib\/usage-limits'\)/);
});
