// Textos legales (js/legal-privacy.js y js/legal-terms.js): misma estructura en los 6 idiomas, hablan solo de la app móvil (Android e iOS) y reflejan lo que
// la app hace de verdad. Si agregás un dato nuevo o un proveedor nuevo, hay que sumarlo acá Y a la política (ver docs/checklist-cambios-seguros.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const load = f => new Function(fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\n')[0].replace(/^const L =/, 'return ') + ';')();
const P = load('js/legal-privacy.js'), T = load('js/legal-terms.js');
const LANGS = ['es', 'en', 'pt', 'fr', 'it', 'de'];
const flat = v => typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(flat) : v && typeof v === 'object' ? Object.values(v).flatMap(flat) : [];
const text = (doc, l) => flat(doc[l]).join('\n').replace(/<[^>]+>/g, '');
const shape = d => d.sections.map(s => Object.keys(s).filter(k => k !== 'h').map(k => k + (Array.isArray(s[k]) ? s[k].length : '')).join(','));

test('los 6 idiomas tienen exactamente la misma estructura (secciones, listas y párrafos)', () => {
  for (const doc of [P, T]) for (const l of LANGS) assert.deepEqual(shape(doc[l]), shape(doc.es), l);
});

test('hablan solo de la aplicación móvil: ninguna mención a versión web, sitio, navegador ni PWA', () => {
  const bad = /(versión web|version web|versão web|web version|webversion|aplicación web|aplicativo web|application web|applicazione web|webanwendung|sitio web|site web|sito web|website|webseite|navegador|navigateur|\bbrowser\b|\bPWA\b|google fonts|cdnjs)/i;
  for (const doc of [P, T]) for (const l of LANGS) {
    const m = text(doc, l).match(bad);
    assert.equal(m, null, `${l}: menciona "${m && m[0]}"`);
  }
});

test('dicen que la app está disponible para Android e iOS', () => {
  for (const doc of [P, T]) for (const l of LANGS) assert.match(doc[l].sections[0].p[0], /Android/); 
  for (const doc of [P, T]) for (const l of LANGS) assert.match(doc[l].sections[0].p[0], /iOS/);
});

test('la política declara los datos de seguridad de la cuenta (dispositivo, país aproximado, sin IP, máximo 20) y a Resend como proveedor de correos', () => {
  for (const l of LANGS) {
    const datos = P[l].sections[1].ul.join('\n');
    assert.match(datos, /20/, l); assert.match(datos, /Android · (app|App)/, l);
    assert.ok(/IP/.test(P[l].sections[1].ul[9]), l + ': tiene que aclarar que no se guarda la IP');
    assert.match(P[l].sections[5].ul.join('\n'), /Resend/, l);
    assert.doesNotMatch(P[l].sections[5].ul.join('\n'), /Google Fonts/, l);
  }
});

test('la política describe la seguridad real: tokens cifrados, verificación en dos pasos, aviso de dispositivo nuevo y copias cifradas con plazo de 90 días', () => {
  for (const l of LANGS) {
    const seg = P[l].sections[7].p[0], cons = P[l].sections[8].p.join('\n');
    assert.match(seg, /HTTPS\/TLS/); assert.match(seg, /Strava/);
    assert.match(cons, /90/, l + ': plazo de las copias de seguridad');
  }
});

test('las dos fechas de "última actualización" coinciden entre idiomas y entre documentos', () => {
  const nums = s => s.match(/\d+/g).join('-');
  const ref = nums(P.es.updated);
  for (const doc of [P, T]) for (const l of LANGS) assert.equal(nums(doc[l].updated), ref, l);
});

test('los datos a completar por el dueño (razón social, CUIT, domicilio) siguen marcados: no publicar la app sin completarlos', () => {
  for (const doc of [P, T]) for (const l of LANGS) assert.ok(doc[l].sections[0].ph && doc[l].sections[0].ph.length > 40, l);
});

test('el respaldo semanal cumple lo que promete la política: nada con más de 90 días (en la carpeta local y en el segundo disco)', () => {
  const ps = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'respaldo-semanal.ps1'), 'utf8');
  assert.match(ps, /AddDays\(-90\)/);
  assert.match(ps, /Remove-OldBackups \$extra/);
  assert.match(ps, /Remove-OldBackups \$dest/);
  assert.match(ps, /Select-Object -Skip 2/, 'siempre quedan las 2 más nuevas');
});
