// scripts/backup-cifrado.js: los respaldos se cifran con una clave pública; sin la privada y su frase no se pueden leer ni alterar sin que se note.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const bk = require('../scripts/backup-cifrado.js');

const PASS = 'una-frase-larga-de-prueba-123';
const keys = bk.generateKeyPair(PASS, 2048);   // 2048 solo para que el test sea rápido; el script real usa 4096
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zbk-'));

function sampleDir() {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'app_state.json'), JSON.stringify([{ email: 'secreto@correo.com', salud: 'embarazo 12 semanas' }]));
  fs.writeFileSync(path.join(d, 'binario.bin'), Buffer.from([0, 1, 2, 250, 251, 252, 0, 0]));
  fs.writeFileSync(path.join(d, 'vacio.json'), '');
  return d;
}

test('ida y vuelta: una carpeta se cifra y se recupera idéntica', () => {
  const src = sampleDir(), out = path.join(tmp(), 'r.zbk'), back = path.join(tmp(), 'volver');
  bk.encryptPath(src, keys.publicKey, out);
  const names = bk.decryptToDir(out, keys.privateKey, PASS, back);
  assert.deepEqual(names.sort(), ['app_state.json', 'binario.bin', 'vacio.json']);
  for (const n of names) assert.deepEqual(fs.readFileSync(path.join(back, n)), fs.readFileSync(path.join(src, n)), n);
});

test('un archivo suelto (por ejemplo un .zip) también', () => {
  const f = path.join(tmp(), 'llave.zip'); fs.writeFileSync(f, Buffer.from('contenido del zip'));
  const out = path.join(tmp(), 'z.zbk'), back = path.join(tmp(), 'v');
  bk.encryptPath(f, keys.publicKey, out);
  assert.deepEqual(bk.decryptToDir(out, keys.privateKey, PASS, back), ['llave.zip']);
  assert.equal(fs.readFileSync(path.join(back, 'llave.zip'), 'utf8'), 'contenido del zip');
});

test('el archivo cifrado NO contiene los datos en claro (ni comprimidos)', () => {
  const src = sampleDir(), out = path.join(tmp(), 'r.zbk');
  bk.encryptPath(src, keys.publicKey, out);
  const blob = fs.readFileSync(out);
  assert.equal(blob.includes(Buffer.from('secreto@correo.com')), false);
  assert.equal(blob.includes(Buffer.from('embarazo')), false);
  assert.equal(blob.includes(Buffer.from('app_state')), false, 'ni los nombres de los archivos');
  assert.equal(blob.subarray(0, 4).toString(), 'ZBK1');
});

test('frase equivocada, clave de otro par o archivo alterado: no se descifra', () => {
  const src = sampleDir(), out = path.join(tmp(), 'r.zbk');
  bk.encryptPath(src, keys.publicKey, out);
  assert.throws(() => bk.decryptToDir(out, keys.privateKey, 'otra-frase-equivocada', path.join(tmp(), 'x')));
  const otra = bk.generateKeyPair('otra-frase-larga-123456', 2048);
  assert.throws(() => bk.decryptToDir(out, otra.privateKey, 'otra-frase-larga-123456', path.join(tmp(), 'y')));
  const blob = fs.readFileSync(out); blob[blob.length - 5] ^= 0xff;
  const alterado = path.join(tmp(), 'alt.zbk'); fs.writeFileSync(alterado, blob);
  assert.throws(() => bk.decryptToDir(alterado, keys.privateKey, PASS, path.join(tmp(), 'z')), /auth|Unsupported/i);
  const noZbk = path.join(tmp(), 'otro.bin'); fs.writeFileSync(noZbk, Buffer.alloc(200, 7));
  assert.throws(() => bk.decryptToDir(noZbk, keys.privateKey, PASS, path.join(tmp(), 'w')), /no es un respaldo/);
});

test('un contenedor con un nombre de archivo con ruta (../) se rechaza: no puede escribir fuera de la carpeta', () => {
  const header = Buffer.from(JSON.stringify({ v: 1, files: [{ name: '../escapa.txt', size: 3 }] }));
  const len = Buffer.alloc(4); len.writeUInt32BE(header.length);
  const malo = zlib.gzipSync(Buffer.concat([len, header, Buffer.from('abc')]));
  assert.throws(() => bk.unpack(malo), /nombre de archivo inválido/);
});

test('la frase de las claves tiene que ser larga; el par tiene la privada protegida con la frase', () => {
  assert.throws(() => bk.generateKeyPair('corta'), /al menos/);
  assert.match(keys.privateKey, /BEGIN ENCRYPTED PRIVATE KEY/);
  assert.match(keys.publicKey, /BEGIN PUBLIC KEY/);
});
