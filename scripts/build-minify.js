// scripts/build-minify.js
//
// Achica app.js para publicar (lo que baja el celular al abrir la app). El codigo FUENTE en el repositorio no cambia: se sigue editando
// app.js tal cual y los tests siguen leyendolo. Esto corre solo en el despliegue de Vercel (vercel.json -> buildCommand) con --inplace, y reemplaza los
// archivos del despliegue (no los del repositorio) por su version minificada.
//
// Uso local para probar:   node scripts/build-minify.js            (escribe en .build/, no toca nada)
//                          node scripts/build-minify.js --inplace   (reemplaza app.js en esta carpeta: NO hacerlo y commitear)
//
// Cuidados:
//  - La primera linea de app.js (const APP_VERSION = '...') se copia TAL CUAL: checkForAppUpdate pide solo los primeros bytes del archivo y la busca con una
//    expresion regular literal. Si el minificador la reescribiera (comillas dobles, unida a otra const) la app dejaria de detectar versiones nuevas.
//  - Los nombres del nivel superior no se renombran (es un <script> clasico, no un modulo: js/ui-events.js y otros dependen de esos globales).
//  - Si algo sale mal el script termina con error y Vercel no publica (queda la version anterior), nunca publica algo roto a medias.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const inplace = process.argv.includes('--inplace');
const outDir = inplace ? ROOT : path.join(ROOT, '.build');
const TARGET = 'es2020';   // iPhone con iOS 13.4+, Chrome/WebView 80+: el piso que ya exige la app (usa ?. y ??); esbuild no sube la sintaxis por encima

function minify(code, name) {
  const out = esbuild.transformSync(code, { minify: true, target: TARGET, legalComments: 'none', charset: 'utf8', sourcefile: name, logLevel: 'silent' });
  return out.code;
}

function write(rel, content) {
  const dest = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}

const report = [];

// ---- app.js: primera linea intacta + el resto minificado
{
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const nl = src.indexOf('\n');
  const first = src.slice(0, nl).replace(/\r$/, '');
  if (!/^const APP_VERSION\s*=\s*'[^']+';?$/.test(first)) throw new Error('la primera linea de app.js ya no es const APP_VERSION = \'...\'');
  const out = first.replace(/;?$/, ';') + '\n' + minify(src.slice(nl + 1), 'app.js');
  // lo que lee checkForAppUpdate con Range bytes=0-200
  const head = out.slice(0, 201);
  if (!/const APP_VERSION\s*=\s*'([^']+)'/.test(head)) throw new Error('APP_VERSION no quedo dentro de los primeros 200 bytes');
  new Function(out.replace(/^const APP_VERSION/, 'var APP_VERSION'));   // la salida tiene que seguir siendo JavaScript valido
  write('app.js', out);
  report.push(['app.js', Buffer.byteLength(src), Buffer.byteLength(out)]);
}

for (const [n, a, b] of report) console.log(n.padEnd(18), String(a).padStart(9), '->', String(b).padStart(9), '(' + Math.round((1 - b / a) * 100) + '% menos)');
console.log(inplace ? 'escrito en el lugar' : 'escrito en .build/');
