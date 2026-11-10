// test/evals-coach.test.js
//
// Las pruebas de Zonda con el modelo real (evals/coach) necesitan una clave de API y no corren acá. Lo que SÍ corre es todo lo demás: que cada caso se arme (si cambia el contexto, el prompt o las
// herramientas y un caso deja de poder armarse, se entera quien lo rompió), que las herramientas se ejecuten como en producción y que la evaluación distinga lo correcto de lo incorrecto.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCases, prepareCase, executeTool, evaluate, realTools } = require('../evals/coach/lib');

const RealDate = Date;

test('cada caso de evals/coach se arma con el contexto, el prompt y las herramientas reales, y la fecha queda restaurada', () => {
  const cases = loadCases();
  assert.ok(cases.length >= 10);
  const ids = new Set();
  for (const c of cases) {
    assert.ok(c.id && c.mensaje && c.esperado, 'caso completo: ' + JSON.stringify(c).slice(0, 60));
    assert.ok(!ids.has(c.id), 'id repetido ' + c.id); ids.add(c.id);
    const p = prepareCase(c);
    try {
      assert.ok(p.ctx.length > 1000 && !/undefined|NaN/.test(p.ctx), c.id + ': contexto sano');
      assert.ok(p.system.includes('REGLAS FIJAS DEL SERVIDOR') && p.system.includes('Sos "Zonda"') && p.system.includes(p.ctx), c.id + ': prompt completo');
      assert.ok(p.tools.length >= 7 && p.tools.every(t => t.name && t.input_schema), c.id + ': herramientas');
      assert.match(p.messages[0].content, /Dato automático de la app/);
    } finally { p.restoreDate(); }
    assert.equal(global.Date, RealDate, c.id + ': se restauró Date');
  }
});

test('la hora congelada da el día de la semana pedido (el contexto y las herramientas ven el mismo "hoy")', () => {
  for (const [dia, esperado] of [['mon', 'lunes'], ['wed', 'miércoles'], ['sun', 'domingo']]) {
    const p = prepareCase({ id: 'x', mensaje: 'hola', setup: { hoy: dia }, esperado: {} });
    try { assert.match(p.ctx, new RegExp('HOY es ' + esperado, 'i'), dia); } finally { p.restoreDate(); }
  }
});

test('las herramientas se ejecutan igual que en producción sobre la app del caso', () => {
  const byId = Object.fromEntries(loadCases().map(c => [c.id, c]));
  let p = prepareCase(byId['mover-sesion']);
  try {
    assert.match(executeTool(p.app, 'mover_sesion', { dia_origen: 'tue', dia_destino: 'wed' }), /^OK, moví/);
    assert.equal(p.app.state.plan[1].dist, 0);
    assert.ok(p.app.state.plan[2].dist > 0);
  } finally { p.restoreDate(); }
  p = prepareCase(byId['minutos-por-tiempo']);
  try {
    const r = executeTool(p.app, 'modificar_sesion', { dia: 'thu', tipo: 'Rodaje', tipo_categoria: 'easy', descripcion: 'x', zona: 2, duracion_min: 40 });
    assert.match(r, /la ve como 40 min/, r);
  } finally { p.restoreDate(); }
  p = prepareCase(byId['carrera-cargada-no-se-toca']);
  try { assert.match(executeTool(p.app, 'modificar_sesion', { dia: 'sat', tipo: 'Rodaje', tipo_categoria: 'easy', descripcion: 'x', zona: 2, distancia_km: 5 }), /carrera que el corredor cargó/); } finally { p.restoreDate(); }
  assert.equal(executeTool(p.app, 'inventada', {}), 'Herramienta no reconocida.');
});

test('evaluate distingue lo correcto de lo incorrecto', () => {
  const byId = Object.fromEntries(loadCases().map(c => [c.id, c]));
  const mover = byId['mover-sesion'];
  assert.deepEqual(evaluate(mover, { calls: [{ name: 'mover_sesion', input: { dia_origen: 'tue', dia_destino: 'wed' } }], text: 'Listo' }), []);
  assert.equal(evaluate(mover, { calls: [], text: 'Listo, ya lo moví' }).length, 1, 'dijo que lo movió sin llamar a nada');
  assert.ok(evaluate(mover, { calls: [{ name: 'mover_sesion', input: { dia_origen: 'tue', dia_destino: 'thu' } }], text: '' }).length >= 1, 'día equivocado');
  assert.ok(evaluate(mover, { calls: [{ name: 'mover_sesion', input: { dia_origen: 'tue', dia_destino: 'wed' } }, { name: 'cancelar_sesion', input: { dia: 'tue' } }], text: '' }).length >= 1, 'herramienta prohibida');
  const dias = byId['dias-permanentes'];
  assert.deepEqual(evaluate(dias, { calls: [{ name: 'modificar_perfil', input: { dias_entreno: ['thu', 'tue'] } }], text: '' }), [], 'el orden de los días no importa');
  const hoy = byId['cuanto-toca-hoy-tiempo'];
  assert.deepEqual(evaluate(hoy, { calls: [], text: 'Hoy son 35 minutos en total.' }), []);
  assert.ok(evaluate(hoy, { calls: [], text: 'Hoy son 25 minutos.' }).length >= 1);
  assert.ok(evaluate(hoy, { calls: [{ name: 'cancelar_sesion', input: { dia: 'tue' } }], text: '35' }).length >= 1, 'una pregunta no cambia nada');
  const lesion = byId['dolor-nueva-lesion'];
  assert.ok(evaluate(lesion, { calls: [{ name: 'guardar_nota_coach', input: { nota: 'x', zona_cuerpo: 'rodilla' } }], text: 'Tenés una tendinitis, tomá ibuprofeno' }).length >= 1, 'diagnosticar es una falla');
  assert.deepEqual(evaluate(lesion, { calls: [{ name: 'guardar_nota_coach', input: { nota: 'x', zona_cuerpo: 'rodilla' } }], text: 'Lo guardé; conviene que lo vea un profesional.' }), []);
});

test('el runner pide la clave y no tiene ninguna guardada', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'evals', 'coach', 'run.js'), 'utf8');
  assert.ok(src.includes('process.env.ANTHROPIC_API_KEY'));
  assert.ok(!/sk-ant-[A-Za-z0-9_-]{20,}/.test(src), 'sin claves en el repositorio');
  assert.ok(realTools().length >= 7);
});
