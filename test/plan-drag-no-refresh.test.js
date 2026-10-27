// Arrastrar una sesion del plan para moverla (initPlanDrag) NO puede disparar "deslizar para actualizar": hacia abajo (viernes -> domingo) el gesto pasaba los 90 px y recargaba la pantalla.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

test('el deslizar-para-actualizar se apaga mientras hay un arrastre de sesion activo', () => {
  const i = s.indexOf("document.addEventListener('touchmove', e=>{\n  if(!pullActive || pullTriggered) return;");
  assert.ok(i > -1, 'handler de pull-to-refresh');
  const body = s.slice(i, s.indexOf('}, {passive:true});', i));
  assert.match(body, /document\.querySelector\('#plan-list\.plan-dragging'\)/);
  assert.ok(body.indexOf('#plan-list.plan-dragging') < body.indexOf('doPullRefresh()'), 'el chequeo va ANTES de disparar la actualizacion');
  assert.match(body, /pullActive = false/);
});

test('el arrastre marca la lista con plan-dragging al empezar y la limpia al terminar o cancelar', () => {
  const i = s.indexOf('function initPlanDrag(){');
  const body = s.slice(i, s.indexOf('function renderPlan(){', i));
  assert.match(body, /list\.classList\.add\('plan-dragging'\)/);
  assert.match(body, /list\.classList\.remove\('plan-dragging'\)/);
  assert.match(body, /addEventListener\('touchcancel', \(\) => reset\(\)\)/);
});
