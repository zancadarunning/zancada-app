#!/usr/bin/env node
// Cifrado de los respaldos de la base (y de cualquier carpeta o archivo sensible) con una clave PÚBLICA.
//
// Por qué así: el respaldo semanal corre solo, sin que nadie escriba una contraseña. Si la clave para descifrar estuviera en la misma computadora,
// quien se lleve el disco (o entre con un virus) podría leerlo igual. Con cifrado de clave pública, la computadora solo guarda la clave de CIFRAR
// (pública, que no sirve para leer nada) y la clave de DESCIFRAR (privada) vive aparte, protegida con una frase, guardada fuera de la PC.
//
// Formato del archivo .zbk (v1):  "ZBK1" | largo de la clave envuelta (2 bytes) | clave AES envuelta con RSA-OAEP-SHA256 | iv (12) | etiqueta GCM (16) |
//   datos cifrados con AES-256-GCM (el encabezado "ZBK1" va como dato autenticado). Adentro: gzip de un contenedor simple
//   [largo del encabezado JSON (4 bytes)] [encabezado JSON {v, files:[{name,size}]}] [bytes de cada archivo, en orden].
//
// Uso:
//   node scripts/backup-cifrado.js generar-claves <carpeta-salida>            (frase en la variable ZANCADA_BACKUP_PASSPHRASE; mínimo 12 caracteres)
//   node scripts/backup-cifrado.js cifrar <carpeta-o-archivo> <publica.pem> <salida.zbk>
//   node scripts/backup-cifrado.js descifrar <entrada.zbk> <privada.pem> <carpeta-destino>   (frase en ZANCADA_BACKUP_PASSPHRASE)
//
// Todo en memoria: pensado para respaldos de decenas de MB (hoy menos de 1 MB). Si algún día pesan cientos de MB, pasar a flujo (stream).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MAGIC = Buffer.from('ZBK1');
const MIN_PASSPHRASE = 12;

function generateKeyPair(passphrase, bits) {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE) throw new Error('la frase tiene que tener al menos ' + MIN_PASSPHRASE + ' caracteres');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: bits || 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase }
  });
  return { publicKey, privateKey };
}

// Junta archivos (de una carpeta plana o un solo archivo) en un contenedor y lo comprime.
function pack(source) {
  const st = fs.statSync(source);
  const entries = st.isDirectory()
    ? fs.readdirSync(source, { withFileTypes: true }).filter(e => e.isFile()).map(e => ({ name: e.name, buf: fs.readFileSync(path.join(source, e.name)) }))
    : [{ name: path.basename(source), buf: fs.readFileSync(source) }];
  const header = Buffer.from(JSON.stringify({ v: 1, files: entries.map(e => ({ name: e.name, size: e.buf.length })) }), 'utf8');
  const len = Buffer.alloc(4); len.writeUInt32BE(header.length);
  return zlib.gzipSync(Buffer.concat([len, header, ...entries.map(e => e.buf)]), { level: 9 });
}

function unpack(gz) {
  const raw = zlib.gunzipSync(gz);
  const hlen = raw.readUInt32BE(0);
  const header = JSON.parse(raw.subarray(4, 4 + hlen).toString('utf8'));
  if (!header || header.v !== 1 || !Array.isArray(header.files)) throw new Error('contenedor inválido');
  let off = 4 + hlen;
  return header.files.map(f => {
    if (!f.name || f.name !== path.basename(f.name)) throw new Error('nombre de archivo inválido en el respaldo');   // sin rutas: no se puede escribir fuera de la carpeta
    const buf = raw.subarray(off, off + f.size); off += f.size;
    return { name: f.name, buf };
  });
}

function encryptBuffer(plain, publicKeyPem) {
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(MAGIC);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const wrapped = crypto.publicEncrypt({ key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key);
  const wl = Buffer.alloc(2); wl.writeUInt16BE(wrapped.length);
  return Buffer.concat([MAGIC, wl, wrapped, iv, tag, enc]);
}

function decryptBuffer(blob, privateKeyPem, passphrase) {
  if (blob.length < 4 + 2 + 12 + 16 || !blob.subarray(0, 4).equals(MAGIC)) throw new Error('no es un respaldo .zbk');
  const wl = blob.readUInt16BE(4);
  let off = 6;
  const wrapped = blob.subarray(off, off + wl); off += wl;
  const iv = blob.subarray(off, off + 12); off += 12;
  const tag = blob.subarray(off, off + 16); off += 16;
  const enc = blob.subarray(off);
  const priv = crypto.createPrivateKey({ key: privateKeyPem, format: 'pem', passphrase });
  const key = crypto.privateDecrypt({ key: priv, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, wrapped);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);   // lanza error si el archivo fue alterado
}

function encryptPath(source, publicKeyPem, outFile) {
  fs.writeFileSync(outFile, encryptBuffer(pack(source), publicKeyPem), { mode: 0o600 });
  return outFile;
}

function decryptToDir(inFile, privateKeyPem, passphrase, outDir) {
  const files = unpack(decryptBuffer(fs.readFileSync(inFile), privateKeyPem, passphrase));
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  for (const f of files) fs.writeFileSync(path.join(outDir, f.name), f.buf, { mode: 0o600 });
  return files.map(f => f.name);
}

module.exports = { generateKeyPair, pack, unpack, encryptBuffer, decryptBuffer, encryptPath, decryptToDir, MIN_PASSPHRASE };

if (require.main === module) {
  const [cmd, a, b, c] = process.argv.slice(2);
  const pass = process.env.ZANCADA_BACKUP_PASSPHRASE;
  try {
    if (cmd === 'generar-claves') {
      const out = a || '.';
      fs.mkdirSync(out, { recursive: true });
      const { publicKey, privateKey } = generateKeyPair(pass);
      fs.writeFileSync(path.join(out, 'backup-public.pem'), publicKey, { mode: 0o644 });
      fs.writeFileSync(path.join(out, 'ZANCADA-CLAVE-PRIVADA-RESPALDOS.pem'), privateKey, { mode: 0o600 });
      console.log('Claves generadas en ' + out);
    } else if (cmd === 'cifrar') {
      if (!a || !b || !c) throw new Error('uso: cifrar <carpeta-o-archivo> <publica.pem> <salida.zbk>');
      encryptPath(a, fs.readFileSync(b, 'utf8'), c);
      console.log('Cifrado: ' + c);
    } else if (cmd === 'descifrar') {
      if (!a || !b || !c) throw new Error('uso: descifrar <entrada.zbk> <privada.pem> <carpeta-destino>');
      if (!pass) throw new Error('falta la frase en la variable ZANCADA_BACKUP_PASSPHRASE');
      const names = decryptToDir(a, fs.readFileSync(b, 'utf8'), pass, c);
      console.log('Descifrados ' + names.length + ' archivo(s) en ' + c);
    } else {
      console.error('Comandos: generar-claves | cifrar | descifrar (ver el comentario al principio del archivo)');
      process.exit(2);
    }
  } catch (e) {
    console.error('Error: ' + e.message);
    process.exit(1);
  }
}
