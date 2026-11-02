// Desconectar y volver a conectar un reloj: lo que la app (o el servidor) recordaba haber enviado ya no vale, porque al desconectar se borran los entrenamientos del reloj.
// Bug real (Garmin): la app creía que el jueves y la semana próxima ya estaban enviados y solo mandó los días que habían cambiado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('app.js');

test('el servidor borra la memoria del plan enviado al desconectar y al conectar cada reloj (si no, un plan igual se toma como "sin cambios" y no se manda)', () => {
  const pairs = [['suunto', 'suunto_plan'], ['wahoo', 'wahoo_plan'], ['coros', 'coros_plan']];
  for (const [brand, kind] of pairs) {
    for (const file of [`api/${brand}-disconnect.js`, `api/${brand}-auth.js`]) {
      const src = read(file);
      assert.ok(src.includes(`sent_notifications?user_id=eq.\${userId}&kind=eq.${kind}`) && /method: 'DELETE'/.test(src), `${file} borra ${kind}`);
    }
  }
  for (const file of ['api/garmin-disconnect.js', 'api/garmin-callback.js']) {
    assert.ok(read(file).includes('kind=in.(garmin_wk,garmin_plan)'), `${file} borra lo recordado de Garmin`);
  }
  assert.ok(read('api/garmin-webhook.js').includes('kind=in.(garmin_wk,garmin_plan)'), 'la desconexión desde Garmin también');
});

test('al tocar Conectar, Wahoo, Suunto y COROS olvidan lo que recordaban haber enviado', () => {
  for (const [fn, mem] of [['connectWahoo', 'state.wahooSent = null'], ['connectSuunto', 'state.suuntoSent = null'], ['connectCoros', 'state.corosSent = null']]) {
    const body = app.slice(app.indexOf(`async function ${fn}(`), app.indexOf(`async function ${fn}(`) + 900);
    assert.ok(body.includes(mem), `${fn} limpia la memoria`);
  }
});

test('Garmin manda siempre toda la ventana (el servidor sabe qué hay de verdad en Garmin), no solo los días que la app cree que cambiaron', () => {
  const sync = app.slice(app.indexOf('async function syncPlanToGarmin('), app.indexOf('async function syncPlanToGarmin(') + 2500);
  assert.match(sync, /const changed = win;/);
  assert.doesNotMatch(sync, /sent\[d\.date\] !== sigOf\(d\)/);
});
