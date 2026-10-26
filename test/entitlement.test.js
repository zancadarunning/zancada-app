// El plan de pago de una cuenta vive en una tabla que solo escribe el servidor (entitlements), NUNCA en app_state (que la persona edita desde su sesión).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { entitlementFromRow } = require('../api/entitlement');

const NOW = Date.parse('2026-10-26T12:00:00Z');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('entitlementFromRow: sin fila, o con una fila rara, es free', () => {
  for (const row of [null, undefined, 'x', 5]) assert.deepEqual(entitlementFromRow(row, NOW), { plan: 'free', active: false, expiresAt: null });
});

test('entitlementFromRow: plan pago vigente, en gracia y sin vencimiento cuentan; vencido, cancelado o reembolsado no', () => {
  const future = '2026-12-01T00:00:00Z';
  assert.deepEqual(entitlementFromRow({ plan: 'pro', status: 'active', expires_at: future }, NOW), { plan: 'pro', active: true, expiresAt: '2026-12-01T00:00:00.000Z' });
  assert.equal(entitlementFromRow({ plan: 'pro', status: 'grace', expires_at: future }, NOW).active, true);
  assert.equal(entitlementFromRow({ plan: 'pro', status: 'active', expires_at: null }, NOW).active, true);
  assert.equal(entitlementFromRow({ plan: 'pro', status: 'active', expires_at: '2026-10-01T00:00:00Z' }, NOW).active, false, 'vencido');
  assert.equal(entitlementFromRow({ plan: 'pro', status: 'cancelled', expires_at: future }, NOW).active, false);
  assert.equal(entitlementFromRow({ plan: 'pro', status: 'refunded', expires_at: future }, NOW).active, false);
  assert.equal(entitlementFromRow({ plan: 'pro', status: 'active', expires_at: 'no-es-una-fecha' }, NOW).active, false, 'una fecha ilegible nunca regala el plan');
  assert.equal(entitlementFromRow({ plan: 'free', status: 'active', expires_at: null }, NOW).active, false);
});

test('la tabla entitlements: RLS sin políticas, sin permisos para anon/authenticated y se borra con la cuenta', () => {
  const sql = read('sql/entitlements.sql').replace(/--.*$/gm, '');
  assert.match(sql, /alter\s+table\s+public\.entitlements\s+enable\s+row\s+level\s+security/i);
  assert.match(sql, /revoke\s+all\s+on\s+public\.entitlements\s+from\s+anon,\s*authenticated/i);
  assert.doesNotMatch(sql, /create\s+policy/i, 'sin políticas: solo el servidor la toca');
  assert.match(sql, /references\s+auth\.users\(id\)\s+on\s+delete\s+cascade/i);
  assert.ok(read('api/delete-account.js').includes("'entitlements'"));
});

test('el endpoint exige sesión, nunca mira un user_id del cuerpo y falla hacia free', () => {
  const s = read('api/entitlement.js');
  assert.match(s, /verifyUser\(/);
  assert.doesNotMatch(s, /req\.body/, 'el usuario sale solo de la sesión verificada');
  assert.match(s, /auth\.userId/);
  assert.match(s, /catch \(e\) \{\s*res\.status\(200\)\.json\(FREE\)/);
});

test('el plan de pago nunca se lee de app_state (lo escribe la propia persona)', () => {
  const app = read('app.js');
  assert.doesNotMatch(app, /state\.(planTier|subscription|entitlement|isPro|premium)\b\s*(===|==|&&|\?)/, 'no decidir permisos con un campo del estado editable');
});
