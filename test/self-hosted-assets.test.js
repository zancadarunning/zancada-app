// Las tipografías y Leaflet salen de /vendor (copias propias): la página no le pide nada a Google Fonts ni a cdnjs, y la CSP ya no los nombra.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('ninguna página pide recursos a Google Fonts ni a cdnjs', () => {
  for (const f of ['index.html', 'privacy.html', 'terms.html', 'eliminar-cuenta.html', 'connect-suunto.html']) {
    // se sacan los comentarios: pueden nombrar esos sitios para explicar por qué ya no se usan
    const s = read(f).replace(/<!--[\s\S]*?-->/g, '');
    assert.doesNotMatch(s, /fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com/, f);
  }
});

test('la CSP no incluye Google Fonts ni cdnjs', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const csp = vercel.headers.find(h => h.source === '/(.*)' && !h.has).headers.find(h => h.key === 'Content-Security-Policy').value;
  assert.doesNotMatch(csp, /googleapis|gstatic|cdnjs/);
});

test('las copias propias existen: hoja de tipografías con sus archivos, y Leaflet con sus imágenes', () => {
  const css = read('vendor/fonts/fonts.css');
  const files = [...css.matchAll(/url\(\/vendor\/fonts\/([^)]+)\)/g)].map(m => m[1]);
  assert.ok(files.length >= 8, 'hay archivos de tipografía');
  for (const f of new Set(files)) assert.ok(fs.existsSync(path.join(root, 'vendor/fonts', f)), 'falta ' + f);
  for (const fam of ['Bebas Neue', 'Inter', 'JetBrains Mono', 'Source Serif 4']) assert.ok(css.includes("font-family: '" + fam + "'"), 'falta ' + fam);
  for (const f of ['leaflet.min.js', 'leaflet.min.css', 'images/layers.png', 'images/marker-icon.png']) assert.ok(fs.existsSync(path.join(root, 'vendor/leaflet', f)), 'falta leaflet/' + f);
  assert.match(read('index.html'), /src="\/vendor\/leaflet\/leaflet\.min\.js"/);
});

test('eliminar-cuenta.html: en los 6 idiomas, con el correo de contacto, el plazo y las copias de seguridad', () => {
  const s = read('eliminar-cuenta.html');
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) assert.match(s, new RegExp('<section id="' + l + '" lang="' + l + '">'), l);
  assert.equal((s.match(/mailto:info@zancada\.org/g) || []).length, 6);
  assert.equal((s.match(/30/g) || []).length >= 6, true, 'el plazo de 30 días en cada idioma');
  assert.doesNotMatch(s, /<script/i, 'sin scripts');
  assert.match(s, /12/, 'se avisa de las copias de seguridad de hasta 12 semanas');
});
