// test/support/load-app.js
//
// app.js está pensado para correr en un navegador de verdad (un <script> más,
// sin módulos ni build step) -- no exporta nada, todo vive en variables
// globales. Para poder probar su lógica (el motor del plan, el clima, los
// formateadores, etc.) sin levantar un navegador real, este helper arma un
// "navegador de mentira" MINIMO con vm.createContext(): un `document` que
// devuelve un elemento falso ante cualquier getElementById/querySelector (así
// el cableado de eventos que hace app.js apenas carga -- ob-terrain,
// units-toggle, etc. -- no explota por elementos que no existen), un
// `localStorage` en memoria, y un `window.supabase` de mentira (para que
// `createClient(...)` en la línea 1 de app.js no falle).
//
// A propósito NO usa jsdom ni ninguna librería -- este sandbox no tiene
// acceso a internet para instalar dependencias nuevas, así que el helper
// tiene que ser 100% Node puro. Esto ademas lo hace rápido: no arma un DOM de
// verdad, solo lo mínimo para que el código cargue y se puedan llamar las
// funciones puras (las que no dependen de tocar la pantalla de verdad).
//
// Qué NO cubre este helper: cualquier función que dependa de que un elemento
// específico tenga contenido de verdad (por ejemplo, leer
// document.getElementById('ob-terrain').value) va a recibir un elemento
// falso y vacío. Está pensado para probar lógica pura (generatePlan,
// planLabel, classifyWeatherCode, formateadores, etc.), no para probar
// renderizado de pantalla.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_JS_PATH = path.join(__dirname, '..', '..', 'app.js');
const LOCALES_DIR = path.join(__dirname, '..', '..', 'locales');

function makeFakeStyle() {
  const store = {};
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'setProperty' || prop === 'removeProperty') return () => {};
      if (prop === 'getPropertyValue') return () => '';
      return '';
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function makeFakeElement() {
  const store = {
    value: '', textContent: '', innerHTML: '',
    dataset: {}, children: [],
    style: makeFakeStyle(), classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  };
  const handler = {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'addEventListener' || prop === 'removeEventListener') return () => {};
      if (prop === 'appendChild' || prop === 'setAttribute' || prop === 'removeAttribute') return () => {};
      if (prop === 'querySelector' || prop === 'querySelectorAll') return () => (prop === 'querySelectorAll' ? [] : makeFakeElement());
      if (prop === 'closest') return () => null;
      // Cualquier otro método/propiedad desconocida: función no-op, para que
      // encadenar llamadas no declaradas acá arriba no rompa nada.
      return function () { return undefined; };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  };
  return new Proxy(store, handler);
}

function makeFakeLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
  };
}

function makeFakeDocument() {
  const fakeEl = makeFakeElement();
  return {
    getElementById: () => makeFakeElement(),
    querySelector: () => makeFakeElement(),
    querySelectorAll: () => [],
    createElement: () => makeFakeElement(),
    addEventListener() {}, removeEventListener() {},
    documentElement: makeFakeElement(),
    body: fakeEl,
    hidden: false,
  };
}

// Carga app.js (y los locales) en un contexto de Node aislado y devuelve ese
// contexto -- desde un test se accede a las funciones globales de app.js
// como propiedades de lo que devuelve esta función (ej. `app.generatePlan`,
// `app.state`, `app.t`).
function loadApp(opts) {
  opts = opts || {};
  const sandbox = {};
  sandbox.window = sandbox; // en un navegador, window ES el global -- acá lo imitamos
  sandbox.globalThis = sandbox;
  sandbox.console = console;
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.dispatchEvent = () => true;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  // setInterval de mentira (no-op) -- si dejáramos pasar el de Node de
  // verdad, app.js arranca un timer real de 25s (flushPendingBackup) que
  // quedaría corriendo de fondo y no dejaría terminar el proceso de tests.
  sandbox.setInterval = () => 0;
  sandbox.clearInterval = () => {};
  sandbox.document = makeFakeDocument();
  sandbox.localStorage = makeFakeLocalStorage();
  sandbox.sessionStorage = makeFakeLocalStorage();
  sandbox.navigator = { language: 'es-AR', onLine: true, vibrate: undefined, geolocation: undefined };
  sandbox.location = { href: 'http://localhost/', search: '', hostname: 'localhost' };
  sandbox.fetch = () => Promise.reject(new Error('red deshabilitada en los tests'));
  sandbox.matchMedia = () => ({ matches: false, addListener(){}, addEventListener(){} });
  sandbox.getComputedStyle = () => ({ getPropertyValue: () => '' });
  sandbox.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  sandbox.cancelAnimationFrame = (id) => clearTimeout(id);
  // performance.now(): ningún test anterior llamaba a renderHome() (siempre probaban
  // funciones puras como generatePlan directamente), así que esta falta nunca se había
  // notado -- animateCountUp() la usa para animar los números de la pantalla de Inicio.
  sandbox.performance = { now: () => Date.now() };
  sandbox.URLSearchParams = URLSearchParams;
  sandbox.Intl = Intl;
  sandbox.Date = Date;

  // Cliente de Supabase de mentira: alcanza con que exista y no explote --
  // la mayoría de los tests de lógica pura ni llaman a estos métodos. Los que sí
  // (persist(), para probar que los guardados no se pisan entre sí -- ver
  // plan-engine.test.js) pueden pasar opts.onUpsert para controlar cuándo
  // "responde" cada upsert y así simular guardados que llegan en otro orden.
  const chain = () => {
    const q = {
      select(){ return q; }, eq(){ return q; },
      upsert(payload){ return opts.onUpsert ? opts.onUpsert(payload) : Promise.resolve({ data: null, error: null }); },
      maybeSingle(){ return Promise.resolve({ data: null, error: null }); }, delete(){ return q; },
      order(){ return q; }, limit(){ return q; }, then(resolve){ resolve({ data: null, error: null }); },
    };
    return q;
  };
  sandbox.supabase = {
    createClient: () => ({
      from: () => chain(),
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
        signInWithPassword: () => Promise.resolve({ data: null, error: null }),
      },
    }),
  };

  vm.createContext(sandbox);

  // Los locales tienen que cargar ANTES que app.js (mismo orden que
  // index.html) para que I18N esté completo cuando app.js arranca.
  const localeFiles = fs.readdirSync(LOCALES_DIR).filter(f => f.endsWith('.js')).sort();
  for (const file of localeFiles) {
    const src = fs.readFileSync(path.join(LOCALES_DIR, file), 'utf8');
    vm.runInContext(src, sandbox, { filename: file });
  }

  const appSrc = fs.readFileSync(APP_JS_PATH, 'utf8');
  vm.runInContext(appSrc, sandbox, { filename: 'app.js' });

  // `let`/`const` de nivel superior en app.js (state, DAY_KEYS, lang, ...) NO
  // quedan como propiedades del objeto global (ni en un navegador real, ni
  // acá) -- solo las declaraciones con `function` o `var` sí. Como esta
  // llamada corre en el MISMO contexto/scope léxico que recién ejecutó
  // app.js, puede "ver" esas variables y copiarlas a mano al sandbox para
  // que los tests las puedan leer y modificar (ej. `app.state.profile = ...`
  // antes de llamar a generatePlan).
  // setCurrentUserId es solo para tests que necesitan que persist() haga algo (por
  // default currentUserId es null y persist() no llama a Supabase para nada) -- currentUserId
  // es un `let` de nivel superior, así que (a diferencia de `state`, un objeto) no alcanza con
  // reasignar una propiedad desde afuera: hace falta esta función, evaluada en el mismo scope
  // léxico que el resto de app.js, para poder tocar esa variable de verdad.
  vm.runInContext(
    'this.__exposed = { state, DAY_KEYS, lang, setCurrentUserId(v){ currentUserId = v; } };',
    sandbox,
    { filename: 'expose-internals.js' }
  );
  Object.assign(sandbox, sandbox.__exposed);
  delete sandbox.__exposed;

  return sandbox;
}

module.exports = { loadApp };
