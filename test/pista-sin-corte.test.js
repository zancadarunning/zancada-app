// Pedido del dueño (2026-11-24): la pista de atletismo animada de Correr mostraba un corte arriba a la izquierda (donde el camino se cierra), como si tuviera inicio y final.
// Causa: el largo real del carril (~374,25) no es múltiplo del período de los trazos (14 + 10 = 24), así que el patrón no encajaba al cerrar el camino.
// Con pathLength declarado como múltiplo exacto del período, el patrón es continuo; y el corrimiento de la animación (rbrFlow) también tiene que ser múltiplo del período para que el bucle no salte.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('el carril animado de la pista de Correr no tiene costura: largo y corrimiento son múltiplos del período de los trazos', () => {
  const dash = html.match(/\.rbr-route\{[^}]*stroke-dasharray:\s*([\d.]+)\s+([\d.]+)/);
  assert.ok(dash, 'no se encontró el stroke-dasharray de .rbr-route');
  const period = Number(dash[1]) + Number(dash[2]);
  const len = html.match(/<path class="rbr-route"[^>]*pathLength="([\d.]+)"/);
  assert.ok(len, 'el carril .rbr-route tiene que declarar pathLength (sin eso el largo real no encaja con el patrón y se ve un corte)');
  assert.equal(Number(len[1]) % period, 0, 'pathLength ' + len[1] + ' no es múltiplo del período ' + period);
  const flow = html.match(/@keyframes rbrFlow\{[^}]*stroke-dashoffset:\s*(-?[\d.]+)/);
  assert.ok(flow, 'no se encontró la animación rbrFlow');
  assert.equal(Math.abs(Number(flow[1])) % period, 0, 'el corrimiento ' + flow[1] + ' no es múltiplo del período ' + period);
});
