// js/ui-events.js: el intérprete de data-on-* (sin eval) que reemplaza a los onclick escritos en el HTML, y las guardas que impiden volver a poner
// código inline (la CSP ya no permite 'unsafe-inline' en script-src).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../js/ui-events.js');
const { loadApp } = require('./support/load-app');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

function runWith(src, win, el, ev) {
  const state = { stopped: false };
  ui.run(src, el || {}, ev || {}, win, state);
  return state;
}

test('llama a funciones de la app con texto, números, this y event', () => {
  const calls = [];
  const win = { abrir: (...a) => calls.push(a), t: k => 'T:' + k };
  runWith("abrir('x', 3, -2, true, null)", win);
  runWith("abrir(this, event.key)", win, { id: 'el' }, { key: 'Enter' });
  runWith("abrir(t('clave'), \"otro\")", win);
  runWith("abrir('a' + 'b', 1 + 2)", win);
  assert.deepEqual(calls, [['x', 3, -2, true, null], [{ id: 'el' }, 'Enter'], ['T:clave', 'otro'], ['ab', 3]]);
});

test('varias sentencias, if(...) y comparaciones', () => {
  const calls = [];
  const win = { a: () => calls.push('a'), b: () => calls.push('b') };
  runWith('a(); b();', win);
  runWith("if(event.key==='Enter') a();", win, {}, { key: 'Enter' });
  runWith("if(event.key==='Enter') b();", win, {}, { key: 'x' });
  runWith("if(event.key==='Enter') a(); else b();", win, {}, { key: 'x' });
  assert.deepEqual(calls, ['a', 'b', 'a', 'b']);
});

test('lee propiedades de this (value, checked, dataset) y asigna solo a this.style/value/checked', () => {
  const seen = [];
  const win = { f: v => seen.push(v) };
  const el = { value: '7', checked: true, dataset: { iso: '2026-10-01' }, style: {} };
  runWith('f(this.value); f(this.checked); f(this.dataset.iso)', win, el);
  runWith("this.style.display='none'", win, el);
  assert.deepEqual(seen, ['7', true, '2026-10-01']);
  assert.equal(el.style.display, 'none');
  assert.throws(() => runWith("this.onclick='x'", win, el), /asignación no permitida/);
  assert.throws(() => runWith("window = 1", win, el), /asignación no permitida/);
  assert.throws(() => runWith("viewingWeekOffset=2", win, el), /asignación no permitida/);
});

test('event.stopPropagation() avisa que se detenga la cadena; métodos nativos solo de la lista corta sobre this/event', () => {
  const win = { f: () => {} };
  const ev = { stopPropagation() { throw new Error('el original no se llama desde acá'); } };
  const st = runWith('event.stopPropagation(); f()', win, {}, ev);
  assert.equal(st.stopped, true);
  const calls = [];
  const el = { classList: { add: x => calls.push('add:' + x) } };
  // las funciones de prueba no son nativas; una nativa de verdad se simula con Function.prototype.bind (aparece como [native code])
  runWith("this.classList.add('uno')", win, el);
  assert.deepEqual(calls, ['add:uno']);
});

test('NO ejecuta funciones nativas del navegador ni nada que no sea de la app (aunque alguien lograra meter un atributo)', () => {
  const win = { alert: alert => {}, f: () => {} };
  win.alert = Function.prototype.call.bind(Function.prototype);   // nativa
  win.fetch = Math.max;                                            // nativa
  win.eval = eval;
  win.Function = Function;
  for (const src of ["alert('x')", "fetch('/x')", "eval('1')", "Function('return 1')()", "f.constructor('return 1')()", "this.constructor.constructor('1')()", "window.location='x'", "f['constructor']('1')", "this.remove()"]) {
    assert.throws(() => runWith(src, win, { remove: Function.prototype.call.bind(Function.prototype) }), Error, src);
  }
  // y no hay forma de escribir código nuevo: sin funciones flecha, sin new, sin plantillas
  for (const src of ['() => 1', 'new Foo()', '`x`', 'a;b;{', 'f(']) assert.throws(() => ui.parse(src), Error, src);
});

test('el árbol se arma una vez por texto y no ejecuta nada al armarlo', () => {
  let n = 0;
  const win = { f: () => n++ };
  ui.parse('f()');
  assert.equal(n, 0);
  runWith('f()', win); runWith('f()', win);
  assert.equal(n, 2);
});

// ---------- guardas del repositorio ----------
const INLINE_ATTR = /[\s"'`](on(click|input|change|keydown|keyup|keypress|error|load|submit|focus|blur|mouseover|mouseout|touchstart|touchend|pointerdown|pointerup))=/;

test('index.html y app.js no vuelven a escribir manejadores inline (onclick=...): van como data-on-*', () => {
  for (const f of ['index.html', 'app.js', 'privacy.html', 'terms.html', ...fs.readdirSync(path.join(__dirname, '..', 'js')).filter(x => x.endsWith('.js') && x !== 'ui-events.js').map(x => 'js/' + x)]) {
    const s = read(f);
    const m = s.match(INLINE_ATTR);
    assert.equal(m, null, f + ' tiene un manejador inline: ' + (m && m[0]));
  }
});

test('ningún HTML trae <script> con código adentro, y la CSP de scripts no incluye unsafe-inline ni unsafe-eval', () => {
  for (const f of ['index.html', 'privacy.html', 'terms.html', 'connect-suunto.html']) {
    // se sacan los <style> y los comentarios, donde el texto puede nombrar "<script>"
    const s = read(f).replace(/<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '');
    const inline = [...s.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].filter(m => m[1].trim());
    assert.equal(inline.length, 0, f + ' tiene un <script> inline');
  }
  const vercel = JSON.parse(read('vercel.json'));
  const csp = vercel.headers.find(h => h.source === '/(.*)' && !h.has).headers.find(h => h.key === 'Content-Security-Policy').value;
  const scriptSrc = csp.split(';').map(x => x.trim()).find(x => x.startsWith('script-src'));
  assert.ok(scriptSrc, 'hay script-src');
  assert.doesNotMatch(scriptSrc, /unsafe-inline|unsafe-eval/);
});

test('todos los data-on-* de index.html los entiende el intérprete y llaman a funciones que existen en la app', () => {
  const app = loadApp();
  const html = read('index.html');
  const re = /data-on-(click|input|change|keydown|keyup|error|load)=("([^"]*)"|'([^']*)')/g;
  const names = new Set(); let n = 0, m;
  const collect = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.t === 'call' && node.callee.t === 'id') names.add(node.callee.name);
    for (const k of Object.keys(node)) { const v = node[k]; if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === 'object') collect(v); }
  };
  while ((m = re.exec(html))) {
    n++;
    const src = (m[3] !== undefined ? m[3] : m[4]).replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    collect({ t: 'prog', body: ui.parse(src) });
  }
  assert.ok(n > 150, 'se esperaban muchos manejadores, hubo ' + n);
  const missing = [...names].filter(x => typeof app[x] !== 'function');
  assert.deepEqual(missing, [], 'funciones llamadas desde el HTML que no existen: ' + missing.join(', '));
});

test('las pantallas dibujadas por app.js usan data-on-* que el intérprete entiende (barrido de render con datos de ejemplo)', () => {
  const app = loadApp();
  const reg = new Map();
  const realGet = app.document.getElementById;
  app.document.getElementById = id => { if (!reg.has(id)) reg.set(id, realGet(id)); return reg.get(id); };
  app.state.profile = { name: 'Ana', weeklyKm: 30, goal: '10k', runnerType: 'active', trainingDays: ['tue', 'thu', 'sun'], terrain: 'asfalto', units: 'metric', trainBy: 'distance', hrMax: 190, hrZones: app.computeZones(190) };
  app.state.runs = [1, 2].map(i => ({ id: 'r' + i, date: new Date(Date.now() - i * 86400000).toISOString(), distanceKm: 8, durationSec: 2900, shoeId: 's1', source: 'manual', points: [], hrLog: [] }));
  app.state.shoes = [{ id: 's1', name: 'Zapa', km: 100 }];
  app.state.painLog = [{ id: 'p1', date: '2026-10-10', part: 'knee', level: 3 }];
  app.state.plan = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => ({ day: d, typeKey: 'easy', dist: 5, terrain: 'asfalto' }));
  app.state.onboarded = true; app.state.weekStart = '2026-10-12';
  for (const f of ['renderHome', 'renderPlan', 'renderHistory', 'renderPastWeeks', 'renderZones', 'renderPainLog', 'renderHomePain', 'renderPerfil', 'renderAll']) { try { app[f](); } catch (e) { /* un render que falla por datos de ejemplo no es lo que se prueba acá */ } }
  const re = /data-on-(click|input|change|keydown|keyup|error|load)=("([^"]*)"|'([^']*)')/g;
  let found = 0;
  for (const el of reg.values()) {
    const h = String(el.innerHTML || ''); let m;
    while ((m = re.exec(h))) {
      found++;
      const src = (m[3] !== undefined ? m[3] : m[4]).replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      assert.doesNotThrow(() => ui.parse(src), 'no se entiende: ' + src);
    }
  }
  assert.ok(found > 10, 'el barrido tendría que encontrar manejadores dibujados (encontró ' + found + ')');
});
