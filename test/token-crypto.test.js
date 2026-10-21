// test/token-crypto.test.js
//
// Cifrado de los tokens de las marcas de relojes en la base (AES-256-GCM, clave solo en el servidor).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const KEY_A = crypto.randomBytes(32).toString('base64');
const KEY_B = crypto.randomBytes(32).toString('base64');
const setKeys = (cur, prev) => {
  if (cur) process.env.TOKEN_ENCRYPTION_KEY = cur; else delete process.env.TOKEN_ENCRYPTION_KEY;
  if (prev) process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = prev; else delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
};
const { encToken, decToken, isEncrypted, PREFIX } = require('../api/_lib/token-crypto');

test('ida y vuelta: lo cifrado no deja ver el token y se recupera igual', () => {
  setKeys(KEY_A);
  const plain = 'abc123.TOKEN-secreto_ñ';
  const stored = encToken(plain);
  assert.ok(stored.startsWith(PREFIX) && isEncrypted(stored));
  assert.ok(!stored.includes(plain) && !Buffer.from(stored.slice(PREFIX.length), 'base64').toString('utf8').includes('secreto'));
  assert.equal(decToken(stored), plain);
  assert.notEqual(encToken(plain), stored, 'cada cifrado usa un vector distinto');
});

test('compatibilidad: un valor sin cifrar se usa tal cual y cifrar dos veces no cifra dos veces', () => {
  setKeys(KEY_A);
  assert.equal(decToken('token-viejo-en-texto-plano'), 'token-viejo-en-texto-plano');
  const once = encToken('xyz');
  assert.equal(encToken(once), once);
  assert.equal(encToken(null), null);
  assert.equal(decToken(undefined), undefined);
  assert.equal(encToken(''), '');
});

test('sin clave configurada: se guarda sin cifrar (no se rompe el servicio) pero lo ya cifrado no se puede leer', () => {
  setKeys(KEY_A);
  const stored = encToken('abc');
  setKeys(null);
  const realError = console.error; console.error = () => {};
  try { assert.equal(encToken('abc'), 'abc'); } finally { console.error = realError; }
  assert.throws(() => decToken(stored), /no se pudo descifrar/);
});

test('una clave incorrecta o un valor alterado no se descifra (autenticado)', () => {
  setKeys(KEY_A);
  const stored = encToken('secreto');
  setKeys(KEY_B);
  assert.throws(() => decToken(stored), /no se pudo descifrar/);
  setKeys(KEY_A);
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  raw[raw.length - 1] ^= 1;   // se cambia un bit del cifrado
  assert.throws(() => decToken(PREFIX + raw.toString('base64')), /no se pudo descifrar/);
  assert.throws(() => decToken(PREFIX + 'AAAA'), /formato inválido/);
  setKeys('clave-corta');       // una clave que no mide 32 bytes no se usa
  assert.throws(() => decToken(stored), /no se pudo descifrar/);
});

test('rotación: con la clave anterior en TOKEN_ENCRYPTION_KEY_PREVIOUS se sigue leyendo y lo nuevo se cifra con la clave nueva', () => {
  setKeys(KEY_A);
  const old = encToken('rotame');
  setKeys(KEY_B, KEY_A);
  assert.equal(decToken(old), 'rotame');
  const fresh = encToken(decToken(old));
  setKeys(KEY_B);
  assert.equal(decToken(fresh), 'rotame');
  assert.throws(() => decToken(old), /no se pudo descifrar/);
});

// ---- ningún lugar del servidor puede olvidarse de cifrar o descifrar ----
const apiFiles = [...fs.readdirSync(path.join(__dirname, '..', 'api')).filter(f => f.endsWith('.js')).map(f => path.join('api', f)),
  ...fs.readdirSync(path.join(__dirname, '..', 'api', '_lib')).filter(f => f.endsWith('.js') && f !== 'token-crypto.js').map(f => path.join('api', '_lib', f))];

test('el servidor siempre descifra al leer y cifra al guardar los tokens de las filas de conexiones', () => {
  const offenders = [];
  for (const f of apiFiles) {
    fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split(/\r?\n/).forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      // lectura de una fila de conexiones sin descifrar (salvo la asignación en memoria de un token ya en claro)
      const readRe = /\b(conn|connRows\[0\]|conns\[0\])\.(access_token|refresh_token)\b(?!\s*=[^=])/g;
      let m;
      while ((m = readRe.exec(line))) {
        if (line.slice(Math.max(0, m.index - 9), m.index) !== 'decToken(') offenders.push(`${f}:${i + 1} lee sin decToken`);
      }
      // escritura de un token recibido de la marca sin cifrar
      const writeRe = /\b(access_token|refresh_token): *(?:refreshed|rf\.data|tokenData|accessToken)\b/g;
      while ((m = writeRe.exec(line))) {
        if (line.slice(Math.max(0, m.index + m[0].indexOf(':') + 1), m.index + m[0].length + 1).trim().startsWith('encToken(')) continue;
        if (!line.slice(m.index).replace(/^\S+:\s*/, '').startsWith('encToken(')) offenders.push(`${f}:${i + 1} guarda sin encToken`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});

// ---- de punta a punta con el cron de Strava ----
function fakeRes() { const r = { code: 200, body: null, headersSent: false }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; r.headersSent = true; return r; }; r.setHeader = () => {}; r.send = r.json; return r; }

async function runStravaCron({ expiresAt }) {
  setKeys(KEY_A);
  process.env.CRON_SECRET = 'test-secret'; process.env.SUPABASE_URL = 'https://x.test'; process.env.SUPABASE_SERVICE_KEY = 'k';
  process.env.STRAVA_CLIENT_ID = '1'; process.env.STRAVA_CLIENT_SECRET = 's';
  const seen = { activitiesAuth: null, refreshBody: null, patchBody: null };
  const realFetch = global.fetch;
  const conn = { user_id: 'u1', access_token: encToken('ACCESS-EN-CLARO'), refresh_token: encToken('REFRESH-EN-CLARO'), expires_at: expiresAt };
  global.fetch = async (url, opts) => {
    url = String(url);
    const json = body => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.includes('/rest/v1/strava_connections') && (!opts || !opts.method || opts.method === 'GET')) return json([conn]);
    if (url.includes('/rest/v1/strava_connections') && opts && opts.method === 'PATCH') { seen.patchBody = JSON.parse(opts.body); return json({}); }
    if (url.includes('strava.com/oauth/token')) { seen.refreshBody = JSON.parse(opts.body); return json({ access_token: 'NUEVO-ACCESS', refresh_token: 'NUEVO-REFRESH', expires_at: 9999999999 }); }
    if (url.includes('strava.com/api/v3/athlete/activities')) { seen.activitiesAuth = opts.headers.Authorization; return json([]); }
    return json({});
  };
  try {
    const handler = require('../api/sync-strava');
    const res = fakeRes();
    await handler({ headers: { authorization: 'Bearer test-secret' }, url: '/', method: 'GET' }, res);
    return { seen, body: res.body };
  } finally { global.fetch = realFetch; }
}

test('cron de Strava con tokens cifrados en la base: usa el token en claro contra Strava', async () => {
  const { seen, body } = await runStravaCron({ expiresAt: Math.floor(Date.now() / 1000) + 3600 });
  assert.equal(body.synced, 1);
  assert.equal(seen.activitiesAuth, 'Bearer ACCESS-EN-CLARO');
});

test('cron de Strava con el token vencido: renueva con el refresh en claro y guarda los tokens nuevos cifrados', async () => {
  const { seen, body } = await runStravaCron({ expiresAt: 1 });
  assert.equal(body.synced, 1);
  assert.equal(seen.refreshBody.refresh_token, 'REFRESH-EN-CLARO');
  assert.ok(isEncrypted(seen.patchBody.access_token) && isEncrypted(seen.patchBody.refresh_token), 'lo que se guarda va cifrado');
  assert.equal(decToken(seen.patchBody.access_token), 'NUEVO-ACCESS');
  assert.equal(decToken(seen.patchBody.refresh_token), 'NUEVO-REFRESH');
  assert.equal(seen.activitiesAuth, 'Bearer NUEVO-ACCESS');
});

test('keyIsValid: solo una clave de 32 bytes en base64 sirve (el script de migración se niega a seguir con otra)', () => {
  const { keyIsValid } = require('../api/_lib/token-crypto');
  setKeys(KEY_A); assert.equal(keyIsValid(), true);
  setKeys('clave-corta'); assert.equal(keyIsValid(), false);
  setKeys(null); assert.equal(keyIsValid(), false);
  setKeys(KEY_A);
});

test('el script de migración pide solo las columnas de tokens que existen en cada tabla (Polar no tiene refresh_token)', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'encrypt-existing-tokens.js'), 'utf8');
  for (const brand of ['strava', 'polar', 'wahoo', 'coros', 'suunto']) {
    const sqlFile = path.join(__dirname, '..', 'sql', `create_${brand}_connections.sql`);
    const sql = fs.existsSync(sqlFile) ? fs.readFileSync(sqlFile, 'utf8') : null;
    const m = script.match(new RegExp(`${brand}_connections: \[([^\]]*)\]`));
    assert.ok(m, `${brand}: falta en el script`);
    const cols = m[1].match(/'(\w+)'/g).map(c => c.replace(/'/g, ''));
    assert.ok(cols.includes('access_token'));
    if (sql) assert.equal(cols.includes('refresh_token'), /refresh_token\s+text/i.test(sql), `${brand}: refresh_token`);
  }
});
