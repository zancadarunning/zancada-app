// IA opcional (2026-11-26, pedido del dueño): al crear la cuenta la IA se puede dejar sin activar; hay un interruptor en Perfil; con la IA apagada Zonda no se usa, no sale
// ningún pedido y al tocarlo aparece una pantalla que explica qué hace, con un botón que lleva al interruptor. Además, a la IA ya no se le manda el nombre.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split(String.fromCharCode(13)).join('');
const PROFILE = { name: 'Xiomara Quiroga', level: 'intermediate', runnerType: 'active', trainBy: 'distance', units: 'metric', weeklyKm: 30, currentWeeklyKm: 25, daysPerWeek: 4, trainingDays: ['mon', 'wed', 'fri', 'sat'], goal: '10k', weight: 61, height: 166, birth: '1991-04-02', gender: 'f' };

function setup(ai) {
  const app = loadApp();
  const reg = new Map();
  const realGet = app.document.getElementById;
  app.document.getElementById = (id) => { if (!reg.has(id)) reg.set(id, realGet(id)); return reg.get(id); };
  const el = (id) => app.document.getElementById(id);
  const calls = [];
  app.fetch = (u, o) => { calls.push({ u: String(u), o }); return Promise.reject(new Error('red deshabilitada en los tests')); };
  app.setLangValue('es');
  app.state.onboarded = true;
  app.state.profile = Object.assign({}, PROFILE);
  app.state.weekNumber = 3;
  app.state.weekStart = app.getMondayISO(new Date());
  app.state.plan = app.generatePlan(app.state.profile, 3);
  app.state.runs = []; app.state.chat = []; app.state.painLog = []; app.state.shoes = [];
  app.state.consent = ai === undefined ? undefined : { v: 2, at: '2026-11-02T00:00:00Z', age16: true, health: true, ai, terms: true };
  return { app, el, calls };
}

test('la IA es opcional para entrar: con ai:false hay consentimiento; sin respuesta sobre la IA, no', () => {
  assert.equal(setup(false).app.hasConsent(), true);
  assert.equal(setup(true).app.hasConsent(), true);
  const { app } = setup(true);
  delete app.state.consent.ai;
  assert.equal(app.hasConsent(), false);
});

test('pantalla de consentimiento: con términos, salud y edad alcanza; la IA queda apagada si no se tilda', async () => {
  const { app, el } = setup();
  const p = app.ensureConsent();
  for (const k of ['terms', 'health', 'ai', 'age', 'all']) assert.ok(!el('consent-' + k).checked, k + ' arranca destildada');
  for (const k of ['terms', 'health', 'age']) el('consent-' + k).checked = true;
  app.updateConsentButton();
  assert.equal(el('consent-accept-btn').disabled, false, 'se puede continuar sin la IA');
  assert.equal(el('consent-all').checked, false);
  app.acceptConsent();
  assert.equal(await p, true);
  assert.equal(app.state.consent.ai, false);
  assert.equal(app.aiEnabled(), false);
});

test('aiEnabled: solo con ai === true', () => {
  assert.equal(setup().app.aiEnabled(), false);
  assert.equal(setup(false).app.aiEnabled(), false);
  const { app } = setup(true);
  assert.equal(app.aiEnabled(), true);
  app.state.consent.ai = 'true';
  assert.equal(app.aiEnabled(), false);
});

test('prender y apagar queda registrado con fecha, sin perder los otros consentimientos', async () => {
  const { app } = setup(false);
  await app.setAiEnabled(true);
  assert.equal(app.aiEnabled(), true);
  await app.setAiEnabled(false);
  const c = app.state.consent;
  assert.equal(c.ai, false);
  assert.deepEqual(JSON.parse(JSON.stringify(c.aiLog.map((x) => x.on))), [true, false]);
  assert.ok(!Number.isNaN(Date.parse(c.aiAt)));
  assert.equal(c.health, true); assert.equal(c.terms, true); assert.equal(c.age16, true);
  for (let i = 0; i < 30; i++) await app.setAiEnabled(i % 2 === 0);
  assert.ok(app.state.consent.aiLog.length <= 20, 'el registro tiene tope');
});

test('el interruptor de Perfil: prender pide confirmación (si se cancela queda apagado); apagar es directo', async () => {
  const { app, el } = setup(false);
  let asked = 0, answer = false;
  app.showConfirm = () => { asked++; return Promise.resolve(answer); };
  el('ai-toggle').checked = true;
  await app.handleAiToggle(true);
  assert.equal(asked, 1); assert.equal(app.aiEnabled(), false); assert.equal(el('ai-toggle').checked, false);
  answer = true;
  await app.handleAiToggle(true);
  assert.equal(app.aiEnabled(), true); assert.equal(el('ai-toggle').checked, true);
  await app.handleAiToggle(false);
  assert.equal(asked, 2, 'apagar no pregunta');
  assert.equal(app.aiEnabled(), false); assert.equal(el('ai-toggle').checked, false);
});

test('con la IA apagada, entrar a Zonda muestra la explicación y no abre el chat', async () => {
  const { app, el, calls } = setup(false);
  el('ai-off-modal').style.display = 'none';
  await app.showView('coach');
  assert.equal(el('ai-off-modal').style.display, 'block');
  assert.notEqual(app.document.documentElement.getAttribute('data-view'), 'coach');
  assert.equal(calls.filter((c) => c.u.includes('/api/chat')).length, 0);
});

test('con la IA apagada, enviar un mensaje no manda nada ni lo borra de la caja', async () => {
  const { app, el, calls } = setup(false);
  el('chatInput').value = 'hola Zonda';
  await app.sendChat();
  assert.equal(calls.length, 0);
  assert.equal(app.state.chat.length, 0);
  assert.equal(el('chatInput').value, 'hola Zonda');
  assert.equal(el('ai-off-modal').style.display, 'block');
});

test('con la IA apagada, los botones que le piden cambios a Zonda no descartan el aviso', () => {
  const { app } = setup(false);
  app.askZondaAdjustWeek();
  app.askZondaLowerLoad();
  assert.notEqual(app.state.adjustDismissed, app.state.weekStart);
  assert.notEqual(app.state.loadDismissed, app.state.weekStart);
});

test('con la IA apagada no se traducen con IA las sesiones que cambió Zonda', async () => {
  const { app, calls } = setup(false);
  app.state.plan[1] = Object.assign({}, app.state.plan[1], { custom: true, type: 'Rodaje suave', desc: 'x', textLang: 'es' });
  await app.translateCustomPlanTexts('en');
  assert.equal(calls.length, 0);
});

test('"Activar Zonda" cierra la explicación, va a Perfil y resalta el interruptor', async () => {
  const { app, el } = setup(false);
  const clases = new Set();
  el('perfil-ai-card').classList = { add: (c) => clases.add(c), remove: (c) => clases.delete(c), contains: (c) => clases.has(c), toggle: () => {} };
  let vista = null;
  app.showView = (v) => { vista = v; };
  app.openAiOffModal();
  app.openAiSettings();
  assert.equal(el('ai-off-modal').style.display, 'none');
  assert.equal(vista, 'perfil');
  assert.ok(clases.has('ai-highlight'));
});

test('a la IA no se le manda el nombre: ni en el contexto ni en las instrucciones', () => {
  const { app } = setup(true);
  const ctx = app.buildContext();
  assert.ok(!/Xiomara|Quiroga/.test(ctx), 'el contexto no trae el nombre');
  assert.ok(!/Xiomara|Quiroga/.test(app.buildCoachSystem(ctx)));
  assert.match(ctx, /Edad aprox: \d+\. Peso: 61kg\. Altura: 166cm/, 'el resto del perfil sigue yendo, bien escrito');
});

test('stripUserName: saca el nombre de las respuestas anteriores de Zonda sin romper otras palabras', () => {
  const { app } = setup(true);
  const s = app.stripUserName;
  assert.equal(s('Hola Xiomara Quiroga, soy Zonda.', 'Xiomara Quiroga'), 'Hola, soy Zonda.');
  assert.equal(s('¡Dale, Xiomara! Hoy toca rodaje.', 'Xiomara Quiroga'), '¡Dale! Hoy toca rodaje.');
  assert.equal(s('Xiomaraton no es un nombre.', 'Xiomara Quiroga'), 'Xiomaraton no es un nombre.');
  assert.equal(s('Corré al sol sin apuro.', 'Sol'), 'Corré al sol sin apuro.', 'distingue mayúsculas: la palabra común se queda');
  assert.equal(s('texto', ''), 'texto');
  assert.equal(s('A (B) c', '(B)'), 'A c', 'un nombre con signos no rompe la expresión');
});

test('el historial que se envía a la IA pasa por stripUserName en las respuestas de Zonda (lo que escribe la persona no se toca)', () => {
  const src = read('app.js');
  const i = src.indexOf('const CHAT_HISTORY_LIMIT');
  const tramo = src.slice(i, i + 1600);
  assert.match(tramo, /m\.role==='coach' \? stripUserName\(/);
});

test('pantallas y textos: interruptor en Perfil, explicación de Zonda y textos en los 6 idiomas, sin manejadores en línea', () => {
  const html = read('index.html');
  for (const id of ['perfil-ai-card', 'ai-toggle', 'ai-off-modal']) assert.ok(html.includes('id="' + id + '"'), id);
  const modal = html.slice(html.indexOf('id="ai-off-modal"'), html.indexOf('id="ai-off-modal"') + 2600);
  assert.match(modal, /data-on-click="openAiSettings\(\)"/);
  assert.match(modal, /data-on-click="closeAiOffModal\(\)"/);
  assert.ok(!/\sonclick=|\sonchange=/i.test(modal));
  const KEYS = ['perfil_ai_title', 'perfil_ai_desc', 'ai_status_on', 'ai_status_off', 'ai_confirm_on', 'ai_toast_on', 'ai_toast_off', 'ai_off_title', 'ai_off_intro', 'ai_off_cap1', 'ai_off_cap2', 'ai_off_cap3', 'ai_off_data', 'ai_off_medical', 'ai_off_activate', 'ai_off_later'];
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = read('locales/' + l + '.js');
    for (const k of KEYS) assert.ok(s.includes(k + ':"'), l + ' sin ' + k);
    for (const k of ['consent_ai', 'ai_off_data', 'ai_confirm_on']) assert.match(s.match(new RegExp(k + ':"((?:[^"\\\\]|\\\\.)*)"'))[1], /Anthropic/, l + ': ' + k + ' dice a quién se envían los datos');
  }
});
