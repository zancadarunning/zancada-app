// test/chat-model.test.js
//
// Qué modelo atiende cada pedido del coach: sin CHAT_ACTION_MODEL todo va a Haiku (no cambia nada ni cuesta más); con la variable, solo los pedidos que cambian el plan.

const test = require('node:test');
const assert = require('node:assert/strict');
const { pickModel, DEFAULT_MODEL } = require('../api/_lib/chat-model');

const msg = text => [{ role: 'user', content: text + '\n\n[Dato automático de la app, no lo escribió el corredor: ahora es lunes, 10:00 hs. HOY es lunes.]' }];
const ENV = { CHAT_ACTION_MODEL: 'claude-sonnet-5-5' };

test('sin CHAT_ACTION_MODEL (o con un valor raro) todo va al modelo de siempre', () => {
  assert.equal(pickModel(msg('pasá el martes al miércoles'), true, {}), DEFAULT_MODEL);
  assert.equal(pickModel(msg('pasá el martes al miércoles'), true, { CHAT_ACTION_MODEL: '' }), DEFAULT_MODEL);
  assert.equal(pickModel(msg('pasá el martes al miércoles'), true, { CHAT_ACTION_MODEL: 'gpt-4; rm -rf' }), DEFAULT_MODEL);
  assert.equal(pickModel(msg('pasá el martes al miércoles'), true, { CHAT_ACTION_MODEL: 'claude-x' }), DEFAULT_MODEL, 'id demasiado corto/raro');
  assert.equal(pickModel(msg('pasá el martes al miércoles'), true, undefined), DEFAULT_MODEL);
});

test('con la variable: los pedidos de cambio van al modelo capaz, en los 6 idiomas', () => {
  const asks = ['pasá el martes al miércoles', 'poné 40 min el jueves', 'cancelá el viernes', 'bajame el volumen', 'no puedo correr el sábado', 'de ahora en adelante entreno martes y jueves',
    'move Tuesday to Wednesday', 'cancel Friday', 'lower my volume', 'mude a terça para quarta', 'não posso correr sábado', "déplace mardi à mercredi", 'annule vendredi', 'sposta martedì a mercoledì',
    'non posso correre sabato', 'verschieb Dienstag auf Mittwoch', 'streich den Freitag', 'ab jetzt laufe ich dienstags'];
  for (const a of asks) assert.equal(pickModel(msg(a), true, ENV), 'claude-sonnet-5-5', a);
});

test('con la variable: preguntas y charla siguen en Haiku', () => {
  const chats = ['¿qué toca hoy?', '¿cómo vengo esta semana?', 'hola', '¿qué es el fartlek?', 'what should I eat before a run?', "c'est quoi la zone 2 ?"];
  for (const c of chats) assert.equal(pickModel(msg(c), true, ENV), DEFAULT_MODEL, c);
});

test('el "dato automático" que pega la app no cuenta como pedido, y las vueltas de herramientas terminan con el modelo capaz', () => {
  const m = [{ role: 'user', content: '¿qué toca hoy?\n\n[Dato automático de la app, no lo escribió el corredor: ahora es lunes. Cambiá lo que quieras.]' }];
  assert.equal(pickModel(m, true, ENV), DEFAULT_MODEL);
  const toolTurn = [{ role: 'user', content: 'x' }, { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'x', input: {} }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'OK' }] }];
  assert.equal(pickModel(toolTurn, true, ENV), 'claude-sonnet-5-5');
});

test('sin herramientas (el traductor de textos) siempre va al modelo de siempre', () => {
  assert.equal(pickModel(msg('cancelá el viernes'), false, ENV), DEFAULT_MODEL);
});

test('api/chat.js usa pickModel y no deja el modelo fijo', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'api', 'chat.js'), 'utf8');
  assert.ok(src.includes("pickModel(messages, !!(tools && tools.length), process.env)"));
  assert.ok(!src.includes("const model = 'claude-haiku"));
});
