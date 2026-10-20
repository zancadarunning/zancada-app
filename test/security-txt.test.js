// test/security-txt.test.js
//
// .well-known/security.txt (RFC 9116): tiene que existir, con un contacto, y no vencer. Si le quedan menos de 60 días de vigencia la prueba falla
// para que se renueve a tiempo (un security.txt vencido se considera inválido).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const text = fs.readFileSync(path.join(__dirname, '..', '.well-known', 'security.txt'), 'utf8');
const field = name => (text.match(new RegExp('^' + name + ':\\s*(.+)$', 'mi')) || [])[1];

test('security.txt: tiene Contact (correo o https) y Canonical en https', () => {
  assert.match(field('Contact'), /^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/\S+)$/);
  assert.match(field('Canonical'), /^https:\/\/www\.zancada\.org\/\.well-known\/security\.txt$/);
});

test('security.txt: la fecha de vencimiento (Expires) es válida y quedan al menos 60 días', () => {
  const exp = new Date(field('Expires'));
  assert.ok(!isNaN(exp.getTime()), 'Expires tiene que ser una fecha ISO');
  const daysLeft = (exp.getTime() - Date.now()) / 86400000;
  assert.ok(daysLeft > 60, `security.txt vence en ${Math.round(daysLeft)} días: renovar Expires`);
  assert.ok(daysLeft < 400, 'RFC 9116 recomienda no más de un año de vigencia');
});

test('security.txt se publica: no está entre los archivos que vercel.json redirige', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const sources = (cfg.redirects || []).map(r => r.source).join(' ');
  assert.ok(!sources.includes('.well-known'));
});
