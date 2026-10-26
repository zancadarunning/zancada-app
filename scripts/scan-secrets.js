#!/usr/bin/env node
// Escáner de secretos: busca claves, tokens y llaves privadas escritas en el código.
//
//   node scripts/scan-secrets.js              revisa todos los archivos versionados (git ls-files)
//   node scripts/scan-secrets.js --history    además recorre TODO el historial de git (lo que alguna vez se subió, aunque ya se haya borrado)
//
// Sale con código 1 si encuentra algo. Nunca imprime el valor completo (solo el comienzo), así el resultado se puede pegar en un chat o en un log.
// Lo corre test/secret-scan.test.js en cada `npm test` y el CI sobre el historial completo en cada subida y una vez por semana.
//
// Por qué propio y no gitleaks/trufflehog: no hay nada que instalar ni que fijar de versión, corre igual en la PC y en el CI, y las reglas están acá,
// a la vista. El repositorio es PÚBLICO: un secreto subido por error ya se considera filtrado, hay que rotarlo (ver docs/plan-de-incidentes.md).

const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Valores públicos A PROPÓSITO (van dentro de la app). Si agregás uno, escribí por qué.
const ALLOWED_VALUES = [
  /^sb_publishable_/,                 // clave pública de Supabase (la usa el navegador; el acceso lo limitan las reglas RLS)
  /^0x4AAAAAAF[A-Za-z0-9_-]{16,20}$/  // clave de SITIO de Cloudflare Turnstile (pública; la secreta empieza igual pero es más larga)
];

const RULES = [
  { id: 'supabase-secret', re: /sb_secret_[A-Za-z0-9_-]{16,}/g, desc: 'clave secreta de Supabase' },
  { id: 'supabase-pat', re: /sbp_[a-f0-9]{40}/g, desc: 'token personal de Supabase' },
  { id: 'anthropic', re: /sk-ant-[A-Za-z0-9_-]{20,}/g, desc: 'clave de Anthropic' },
  { id: 'resend', re: /\bre_[A-Za-z0-9]{20,}/g, desc: 'clave de Resend' },
  { id: 'github', re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/g, desc: 'token de GitHub' },
  { id: 'aws', re: /\bAKIA[0-9A-Z]{16}\b/g, desc: 'clave de AWS' },
  { id: 'slack', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, desc: 'token de Slack' },
  { id: 'stripe', re: /\b[sr]k_live_[A-Za-z0-9]{10,}/g, desc: 'clave de Stripe' },
  { id: 'mapbox-secret', re: /\bsk\.eyJ[A-Za-z0-9_.-]{20,}/g, desc: 'token secreto de Mapbox' },
  { id: 'sentry-auth', re: /\bsntry[su]_[A-Za-z0-9]{20,}/g, desc: 'token de Sentry' },
  { id: 'google-oauth-secret', re: /\bGOCSPX-[A-Za-z0-9_-]{20,}/g, desc: 'secreto de cliente de Google' },
  { id: 'turnstile-secret', re: /\b0x4[A-Za-z0-9_-]{31,}/g, desc: 'clave SECRETA de Cloudflare Turnstile' },
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, desc: 'llave privada' },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, desc: 'clave de API de Google' }
];

// Un JWT (eyJ...) puede ser la clave pública (role anon, va en el navegador) o la de servicio (role service_role, da acceso total a la base).
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
function jwtRole(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).role || null; } catch (e) { return null; }
}

// Asignaciones sospechosas: nombre que suena a secreto = texto largo y "al azar".
const ASSIGN_RE = /(secret|passw(?:or)?d|passwd|api[_-]?key|private[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\w*["']?\s*[:=]\s*["']([A-Za-z0-9+/=_.-]{24,})["']/gi;
// Líneas estilo .env (NOMBRE_KEY=valor, con o sin comillas): los nombres propios del proyecto (TOKEN_ENCRYPTION_KEY, CRON_SECRET, SUUNTO_SUBSCRIPTION_KEY, STRAVA_VERIFY_TOKEN...) no los cubría la regla de arriba, que exige comillas
// y ciertas palabras en el nombre. Umbral de entropía más bajo (3.0) para que entren también los hex y UUID. Los nombres con PUBLIC / SITE / ANON no son secretos.
const ENV_LINE_RE = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|DSN))\s*[=:]\s*["']?([A-Za-z0-9+/=_.-]{20,})["']?\s*[,;]?\s*$/;
function entropy(s) {
  const f = {}; for (const c of s) f[c] = (f[c] || 0) + 1;
  return -Object.values(f).reduce((a, n) => a + (n / s.length) * Math.log2(n / s.length), 0);
}
const PLACEHOLDER_RE = /^(x+|0+|1+|a+|your|tu[_-]|ejemplo|example|changeme|placeholder|dummy|fake|test|secret|password|xxx|\.\.\.)/i;

function mask(v) { return String(v).slice(0, 6) + '…(' + String(v).length + ' caracteres)'; }

// Devuelve [{rule, desc, line, sample}] para un texto.
function scanText(text) {
  const out = [];
  const lines = String(text).split('\n');
  lines.forEach((ln, i) => {
    if (ln.length > 4000) return;   // líneas enormes (archivos minificados, base64): no son secretos escritos a mano
    if (/secret-scan:\s*ignore/.test(ln)) return;
    for (const r of RULES) {
      for (const m of ln.matchAll(r.re)) {
        if (ALLOWED_VALUES.some(a => a.test(m[0]))) continue;
        out.push({ rule: r.id, desc: r.desc, line: i + 1, sample: mask(m[0]) });
      }
    }
    for (const m of ln.matchAll(JWT_RE)) {
      const role = jwtRole(m[0]);
      if (role === 'anon') continue;
      out.push({ rule: 'jwt', desc: role === 'service_role' ? 'clave de SERVICIO de Supabase (acceso total a la base)' : 'JWT (' + (role || 'sin rol') + ')', line: i + 1, sample: mask(m[0]) });
    }
    const envm = ln.match(ENV_LINE_RE);
    if (envm && !/PUBLIC|SITE|ANON|PUBLISHABLE/.test(envm[1]) && !ALLOWED_VALUES.some(a => a.test(envm[2])) && !PLACEHOLDER_RE.test(envm[2]) && entropy(envm[2]) >= 3.0 && !/^(https?:|\/|\.\/)/i.test(envm[2])) {
      out.push({ rule: 'env-line', desc: 'valor largo asignado a "' + envm[1] + '" (formato .env)', line: i + 1, sample: mask(envm[2]) });
    }
    for (const m of ln.matchAll(ASSIGN_RE)) {
      const v = m[2];
      if (ALLOWED_VALUES.some(a => a.test(v)) || PLACEHOLDER_RE.test(v) || entropy(v) < 3.8) continue;
      if (/^(https?:|\/|\.\/|[a-z]+_[a-z_]+$|[a-z]+(-[a-z]+)+$)/i.test(v)) continue;   // rutas, urls, nombres con guiones
      out.push({ rule: 'assignment', desc: 'valor largo y aleatorio asignado a "' + m[1] + '"', line: i + 1, sample: mask(v) });
    }
  });
  return out;
}

const SKIP_FILE = /(^|\/)(package-lock\.json|node_modules\/|vendor\/|.*\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|zip|zbk|pdf|mp4|jks|keystore|jsonl|sarif))$/i;

// Archivos que vienen a propósito con algo que parece un secreto (por ejemplo, los tests que prueban este mismo escáner).
const ALLOWED_FILES = [/^test\/secret-scan\.test\.js$/, /^scripts\/scan-secrets\.js$/];

function scanTracked(root) {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 }).toString('utf8').split('\0').filter(Boolean);
  const found = [];
  for (const f of files) {
    if (SKIP_FILE.test(f) || ALLOWED_FILES.some(a => a.test(f))) continue;
    let text;
    try { text = fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { continue; }
    if (text.indexOf('\u0000') >= 0) continue;   // binario
    for (const h of scanText(text)) found.push(Object.assign({ file: f }, h));
  }
  return found;
}

// Recorre todo el historial (líneas agregadas de cada commit, de todas las ramas).
function scanHistory(root) {
  return new Promise((resolve, reject) => {
    const p = spawn('git', ['log', '--all', '-p', '-U0', '--no-color', '--diff-filter=AMRC', '--format=@@COMMIT %H'], { cwd: root });
    const found = []; let commit = '', file = '';
    const rl = readline.createInterface({ input: p.stdout, crlfDelay: Infinity });
    rl.on('line', ln => {
      if (ln.startsWith('@@COMMIT ')) { commit = ln.slice(9, 16); return; }
      if (ln.startsWith('+++ b/')) { file = ln.slice(6); return; }
      if (ln.startsWith('+++') || !ln.startsWith('+')) return;
      if (SKIP_FILE.test(file) || ALLOWED_FILES.some(a => a.test(file))) return;
      for (const h of scanText(ln.slice(1))) found.push(Object.assign({ file, commit }, h));
    });
    p.on('error', reject);
    // si git falla (no es un repositorio, historial corrupto...) NO se da el historial por limpio: antes `close` resolvía igual con la lista vacía y el escaneo "pasaba"
    p.on('close', code => (code === 0 ? resolve(found) : reject(new Error('git log terminó con código ' + code + ': no se pudo revisar el historial'))));
  });
}

// Archivos sensibles que git NO versiona pero que están en la carpeta (y, si la carpeta está en OneDrive/Dropbox, viajan a la nube en texto plano).
// Devuelve [{file, why}]. Los .env de ejemplo y la carpeta node_modules no cuentan.
const LOCAL_SENSITIVE = [
  [/(^|\/)\.env(\.[^/]*)?$/i, 'archivo de variables de entorno'],
  [/\.(jks|keystore|p12|pfx|p8|pem|key)$/i, 'llave o certificado'],
  [/(^|\/)keystore[^/]*\.properties$/i, 'contraseñas de la firma de Android'],
  [/(service-account|firebase-adminsdk)[^/]*\.json$/i, 'cuenta de servicio']
];
function scanLocalFiles(root) {
  const listed = execFileSync('git', ['ls-files', '--others', '-z'], { cwd: root, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').split('\0').filter(Boolean);
  const ignored = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'], { cwd: root, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').split('\0').filter(Boolean);
  const out = [];
  for (const f of new Set([...listed, ...ignored])) {
    if (/(^|\/)(node_modules|build|\.gradle|\.git)\//.test(f) || /\.example$/.test(f)) continue;
    const hit = LOCAL_SENSITIVE.find(([re]) => re.test(f));
    if (hit) out.push({ file: f, why: hit[1] });
  }
  return out;
}
const inCloudFolder = root => /onedrive|dropbox|google ?drive|icloud/i.test(root);

module.exports = { RULES, scanText, scanTracked, scanHistory, scanLocalFiles, entropy };

if (require.main === module) {
  (async () => {
    const root = path.join(__dirname, '..');
    if (process.argv.includes('--local')) {
      const loose = scanLocalFiles(root);
      if (!loose.length) { console.log('Sin archivos sensibles sueltos en la carpeta.'); return; }
      console.error('ARCHIVOS SENSIBLES SUELTOS (no están en git' + (inCloudFolder(root) ? ', pero esta carpeta se sincroniza con la nube' : '') + '):');
      for (const l of loose) console.error(' - ' + l.file + ' → ' + l.why);
      console.error('\nGuardarlos fuera de esta carpeta (por ejemplo D:\\Llaves) y con copia fuera de la PC.');
      process.exit(1);
    }
    const found = scanTracked(root);
    if (process.argv.includes('--history')) found.push(...await scanHistory(root));
    if (!found.length) { console.log('Sin secretos a la vista' + (process.argv.includes('--history') ? ' (archivos actuales + historial completo).' : ' (archivos versionados).')); return; }
    console.error('POSIBLES SECRETOS (' + found.length + '):');
    for (const f of found) console.error(' - ' + f.file + ':' + f.line + (f.commit ? ' [commit ' + f.commit + ']' : '') + ' ' + f.desc + ' → ' + f.sample);
    console.error('\nSi es real: rotarlo YA (docs/plan-de-incidentes.md). Si es un valor público a propósito: agregarlo a ALLOWED_VALUES con el motivo, o poner "secret-scan: ignore" en esa línea.');
    process.exit(1);
  })().catch(e => { console.error('Error:', e.message); process.exit(2); });
}
