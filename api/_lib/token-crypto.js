// api/_lib/token-crypto.js
//
// Cifrado de los tokens de las marcas de relojes (Strava, Suunto, Wahoo, Polar, COROS) antes de guardarlos en la base.
//
// Por qué: esos tokens permiten leer las carreras de cada persona en su marca. La base ya los protege con RLS y sin permisos para el cliente,
// pero si algún día se filtrara un volcado de la base (un respaldo, una consulta indebida), los tokens estarían en texto plano. Con esto
// se guardan cifrados con AES-256-GCM y una clave que vive SOLO en el servidor (variable TOKEN_ENCRYPTION_KEY en Vercel, nunca en la base).
//
// Formato guardado:  enc:v1:<base64( iv(12) | etiqueta(16) | cifrado )>
// Compatibilidad: un valor SIN ese prefijo se considera sin cifrar y se usa tal cual (así el código puede publicarse antes de migrar los
// valores existentes con scripts/encrypt-existing-tokens.js). Sin TOKEN_ENCRYPTION_KEY, encToken guarda en texto plano y avisa en el registro.
//
// Rotación de la clave: poner la anterior en TOKEN_ENCRYPTION_KEY_PREVIOUS y la nueva en TOKEN_ENCRYPTION_KEY; se descifra con cualquiera de
// las dos y se vuelve a cifrar con la nueva (scripts/encrypt-existing-tokens.js --rotate).
//
// Generar una clave:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

const crypto = require('crypto');

const PREFIX = 'enc:v1:';
const AAD = Buffer.from('zancada-token-v1');

function keyFromEnv(name) {
  const raw = process.env[name];
  if (!raw) return null;
  const key = Buffer.from(String(raw).trim(), 'base64');
  return key.length === 32 ? key : null;
}

let warnedNoKey = false;

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encToken(plain) {
  if (plain === null || plain === undefined || plain === '') return plain;
  const text = String(plain);
  if (isEncrypted(text)) return text;
  const key = keyFromEnv('TOKEN_ENCRYPTION_KEY');
  if (!key) {
    if (!warnedNoKey) { warnedNoKey = true; console.error('token-crypto: falta TOKEN_ENCRYPTION_KEY (32 bytes en base64): los tokens se guardan SIN cifrar'); }
    return text;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

function decToken(stored) {
  if (stored === null || stored === undefined || stored === '') return stored;
  const text = String(stored);
  if (!isEncrypted(text)) return text;   // todavía sin cifrar
  const raw = Buffer.from(text.slice(PREFIX.length), 'base64');
  if (raw.length < 12 + 16 + 1) throw new Error('token-crypto: token cifrado con formato inválido');
  const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), data = raw.subarray(28);
  for (const name of ['TOKEN_ENCRYPTION_KEY', 'TOKEN_ENCRYPTION_KEY_PREVIOUS']) {
    const key = keyFromEnv(name);
    if (!key) continue;
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(AAD);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch (e) { /* probar con la otra clave */ }
  }
  throw new Error('token-crypto: no se pudo descifrar un token (falta TOKEN_ENCRYPTION_KEY o cambió sin conservar la anterior en TOKEN_ENCRYPTION_KEY_PREVIOUS)');
}

module.exports = { encToken, decToken, isEncrypted, PREFIX };
