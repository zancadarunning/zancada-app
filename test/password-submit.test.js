// test/password-submit.test.js
//
// "Restablecer contraseña" (y "Cambiar contraseña" en el Perfil): el botón de guardar queda gris y sin poder tocarse hasta que la contraseña
// nueva cumple los 4 requisitos (8 caracteres, mayúscula, minúscula y número).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

// El documento falso de los tests devuelve un elemento nuevo en cada getElementById: acá se le da un registro para que el botón y el campo sean siempre los mismos.
function useRegistry(app) {
  const els = {};
  app.document.getElementById = id => els[id] || (els[id] = { id, value: '', textContent: '', innerHTML: '', disabled: false, dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } });
  return els;
}
function setup(inputId, btnId) {
  const app = loadApp();
  useRegistry(app);
  const input = app.document.getElementById(inputId);
  const btn = app.document.getElementById(btnId);
  const type = v => { input.value = v; app.renderPasswordChecklist(inputId); };
  return { app, input, btn, type };
}

for (const [inputId, btnId] of [['recovery-new-pw', 'recovery-submit-btn'], ['cp-new', 'cp-save-btn']]) {
  test(`${btnId}: gris hasta que se cumplen los 4 requisitos, y se habilita al cumplirlos`, () => {
    const { btn, type } = setup(inputId, btnId);
    type('');            assert.equal(btn.disabled, true, 'vacío');
    type('abc');         assert.equal(btn.disabled, true, 'corta');
    type('abcdefgh');    assert.equal(btn.disabled, true, 'sin mayúscula ni número');
    type('Abcdefgh');    assert.equal(btn.disabled, true, 'sin número');
    type('abcdefg1');    assert.equal(btn.disabled, true, 'sin mayúscula');
    type('ABCDEFG1');    assert.equal(btn.disabled, true, 'sin minúscula');
    type('Abcde1');      assert.equal(btn.disabled, true, 'menos de 8 caracteres');
    type('Abcdefg1');    assert.equal(btn.disabled, false, 'cumple los 4');
    type('Abcdefg');     assert.equal(btn.disabled, true, 'si vuelve a incumplir se vuelve a bloquear');
  });

  test(`${btnId}: después de "cargando" vuelve a depender de los requisitos`, () => {
    const { app, btn, type } = setup(inputId, btnId);
    type('Abcdefg1');
    assert.equal(btn.disabled, false);
    app.setBtnBusy(btnId, true, 'Guardando…');
    assert.equal(btn.disabled, true, 'ocupado');
    app.setBtnBusy(btnId, false);
    assert.equal(btn.disabled, false, 'cumple los requisitos: se habilita');
    type('abc');
    app.setBtnBusy(btnId, true, 'Guardando…');
    app.setBtnBusy(btnId, false);
    assert.equal(btn.disabled, true, 'no los cumple: queda gris aunque termine de cargar');
  });
}

test('otros botones no se tocan: setBtnBusy sigue habilitando un botón común al terminar', () => {
  const app = loadApp();
  useRegistry(app);
  const btn = app.document.getElementById('login-submit-btn');
  app.setBtnBusy('login-submit-btn', true, 'Cargando');
  assert.equal(btn.disabled, true);
  app.setBtnBusy('login-submit-btn', false);
  assert.equal(btn.disabled, false);
});
