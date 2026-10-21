// Encabezados de seguridad que vercel.json agrega a TODAS las respuestas.
const test = require('node:test');
const assert = require('node:assert/strict');
const vercel = require('../vercel.json');

const all = vercel.headers.find(h => h.source === '/(.*)' && !h.has);
const get = k => (all.headers.find(h => h.key === k) || {}).value;

test('encabezados de seguridad presentes en todo el sitio', () => {
  assert.equal(get('X-Frame-Options'), 'DENY');
  assert.equal(get('X-Content-Type-Options'), 'nosniff');
  assert.equal(get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.equal(get('Cross-Origin-Opener-Policy'), 'same-origin-allow-popups');
  assert.equal(get('X-Permitted-Cross-Domain-Policies'), 'none');
  const csp = get('Content-Security-Policy');
  for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) assert.ok(csp.includes(d), d);
});

test('Permissions-Policy: sin cámara, micrófono, pagos ni USB; ubicación solo propia (la app corre con GPS)', () => {
  const p = get('Permissions-Policy');
  for (const f of ['camera', 'microphone', 'payment', 'usb', 'bluetooth']) assert.ok(p.includes(f + '=()'), f);
  assert.ok(p.includes('geolocation=(self)'), 'la ubicación tiene que seguir permitida para la propia app');
});
