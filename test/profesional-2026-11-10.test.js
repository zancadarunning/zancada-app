// Pasada "más profesional" del 2026-11-10: jerarquía (una sola acción lima), orden de Inicio, Zonda flotante que no tapa, escala de letra y velocidades acotadas.
// Pruebas sobre el texto de index.html / app.js / locales; el diseño se verificó además en el navegador (320, 360 y 390 px, 6 idiomas, contraste en claro y oscuro).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split(String.fromCharCode(13)).join('');
const HTML = read('index.html');
const APP = read('app.js');
const CSS = [...HTML.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const view = (id, next) => HTML.slice(HTML.indexOf('<section class="view" id="view-' + id + '">'), HTML.indexOf('<section class="view" id="view-' + next + '">'));

test('Inicio: la sesión de hoy va antes que cualquier aviso (carga, instalar, test, ajustes)', () => {
  const home = view('inicio', 'plan');
  const today = home.indexOf('id="home-next-card"');
  assert.ok(today > 0);
  for (const id of ['history-calib-card', 'home-test-banner', 'home-test-missed', 'home-weekdays-card', 'home-adjust-card', 'home-load-card', 'home-return-card', 'home-pain-card', 'home-recal-card', 'home-recap-card', 'install-banner']) {
    assert.ok(home.indexOf('id="' + id + '"') > today, id + ' va debajo de la sesión de hoy');
  }
  assert.ok(home.indexOf('id="readiness-card"') > home.indexOf('id="install-banner"'), 'el check-in sigue después de los avisos');
});

test('una sola acción lima por pantalla: en Inicio solo el test de nivel obligatorio conserva el botón primario; en Plan ninguno', () => {
  const home = view('inicio', 'plan');
  const primaries = [...home.matchAll(/class="btn btn-primary[^"]*"[^>]*>/g)].map(m => m[0]);
  assert.equal(primaries.length, 1, 'botones primarios en Inicio: ' + primaries.join(' | ').slice(0, 300));
  assert.match(primaries[0], /openLevelTest\(\)/);
  assert.equal((view('plan', 'correr').match(/btn btn-primary/g) || []).length, 0, 'Plan sin botón primario');
  assert.match(home, /id="home-load-card" style="display:none; border-color:var\(--clay\);"/, 'el aviso de carga usa el color de advertencia, no el lima');
  assert.doesNotMatch(home, /id="home-(test-missed|return-card|pain-card|recal-card)" style="[^"]*--hivis/);
});

test('Zonda flotante: se retira al bajar, vuelve al subir o arriba de todo, y no se retira con un mensaje sin leer', () => {
  assert.match(CSS, /\.coach-fab-wrap\.coach-fab-away \.coach-fab[^{]*\{opacity:0;[^}]*pointer-events:none;\}/);
  assert.ok(APP.includes("if(y < 48 || pinned || y < lastY - 6) fabWrap.classList.remove('coach-fab-away');"));
  assert.ok(APP.includes("else if(y > lastY + 6) fabWrap.classList.add('coach-fab-away');"));
  assert.ok(APP.includes("fabWrapEl.classList.remove('coach-fab-away');"), 'cada pantalla arranca con Zonda a la vista');
  assert.doesNotMatch(APP, /coach-fab-scrolling/);
});

test('detalles: versión legible, compartir como icono, la fecha no se repite en el detalle y el saludo no lleva emoji', () => {
  assert.ok(APP.includes('versionEl.textContent = appVersionLabel();'));
  const fn = new Function('APP_VERSION', APP.slice(APP.indexOf('function appVersionLabel(){'), APP.indexOf('function updateCoachFabVisibility(){')) + '; return appVersionLabel();');
  assert.equal(fn('2026-11-10T15:25:34Z'), 'v2026.11.10 (1525)');
  assert.equal(fn('rara'), 'vrara');
  assert.ok(APP.includes('<button class="hist-share-btn" aria-label="${t(\'hist_share\')}"'));
  assert.match(CSS, /\.hist-share-btn\{width:var\(--tap\); height:var\(--tap\);/);
  assert.ok(APP.includes("${r.name ? dateStr.charAt(0).toUpperCase() + dateStr.slice(1) + ', ' + timeStr : timeStr}"));
  assert.doesNotMatch(view('inicio', 'plan'), /👋/);
});

test('onboarding: el texto ya no promete "menos de un minuto" (son hasta 17 preguntas)', () => {
  const bad = { es: /menos de un minuto/i, en: /less than a minute/i, pt: /menos de um minuto/i, fr: /moins d'une minute/i, it: /meno di un minuto/i, de: /weniger als eine Minute/i };
  for (const [l, re] of Object.entries(bad)) assert.doesNotMatch(read('locales/' + l + '.js').match(/ob_lead:"([^"]*)"/)[1], re, l);
});

test('títulos de paneles con el estilo Subtitle (Bebas queda para las pestañas y los números destacados)', () => {
  assert.ok(APP.includes('<h2 class="subtitle" style="font-size:22px; margin-bottom:2px;">${t(\'ach_title\')}</h2>'));
  assert.ok(HTML.includes('<h2 class="subtitle" data-i18n="heat_title"></h2>'));
  assert.match(CSS, /\.ss-card\{[^}]*border-radius:var\(--radius\);/);
});

test('sistema: sin medios píxeles en los tamaños de letra, "píldora" siempre 999px y transiciones en tres velocidades', () => {
  assert.equal((HTML.match(/font-size:\s*\d+\.5px/g) || []).length, 0, 'index.html sin tamaños .5px');
  assert.equal((APP.match(/font-size:\s*\d+\.5px/g) || []).length, 0, 'plantillas de app.js sin tamaños .5px');
  assert.equal((CSS.match(/border-radius:\s*99px/g) || []).length, 0);
  const durs = new Set();
  for (const m of CSS.matchAll(/transition:([^;}]*)/g)) for (const d of m[1].matchAll(/(?:^|[\s,])(0?\.\d+)s(?![\w.])/g)) { const v = parseFloat(d[1]); if (v >= 0.12 && v <= 0.36) durs.add(v); }
  assert.deepEqual([...durs].sort(), [0.13, 0.2, 0.3], 'velocidades entre .12s y .36s: ' + [...durs].join(', '));
});
