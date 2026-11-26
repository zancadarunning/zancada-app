// Las consultas para atender pedidos de datos tienen que ser de solo lectura, no sacar credenciales y cubrir todas las tablas que guardan datos de una persona.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sinComentarios = (s) => s.replace(/--[^\n]*/g, '');
const FILES = ['sql/pedido_copia_de_datos.sql', 'sql/informe_cuentas_inactivas.sql'];

test('son de solo lectura: no insertan, no modifican, no borran ni crean nada', () => {
  for (const f of FILES) assert.doesNotMatch(sinComentarios(read(f)), /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b(?!_)/i, f);
});

test('la copia de datos no saca credenciales ni identificadores de seguridad', () => {
  const s = sinComentarios(read(FILES[0]));
  assert.doesNotMatch(s, /access_token|refresh_token|\bsubscription\b|device_hash|device_id|encrypted_password|\bselect\s+\*|to_jsonb\s*\(\s*t\s*\)/i);
});

test('la copia de datos incluye todas las tablas que se borran al eliminar la cuenta', () => {
  const borradas = read('api/delete-account.js').match(/const tables = \[([^\]]+)\]/);
  assert.ok(borradas, 'no encontré la lista de tablas de delete-account.js');
  const tablas = new Set(borradas[1].split(',').map((x) => x.trim().replace(/'/g, '')));
  for (const m of read('api/delete-account.js').matchAll(/'([a-z]+_connections)'/g)) tablas.add(m[1]);
  for (const t of ['app_state', 'run_tracks', 'entitlements', 'known_devices', 'chat_usage', 'sent_notifications', 'sync_cooldowns', 'push_subscriptions']) tablas.add(t);
  const s = sinComentarios(read(FILES[0]));
  for (const t of tablas) assert.ok(s.includes('public.' + t + ' '), 'la copia de datos no incluye la tabla ' + t);
});

test('la copia de datos trae un correo de ejemplo que hay que cambiar (nunca uno real)', () => {
  const correos = sinComentarios(read(FILES[0])).match(/[\w.+-]+@[\w.-]+\.\w+/g) || [];
  assert.deepEqual(correos, ['CAMBIAR@CORREO.COM']);
});
