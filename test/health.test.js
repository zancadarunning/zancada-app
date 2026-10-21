// /api/health: público, mínimo y sin datos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('../api/health');
const mkRes = () => ({ code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } });

test('GET y HEAD responden 200 {status:ok}; otros métodos 405', () => {
  for (const m of ['GET', 'HEAD']) { const r = mkRes(); handler({ method: m }, r); assert.equal(r.code, 200); assert.deepEqual(r.body, { status: 'ok' }); }
  const r = mkRes(); handler({ method: 'POST' }, r); assert.equal(r.code, 405);
});

test('no lee variables de entorno ni la base: nada que filtrar', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'health.js'), 'utf8');
  assert.doesNotMatch(src, /process\.env|fetch\(|require\(/);
});
