// Minificado del despliegue (scripts/build-minify.js): lo que tiene que cumplir para que la app publicada siga funcionando igual.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

test('el minificado se genera, queda mas chico y conserva APP_VERSION en los primeros 200 bytes (checkForAppUpdate la lee con Range)', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-minify.js')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const out = fs.readFileSync(path.join(ROOT, '.build', 'app.js'), 'utf8');
  assert.ok(out.length < src.length * 0.6, 'tiene que achicar al menos 40%: ' + out.length + ' de ' + src.length);
  const m = out.slice(0, 201).match(/const APP_VERSION\s*=\s*'([^']+)'/);
  assert.ok(m, 'APP_VERSION fuera de los primeros 200 bytes');
  assert.equal(m[1], src.match(/^const APP_VERSION\s*=\s*'([^']+)'/)[1], 'misma version que el codigo fuente');
});

test('el despliegue lo corre (buildCommand), el script llega al build (.vercelignore) y sigue sin servirse al publico (redirect)', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.match(vercel.buildCommand, /scripts\/build-minify\.js --inplace/);
  const ignore = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8');
  assert.match(ignore, /^!scripts\/build-minify\.js$/m, 'sin esto el build no encuentra el script');
  assert.ok(vercel.redirects.some((x) => /scripts/.test(x.source)), 'la carpeta scripts no se sirve al publico');
});
