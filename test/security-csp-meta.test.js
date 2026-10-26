// La app nativa (Capacitor) no recibe los headers de vercel.json: index.html trae la misma CSP como <meta>. Este test evita que las dos se desincronicen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const header = vercel.headers.find(h => h.source === '/(.*)' && !h.has).headers.find(k => k.key === 'Content-Security-Policy').value;
const parse = v => Object.fromEntries(v.split(';').map(x => x.trim()).filter(Boolean).map(x => { const [d, ...rest] = x.split(/\s+/); return [d, rest]; }));

test('index.html trae una CSP <meta> igual a la de vercel.json (salvo frame-ancestors y el host de la API nativa)', () => {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, 'falta la meta CSP');
  const meta = parse(m[1]), head = parse(header);
  for (const d of Object.keys(head)) {
    if (d === 'frame-ancestors') continue;   // solo funciona como header
    assert.ok(meta[d], 'falta la directiva ' + d + ' en la meta');
    const extra = meta[d].filter(x => !head[d].includes(x));
    assert.deepEqual(extra, d === 'connect-src' ? ['https://www.zancada.org'] : [], d + ': la meta permite de mas');
  }
  assert.ok(!/unsafe-inline|unsafe-eval/.test(m[1].replace(/style-src[^;]*;/, '')), 'script-src sin unsafe-inline/eval');
});

test('.vercelignore deja afuera sql, docs, scripts, test, mobile y los .env', () => {
  const v = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8').split('\n').map(x => x.trim());
  for (const x of ['sql', 'docs', 'test', 'scripts', 'mobile', '.env*']) assert.ok(v.includes(x), x);
});
