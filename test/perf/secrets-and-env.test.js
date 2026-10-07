// test/perf/secrets-and-env.test.js
//
// Guardas de seguridad estáticas (rápidas, sin red):
//  1) Claves: ninguna clave real escrita en el código; las variables de entorno están documentadas en .env.example y los
//     archivos .env están en .gitignore (el repositorio es público).
//  2) Inyección en filtros de la base: toda interpolación dentro de una URL de Supabase (PostgREST) es de una forma conocida y
//     segura. Si alguien agrega otra, el test falla y obliga a validarla o escaparla antes de llegar a producción.
//  3) Límites de frecuencia: los endpoints que cuestan plata o mandan emails tienen un tope por usuario.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const apiFiles = () => fs.readdirSync(path.join(ROOT, 'api'), { recursive: true })
  .filter(f => String(f).endsWith('.js')).map(f => 'api/' + String(f).replace(/\\/g, '/'));

test('.gitignore ignora .env y .env.* (pero no .env.example)', () => {
  const gi = read('.gitignore').split(/\r?\n/).map(l => l.trim());
  assert.ok(gi.includes('.env'), 'falta .env en .gitignore');
  assert.ok(gi.includes('.env.*'), 'falta .env.* en .gitignore');
  assert.ok(gi.includes('!.env.example'), 'falta la excepción !.env.example');
});

test('todas las variables de entorno que usa el servidor están documentadas en .env.example', () => {
  const documented = new Set([...read('.env.example').matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map(m => m[1]));
  const used = new Set();
  for (const f of apiFiles()) for (const m of read(f).matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1]);
  const missing = [...used].filter(v => !documented.has(v));
  assert.deepEqual(missing, [], 'agregá estas variables a .env.example (solo el nombre, sin valor)');
});

test('.env.example no trae valores reales (solo nombres)', () => {
  for (const line of read('.env.example').split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const value = m[2].replace(/#.*$/, '').trim();
    assert.equal(value, '', `${m[1]} tiene un valor en .env.example`);
  }
});

test('no hay claves secretas escritas en el código del servidor ni de la app', () => {
  const files = [...apiFiles(), 'app.js', 'index.html', 'privacy.html', 'terms.html'];
  const patterns = [
    [/sk-ant-[A-Za-z0-9_-]{20,}/, 'clave de Anthropic'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clave privada'],
    [/AKIA[0-9A-Z]{16}/, 'clave de AWS'],
    [/ghp_[A-Za-z0-9]{30,}/, 'token de GitHub'],
    [/re_[A-Za-z0-9]{20,}/, 'clave de Resend'],
    [/sb_secret_[A-Za-z0-9_-]{10,}/, 'clave secreta de Supabase'],
    [/service_role['"]?\s*[:=]\s*['"]eyJ/, 'service_role de Supabase']
  ];
  for (const f of files) {
    const text = read(f);
    for (const [re, name] of patterns) assert.ok(!re.test(text), `${f}: parece haber una ${name} escrita en el código`);
  }
});

test('las interpolaciones dentro de URLs de la base (PostgREST) son de una forma segura conocida', () => {
  // Seguras: ids de usuario (uuid ya verificado por Supabase Auth o leído de la propia base), enteros validados
  // (athleteId, Number.isInteger) y todo lo que pase por encodeURIComponent.
  const SAFE = [
    /^userId$/, /^conn\.user_id$/, /^row\.user_id$/, /^auth\.userId$/, /^uid$/, /^athleteId$/, /^ids$/,
    /^encodeURIComponent\(.+\)$/
  ];
  const offenders = [];
  for (const f of apiFiles()) {
    for (const m of read(f).matchAll(/rest\/v1\/[a-z_]+\?[^`]*`/g)) {
      for (const e of m[0].matchAll(/\$\{([^}]+)\}/g)) {
        const expr = e[1].trim();
        if (!SAFE.some(re => re.test(expr))) offenders.push(`${f}: \${${expr}}`);
      }
    }
  }
  assert.deepEqual([...new Set(offenders)], [], 'validá (uuid / entero) o escapá con encodeURIComponent esa interpolación, y agregala a SAFE');
});

test('las funciones SQL de sql/ no arman consultas con texto concatenado (sin SQL dinámico)', () => {
  const dir = path.join(ROOT, 'sql');
  const offenders = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sql'))) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/--.*$/gm, '');
    // EXECUTE sin ser "REVOKE/GRANT EXECUTE" = SQL dinámico (plpgsql: EXECUTE 'select ...' || variable)
    if (/(^|[^A-Za-z])EXECUTE\s+(format\(|')/im.test(text)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], 'SQL dinámico: usar parámetros (USING) o format(%L/%I)');
});

test('los endpoints que cuestan plata o mandan emails tienen tope de frecuencia por usuario', () => {
  const needLimit = {
    'api/chat.js': /p_limit|DAILY_LIMIT/,         // llama a Anthropic
    'api/send-feedback.js': /checkSyncCooldown/,  // manda un email real (Resend)
    'api/remux-video.js': /checkSyncCooldown/,    // gasta CPU con ffmpeg
    'api/strava-sync-now.js': /checkSyncCooldown/, 'api/polar-sync-now.js': /checkSyncCooldown/,
    'api/wahoo-sync-now.js': /checkSyncCooldown/, 'api/coros-sync-now.js': /checkSyncCooldown/,
    'api/suunto-sync-now.js': /checkSyncCooldown/
  };
  for (const [f, re] of Object.entries(needLimit)) assert.ok(re.test(read(f)), `${f} perdió su tope de frecuencia`);
});
