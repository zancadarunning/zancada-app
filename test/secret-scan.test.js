// Escáner de secretos (scripts/scan-secrets.js): detecta claves de verdad, no se queja de lo público a propósito, y el repositorio está limpio.
// Los "secretos" de prueba se arman en tiempo de ejecución (no hay ninguno escrito entero en este archivo, que el propio escáner ignora igual).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { scanText, scanTracked } = require('../scripts/scan-secrets');

const ROOT = path.join(__dirname, '..');
const jwt = payload => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + 'x'.repeat(30);
const rules = text => scanText(text).map(f => f.rule);
const rnd = (n, alphabet) => Array.from({ length: n }, (_, i) => alphabet[(i * 7 + (i * i) % 13) % alphabet.length]).join('');

test('detecta las claves de los servicios que usa Zancada', () => {
  const alnum = 'aB3dE5gH7jK9mN2pQ4sT6vW8yZ1cF0xR';
  const casos = {
    'supabase-secret': 'sb_' + 'secret_' + alnum,
    'anthropic': 'sk-' + 'ant-api03-' + alnum,
    'resend': 're_' + alnum.slice(0, 24),
    'github': 'ghp_' + alnum + 'abcd',
    'aws': 'AKIA' + 'ABCDEFGHIJKLMNOP',
    'private-key': '-----BEGIN ' + 'PRIVATE KEY-----',
    'sentry-auth': 'sntrys_' + alnum + 'abcd',
    'stripe': 'sk_' + 'live_' + alnum.slice(0, 20),
    'google-oauth-secret': 'GOCSPX-' + alnum
  };
  for (const [rule, value] of Object.entries(casos)) assert.ok(rules('const x = "' + value + '";').includes(rule), 'no detectó ' + rule);
});

test('un JWT: la clave de SERVICIO se marca, la pública (anon) no', () => {
  assert.ok(scanText('KEY=' + jwt({ role: 'service_role' })).some(f => f.rule === 'jwt' && /SERVICIO/.test(f.desc)));
  assert.deepEqual(scanText('KEY=' + jwt({ role: 'anon' })), []);
});

test('lo público a propósito no es un hallazgo (clave publicable de Supabase, clave de sitio de Turnstile)', () => {
  assert.deepEqual(scanText("const SUPABASE_ANON_KEY = 'sb_" + "publishable_" + "AbCdEfGhIjKlMnOpQrStUv';"), []);
  assert.deepEqual(scanText("const TURNSTILE_SITE_KEY = '0x4AAAAAAF" + "dy3f1GMeGJWAqt';"), []);
});

test('asignaciones: un valor largo y aleatorio en una variable "secret/password/token" se marca; un nombre o una ruta no', () => {
  assert.ok(rules('const apiKey = "' + 'q8Zr3Lw0Xv5Tn7Bm2Cj9Hd4Kf6Sg1Pa' + '";').includes('assignment'));
  assert.ok(rules('client_secret: "' + 'Zx9Lw3Rv5Tn7Bq2Cj8Hd4Kf6Sg1PaMe0' + '"').includes('assignment'));
  assert.deepEqual(scanText('const tokenKey = "zancada_pending_link_for_the_user";'), []);
  assert.deepEqual(scanText('const secretPath = "/api/strava-setup-webhook-callback";'), []);
  assert.deepEqual(scanText('password = "your-password-goes-here-please-change"'), []);
});

test('"secret-scan: ignore" en la línea la deja pasar', () => {
  assert.deepEqual(scanText('const k = "sk-' + 'ant-' + 'aB3dE5gH7jK9mN2pQ4sT6vW8" // secret-scan: ignore'), []);
});

test('el repositorio versionado no tiene secretos', () => {
  try { execFileSync('git', ['rev-parse', '--git-dir'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) { return; }   // sin git (descarga del código sin historial): nada que escanear
  const found = scanTracked(ROOT);
  assert.deepEqual(found.map(f => `${f.file}:${f.line} ${f.desc} ${f.sample}`), [], 'hay un posible secreto en el código: rotarlo y sacarlo (docs/plan-de-incidentes.md)');
});

test('.gitignore deja afuera todo lo sensible que puede aparecer en la carpeta (env, llaves, firmas, cuentas de servicio)', () => {
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  for (const needle of ['.env', '.env.*', 'mobile/*']) assert.ok(gi.split(/\r?\n/).map(l => l.trim()).includes(needle), 'falta ' + needle + ' en .gitignore');
});
