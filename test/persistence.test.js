// test/persistence.test.js
//
// Pruebas de persist() -- el guardado del estado completo (plan, chat, perfil...) en
// Supabase. No prueban conexión real (los tests corren sin red), sino la coordinación
// entre llamadas: persist() se llama muchas veces seguidas en una sola interacción (cada
// herramienta que usa el coach en el chat llama a persist() por su cuenta, y sendChat
// llama a persist() de nuevo al final con la respuesta ya agregada al historial), y sin
// coordinación esas llamadas viajan como pedidos de red independientes que pueden llegar
// a Supabase en cualquier orden -- si el más viejo (con menos datos) tarda más y llega
// después, termina pisando al más nuevo.
//
// Reportado por el usuario: le pidió un cambio al coach, cerró la app apenas se vio el
// cambio en el plan, y al reabrirla el cambio de plan estaba pero los mensajes del chat
// (el suyo y el del coach) habían desaparecido -- justo la firma de un guardado viejo
// pisando a uno más nuevo.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

test('persist: mientras un guardado sigue en vuelo, uno nuevo no arranca un pedido de red compitiendo', async () => {
  const upsertCalls = [];
  const pending = [];
  const app = loadApp({
    onUpsert(payload) {
      return new Promise(resolve => {
        pending.push(resolve);
        upsertCalls.push({ chatLen: (payload.data.chat || []).length });
      });
    },
  });
  app.setCurrentUserId('user-de-prueba');
  app.state.chat = [{ role: 'user', text: 'cambiame el jueves', ts: 1 }];

  const p1 = app.persist(); // arranca el primer pedido -- todavía no resolvió
  assert.equal(upsertCalls.length, 1, 'el primer persist() debería salir enseguida');

  // Mientras el primero sigue en vuelo, el chat crece (llega la respuesta del coach) y
  // se llama a persist() de nuevo -- NO debería salir un segundo pedido compitiendo.
  app.state.chat.push({ role: 'coach', text: 'listo, lo cambié', ts: 2 });
  const p2 = app.persist();
  assert.equal(upsertCalls.length, 1, 'un persist() mientras el anterior sigue en vuelo no debería disparar un segundo pedido de red');

  // Resolvemos el primer pedido (el que salió con 1 solo mensaje, antes de la respuesta del coach)
  pending[0]({ data: null, error: null });
  await p1;
  await p2;

  // Como el segundo persist() quedó encolado, ahora sí debería haber salido un pedido
  // más -- pero con el estado MÁS ACTUAL (los 2 mensajes), nunca con una copia vieja.
  assert.equal(upsertCalls.length, 2, 'al terminar el primer guardado debería salir el guardado encolado, ni antes ni nunca');
  assert.equal(upsertCalls[1].chatLen, 2, 'el guardado encolado tiene que llevar el estado más actual, no el que había cuando arrancó el primero');

  // Dejamos resolver el segundo para no dejar promesas colgadas
  pending[1]({ data: null, error: null });
});

test('persist: varios pedidos en el mismo instante que uno está en vuelo se juntan en UN solo guardado encolado, no uno por cada llamada', async () => {
  const upsertCalls = [];
  const pending = [];
  const app = loadApp({
    onUpsert(payload) {
      return new Promise(resolve => {
        pending.push(resolve);
        upsertCalls.push({ chatLen: (payload.data.chat || []).length });
      });
    },
  });
  app.setCurrentUserId('user-de-prueba');
  app.state.chat = [{ role: 'user', text: 'msg 1', ts: 1 }];

  const p1 = app.persist();
  app.state.chat.push({ role: 'coach', text: 'msg 2', ts: 2 });
  const p2 = app.persist();
  app.state.chat.push({ role: 'user', text: 'msg 3', ts: 3 });
  const p3 = app.persist();
  app.state.chat.push({ role: 'coach', text: 'msg 4', ts: 4 });
  const p4 = app.persist();

  assert.equal(upsertCalls.length, 1, 'de cuatro llamadas casi simultáneas, solo la primera debería salir de entrada');

  pending[0]({ data: null, error: null });
  await Promise.all([p1, p2, p3, p4]);

  assert.equal(upsertCalls.length, 2, 'las tres llamadas encoladas mientras la primera estaba en vuelo se juntan en UN solo guardado más, no en tres');
  assert.equal(upsertCalls[1].chatLen, 4, 'ese guardado encolado tiene que llevar el estado más actual al momento de salir (los 4 mensajes)');

  pending[1]({ data: null, error: null });
});
