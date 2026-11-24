// La app ya no consulta el clima (Open-Meteo): el CSP no debe seguir permitiendo conectarse a ese servicio (permiso de más).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('el CSP de vercel.json no permite servicios que la app ya no usa', () => {
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const csp = v.headers.flatMap((h) => h.headers).find((x) => x.key === 'Content-Security-Policy').value;
  assert.doesNotMatch(csp, /open-meteo/i);
});
