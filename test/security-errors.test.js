// test/security-errors.test.js
//
// Divulgación de información en mensajes de error: ningún endpoint de api/ devuelve al cliente el mensaje interno de una excepción
// (a veces trae la respuesta cruda de Supabase o de un proveedor), ni un campo "debug" con la respuesta de un tercero. El detalle va
// al registro del servidor / Sentry; al cliente, un mensaje genérico. Si un cambio nuevo lo vuelve a hacer, falla acá.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const API_DIR = path.join(__dirname, '..', 'api');
const files = fs.readdirSync(API_DIR).filter(f => f.endsWith('.js'));

test('ningún endpoint devuelve el mensaje interno de un error al cliente', () => {
  const offenders = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(API_DIR, f), 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/\.json\(\s*\{[^}]*\b(err|e|error)\.(message|stack)\b/.test(line) && !/setStravaSyncStatus/.test(line)) offenders.push(`${f}:${i + 1}`);
      if (/\.json\(\s*\{[^}]*\bdebug\s*:/.test(line)) offenders.push(`${f}:${i + 1} (debug)`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('vercel.json: los archivos que no son de la app se redirigen y lo necesario no se toca', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const sources = (cfg.redirects || []).map(r => r.source).join(' ');
  for (const dir of ['sql', 'docs', 'test', 'scripts', 'loadtest', 'mobile', 'email-templates']) assert.ok(sources.includes(dir), dir);
  // lo que la app y las tiendas sí necesitan no puede quedar en una redirección
  for (const needed of ['.well-known', 'locales', 'vendor', 'img', 'privacy', 'terms', 'manifest', 'sw.js', 'app.js', 'api']) {
    assert.ok(!/\/:dir\([^)]*\b(locales|vendor|img|api)\b/.test(sources) && !sources.includes(needed + '/'), needed);
  }
  for (const r of cfg.redirects) assert.equal(r.destination, '/');
});
