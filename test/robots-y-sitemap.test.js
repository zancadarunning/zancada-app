// La web publica robots.txt y sitemap.xml (antes daban 404): ayudan a Google a encontrar la landing y las páginas legales cuando zancada.org pase a ser la página de presentación.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('robots.txt permite el sitio, esconde /api/ y apunta al sitemap', () => {
  const r = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
  assert.match(r, /User-agent: \*/);
  assert.match(r, /Disallow: \/api\//);
  assert.match(r, /Sitemap: https:\/\/www\.zancada\.org\/sitemap\.xml/);
});

test('sitemap.xml lista solo páginas que existen y son públicas', () => {
  const s = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  const urls = [...s.matchAll(/<loc>https:\/\/www\.zancada\.org\/([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.ok(urls.length >= 4);
  urls.filter(Boolean).forEach((u) => assert.ok(fs.existsSync(path.join(root, u)), `${u} existe en el repo`));
  const ignore = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');
  ['robots.txt', 'sitemap.xml'].forEach((f) => assert.ok(!ignore.split('\n').includes(f), `${f} no está en .vercelignore`));
});
