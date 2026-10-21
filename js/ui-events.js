/* js/ui-events.js
 *
 * Manejo de eventos de la interfaz SIN código escrito en el HTML.
 *
 * Antes cada botón llevaba su acción como texto en el atributo (onclick="abrirAlgo('x')"), y para que eso funcione el navegador tiene que
 * permitir "script inline" (CSP 'unsafe-inline'). Eso es justo lo que aprovecharía un ataque XSS. Ahora el HTML trae la misma acción como
 * dato (data-on-click="abrirAlgo('x')") y este archivo la ejecuta con un intérprete propio, mínimo y sin eval:
 *   - solo entiende llamadas a funciones, texto/números, this, event, if(...) y unas pocas asignaciones a this.style/value/checked;
 *   - solo llama a funciones de la propia app (jamás a funciones nativas del navegador como alert, fetch o eval), así que aunque alguien lograra
 *     meter un atributo en la página no podría ejecutar código arbitrario;
 *   - los métodos nativos permitidos sobre this/event son una lista corta (stopPropagation, classList.add...).
 * La CSP del sitio ya no incluye 'unsafe-inline' para scripts. test/ui-events.test.js prueba el intérprete.
 */
(function (root) {
  'use strict';

  var EVENT_TYPES = ['click', 'input', 'change', 'keydown', 'keyup', 'error', 'load'];
  // Únicos métodos nativos que se pueden llamar, con su camino completo (nada de this.remove(), this.innerHTML..., etc.)
  var NATIVE_METHODS = { 'event.stopPropagation': 1, 'event.preventDefault': 1, 'this.classList.add': 1, 'this.classList.remove': 1, 'this.classList.toggle': 1, 'this.focus': 1, 'this.blur': 1, 'this.select': 1, 'this.scrollIntoView': 1, 'this.click': 1, 'this.closest': 1 };
  var BLOCKED_PROPS = { constructor: 1, __proto__: 1, prototype: 1, __defineGetter__: 1, __defineSetter__: 1, __lookupGetter__: 1, __lookupSetter__: 1 };
  var ASSIGNABLE = /^(style\.[a-zA-Z]+|value|checked|hidden|disabled|textContent)$/;

  // ---------- tokenizador ----------
  function tokenize(src) {
    var t = [], i = 0, n = src.length, c;
    while (i < n) {
      c = src[i];
      if (c === ' ' || c === '\n' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '"' || c === "'") {
        var q = c, s = '';
        i++;
        while (i < n && src[i] !== q) {
          if (src[i] === '\\' && i + 1 < n) {
            i++;
            var e = src[i];
            s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          } else s += src[i];
          i++;
        }
        if (i >= n) throw new Error('texto sin cerrar');
        i++;
        t.push({ k: 'str', v: s });
        continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        var j = i;
        while (j < n && /[0-9.]/.test(src[j])) j++;
        t.push({ k: 'num', v: parseFloat(src.slice(i, j)) });
        i = j;
        continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        var k = i;
        while (k < n && /[A-Za-z0-9_$]/.test(src[k])) k++;
        t.push({ k: 'id', v: src.slice(i, k) });
        i = k;
        continue;
      }
      var three = src.substr(i, 3), two = src.substr(i, 2);
      if (three === '===' || three === '!==') { t.push({ k: 'op', v: three }); i += 3; continue; }
      if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||') { t.push({ k: 'op', v: two }); i += 2; continue; }
      if ('()[],;.=+-!?:<>'.indexOf(c) >= 0) { t.push({ k: 'op', v: c }); i++; continue; }
      throw new Error('carácter no permitido: ' + c);
    }
    t.push({ k: 'end' });
    return t;
  }

  // ---------- parser -> árbol ----------
  function parse(src) {
    var toks = tokenize(src), p = 0;
    var peek = function () { return toks[p]; };
    var isOp = function (v) { var x = toks[p]; return x.k === 'op' && x.v === v; };
    var isId = function (v) { var x = toks[p]; return x.k === 'id' && x.v === v; };
    var eatOp = function (v) { if (!isOp(v)) throw new Error('se esperaba ' + v); p++; };

    function statement() {
      if (isId('if')) {
        p++; eatOp('(');
        var test = expr();
        eatOp(')');
        var then = statement(), other = null;
        if (isOp(';') && toks[p + 1].k === 'id' && toks[p + 1].v === 'else') p++;   // "if(x) a(); else b();"
        if (isId('else')) { p++; other = statement(); }
        return { t: 'if', test: test, then: then, other: other };
      }
      return expr();
    }
    function expr() { return assignment(); }
    function assignment() {
      var left = ternary();
      if (isOp('=')) {
        p++;
        if (left.t !== 'member') throw new Error('asignación no permitida');
        return { t: 'assign', target: left, value: assignment() };
      }
      return left;
    }
    function ternary() {
      var test = logicalOr();
      if (isOp('?')) {
        p++;
        var a = assignment(); eatOp(':');
        var b = assignment();
        return { t: 'cond', test: test, a: a, b: b };
      }
      return test;
    }
    function bin(next, ops) {
      return function () {
        var l = next();
        while (peek().k === 'op' && ops.indexOf(peek().v) >= 0) { var op = toks[p++].v; l = { t: 'bin', op: op, l: l, r: next() }; }
        return l;
      };
    }
    var additive = function () { return bin(unary, ['+', '-'])(); };
    var relational = function () { return bin(additive, ['<', '>', '<=', '>='])(); };
    var equality = function () { return bin(relational, ['===', '!==', '==', '!='])(); };
    var logicalAnd = function () { return bin(equality, ['&&'])(); };
    var logicalOr = function () { return bin(logicalAnd, ['||'])(); };
    function unary() {
      if (isOp('!') || isOp('-') || isOp('+')) { var op = toks[p++].v; return { t: 'un', op: op, a: unary() }; }
      return postfix();
    }
    function postfix() {
      var e = primary();
      for (;;) {
        if (isOp('.')) {
          p++;
          var id = toks[p++];
          if (id.k !== 'id') throw new Error('se esperaba un nombre');
          e = { t: 'member', obj: e, prop: { t: 'lit', v: id.v }, name: id.v };
        } else if (isOp('[')) {
          p++; var idx = expr(); eatOp(']');
          e = { t: 'member', obj: e, prop: idx, name: null };
        } else if (isOp('(')) {
          p++;
          var args = [];
          if (!isOp(')')) { args.push(expr()); while (isOp(',')) { p++; args.push(expr()); } }
          eatOp(')');
          e = { t: 'call', callee: e, args: args };
        } else break;
      }
      return e;
    }
    function primary() {
      var x = toks[p++];
      if (x.k === 'num' || x.k === 'str') return { t: 'lit', v: x.v };
      if (x.k === 'id') {
        if (x.v === 'true') return { t: 'lit', v: true };
        if (x.v === 'false') return { t: 'lit', v: false };
        if (x.v === 'null') return { t: 'lit', v: null };
        if (x.v === 'undefined') return { t: 'lit', v: undefined };
        if (x.v === 'this') return { t: 'this' };
        if (x.v === 'event') return { t: 'event' };
        return { t: 'id', name: x.v };
      }
      if (x.k === 'op' && x.v === '(') { var e = expr(); eatOp(')'); return e; }
      throw new Error('expresión no válida');
    }

    var prog = [];
    while (peek().k !== 'end') {
      if (isOp(';')) { p++; continue; }
      prog.push(statement());
      if (peek().k !== 'end' && !isOp(';')) throw new Error('se esperaba ; entre sentencias');
    }
    return prog;
  }

  // ---------- evaluación ----------
  function isNative(fn) {
    try { return /\[native code\]/.test(Function.prototype.toString.call(fn)); } catch (e) { return true; }
  }
  // camino de una llamada como texto: this.classList.add -> "this.classList.add" (solo nombres fijos; con corchetes o llamadas intermedias no hay camino)
  function pathOf(node) {
    var parts = [];
    while (node.t === 'member') { if (node.name === null) return null; parts.unshift(node.name); node = node.obj; }
    if (node.t !== 'this' && node.t !== 'event') return null;
    parts.unshift(node.t);
    return parts.join('.');
  }
  function evaluate(node, env) {
    switch (node.t) {
      case 'lit': return node.v;
      case 'this': return env.el;
      case 'event': return env.ev;
      case 'id':
        if (BLOCKED_PROPS[node.name]) throw new Error('nombre bloqueado');
        return env.win[node.name];
      case 'un': {
        var a = evaluate(node.a, env);
        return node.op === '!' ? !a : node.op === '-' ? -a : +a;
      }
      case 'bin': {
        var l = evaluate(node.l, env);
        if (node.op === '&&') return l && evaluate(node.r, env);
        if (node.op === '||') return l || evaluate(node.r, env);
        var r = evaluate(node.r, env);
        switch (node.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '===': return l === r;
          case '!==': return l !== r;
          case '==': return l == r; // eslint-disable-line eqeqeq
          case '!=': return l != r; // eslint-disable-line eqeqeq
          case '<': return l < r;
          case '>': return l > r;
          case '<=': return l <= r;
          case '>=': return l >= r;
        }
        throw new Error('operador');
      }
      case 'cond': return evaluate(node.test, env) ? evaluate(node.a, env) : evaluate(node.b, env);
      case 'member': {
        var obj = evaluate(node.obj, env);
        var prop = node.name !== null ? node.name : evaluate(node.prop, env);
        if (BLOCKED_PROPS[prop]) throw new Error('propiedad bloqueada');
        return obj == null ? undefined : obj[prop];
      }
      case 'assign': {
        var path = [], n = node.target;
        while (n.t === 'member') { if (n.name === null) throw new Error('asignación no permitida'); path.unshift(n.name); n = n.obj; }
        if (n.t !== 'this' || !path.length || !ASSIGNABLE.test(path.join('.'))) throw new Error('asignación no permitida');
        var val = evaluate(node.value, env);
        var o = env.el;
        for (var i = 0; i < path.length - 1; i++) o = o[path[i]];
        o[path[path.length - 1]] = val;
        return val;
      }
      case 'call': {
        var c = node.callee, fn, thisArg;
        if (c.t === 'member') {
          thisArg = evaluate(c.obj, env);
          var name = c.name !== null ? c.name : evaluate(c.prop, env);
          if (BLOCKED_PROPS[name]) throw new Error('propiedad bloqueada');
          fn = thisArg == null ? undefined : thisArg[name];
          // métodos de this/event: solo una lista corta de nativos
          if (typeof fn === 'function' && isNative(fn)) {
            var full = pathOf(c);
            if (!full || !NATIVE_METHODS[full]) throw new Error('función nativa no permitida: ' + name);
          }
        } else {
          fn = evaluate(c, env);
          thisArg = env.win;
          if (typeof fn === 'function' && isNative(fn)) throw new Error('función nativa no permitida');
        }
        if (typeof fn !== 'function') throw new Error('no es una función');
        var args = node.args.map(function (x) { return evaluate(x, env); });
        return fn.apply(thisArg, args);
      }
      case 'if':
        if (evaluate(node.test, env)) return evaluate(node.then, env);
        return node.other ? evaluate(node.other, env) : undefined;
    }
    throw new Error('nodo desconocido');
  }

  var cache = {};
  function compile(src) {
    var hit = cache[src];
    if (hit) return hit;
    hit = parse(src);
    cache[src] = hit;
    return hit;
  }

  // Ejecuta el texto de un atributo data-on-* sobre un elemento. state.stopped lo prende event.stopPropagation().
  function run(src, el, ev, win, state) {
    var prog = compile(src);
    var wrapped = new Proxy(ev, {
      get: function (target, prop) {
        if (prop === 'stopPropagation') return function () { state.stopped = true; };
        if (prop === 'currentTarget') return el;
        var v = target[prop];
        return typeof v === 'function' ? v.bind(target) : v;
      }
    });
    var env = { el: el, ev: wrapped, win: win };
    for (var i = 0; i < prog.length; i++) evaluate(prog[i], env);
  }

  function attrName(type) { return 'data-on-' + type; }

  function install(doc, win) {
    EVENT_TYPES.forEach(function (type) {
      var attr = attrName(type);
      var bubbles = type !== 'error' && type !== 'load';
      doc.addEventListener(type, function (ev) {
        var el = ev.target && ev.target.nodeType === 1 ? ev.target : null;
        var state = { stopped: false };
        // click/input/...: de adentro hacia afuera, como el burbujeo de siempre; load/error no burbujean: solo el propio elemento
        while (el) {
          if (el.hasAttribute && el.hasAttribute(attr)) {
            try { run(el.getAttribute(attr), el, ev, win, state); }
            catch (e) { if (win.console) win.console.error('ui-events:', e && e.message, '|', el.getAttribute(attr)); }
            if (state.stopped) break;
          }
          if (!bubbles) break;
          el = el.parentElement;
        }
        if (state.stopped && ev.stopPropagation) ev.stopPropagation();
      }, !bubbles);
    });
  }

  var api = { parse: parse, run: run, install: install, EVENT_TYPES: EVENT_TYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.ZancadaUiEvents = api;
    install(root.document, root);
  }
})(typeof window !== 'undefined' ? window : globalThis);
