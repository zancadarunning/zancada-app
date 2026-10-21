// test/bimi-logo.test.js
//
// bimi/zancada.svg se publica para BIMI (logo en el avatar del correo). BIMI pide SVG Tiny PS: perfil tiny-ps, cuadrado, con título, sin scripts,
// imágenes ni referencias externas, y de poco peso.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const svg = fs.readFileSync(path.join(__dirname, '..', 'bimi', 'zancada.svg'), 'utf8');

test('bimi/zancada.svg cumple el perfil SVG Tiny PS', () => {
  assert.match(svg, /<svg[^>]*\bversion="1\.2"/);
  assert.match(svg, /<svg[^>]*\bbaseProfile="tiny-ps"/);
  assert.match(svg, /<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<title>[^<]+<\/title>/);
  const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(vb && vb[1] === vb[2], 'cuadrado');
  for (const bad of ['<script', '<image', 'xlink:href', 'href=', '<style', 'style=', '<filter', '<foreignObject', 'onload', '<a ', 'url(']) {
    assert.ok(!svg.includes(bad), 'no se permite ' + bad);
  }
  assert.ok(Buffer.byteLength(svg) < 32 * 1024, 'menos de 32 KB');
});

test('el logo BIMI no está entre lo que vercel.json redirige (se publica)', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.ok(!(cfg.redirects || []).map(r => r.source).join(' ').includes('bimi'));
});
