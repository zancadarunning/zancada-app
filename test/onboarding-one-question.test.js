// Inicio para usuarios nuevos. Desde el 2026-11-11 son 7 pantallas que agrupan las 20 preguntas (antes una pregunta por pantalla; cambio aprobado por el dueño sobre una maqueta).
// Cada pregunta sigue siendo un bloque .ob-step con su data-step y sus ids de siempre: todos los campos que finishOnboard lee siguen existiendo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const app = read('app.js');
const block = html.slice(html.indexOf('<div class="overlay" id="onboard">'), html.indexOf('<header class="top" id="mainHeader"'));

test('hay 7 pantallas que agrupan las 20 preguntas sin perder ninguna; las de "ya corre" y la de notificaciones se ocultan cuando no aplican', () => {
  const pages = [...block.matchAll(/<div class="ob-page[^"]*" data-page="(\d+)">/g)].map(m => Number(m[1]));
  assert.deepEqual(pages, [1, 2, 3, 4, 5, 6, 7]);
  const steps = [...block.matchAll(/<div class="ob-step[^"]*" data-step="(\d+)"([^>]*)>/g)];
  assert.deepEqual(steps.map(m => Number(m[1])).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1), 'las 20 preguntas siguen estando, una sola vez');
  assert.deepEqual(steps.filter(m => /data-when="active"/.test(m[2])).map(m => Number(m[1])), [3, 4, 5]);
  assert.deepEqual(steps.filter(m => /data-when="notif"/.test(m[2])).map(m => Number(m[1])), [18]);
  // qué preguntas van en cada pantalla, en orden
  const byPage = {};
  for (let p = 1; p <= 7; p++) {
    const a = block.indexOf('data-page="' + p + '"'), b = p < 7 ? block.indexOf('data-page="' + (p + 1) + '"') : block.length;
    byPage[p] = [...block.slice(a, b).matchAll(/data-step="(\d+)"/g)].map(m => Number(m[1]));
  }
  assert.deepEqual(byPage, { 1: [1, 14], 2: [2, 3, 4, 5], 3: [9, 8, 7, 10], 4: [11, 12, 6], 5: [15, 13, 16], 6: [18, 19, 17], 7: [20] });
  assert.ok(!/<div class="ob-step active"/.test(block), 'lo que se activa es la pantalla, no el bloque');
  assert.match(block, /<div class="ob-page active" data-page="1">/);
});

test('cada campo que lee finishOnboard sigue en el inicio', () => {
  for (const id of ['ob-name', 'ob-runnertype', 'ob-currentkm', 'ob-returning', 'ob-refrace-dist', 'ob-refrace-min', 'ob-terrain', 'ob-trainby', 'ob-days', 'ob-availmin', 'ob-goal', 'ob-racedate', 'ob-birth', 'ob-weight', 'ob-height', 'ob-gender', 'ob-pregnancy', 'ob-healthnotes', 'ob-sports-selected', 'ob-sport-days', 'ob-referral']) {
    assert.ok(block.includes(`id="${id}"`), id);
  }
});

test('Continuar arranca deshabilitado en las pantallas con datos obligatorios (1: nombre y fecha de nacimiento; 5: peso y altura) y dice qué falta', () => {
  for (const id of ['ob-page-cta-1', 'ob-page-cta-5']) assert.match(block, new RegExp(`id="${id}"[^>]*disabled`), id);
  for (const id of ['ob-page-cta-2', 'ob-page-cta-3', 'ob-page-cta-4', 'ob-page-cta-6']) { assert.ok(block.includes(`id="${id}"`), id); assert.doesNotMatch(block, new RegExp(`id="${id}"[^>]*disabled`), id + ' no tiene nada obligatorio'); }
  assert.ok(block.includes('id="ob-page-reason-1"') && block.includes('id="ob-page-reason-5"'));
  assert.ok(app.includes("set(1, nameOk && birthOk, [nameOk ? null : t('why_item_name'), birthOk ? null : t('why_item_birth')].filter(Boolean));"));
  assert.ok(app.includes("set(OB_HEALTH_PAGE, weightOk && heightOk, [weightOk ? null : t('why_item_weight'), heightOk ? null : t('why_item_height')].filter(Boolean));"));
  assert.ok(app.includes('function updateObStep2ButtonState(){\n  updateObPageCtas();') || app.includes('function updateObStep2ButtonState(){\r\n  updateObPageCtas();'), 'se recalcula con cada tecla y al elegir la fecha');
  // los botones de cada bloque siguen existiendo (ocultos) con su lógica de siempre
  for (const id of ['ob-name-continue-btn', 'ob-birth-continue-btn', 'ob-step2-continue-btn']) assert.match(block, new RegExp(`id="${id}"[^>]*disabled`), id);
});

test('la navegación va de pantalla en pantalla; las preguntas que no aplican se ocultan dentro de su pantalla y la barra cuenta pantallas', () => {
  assert.match(app, /function obStepApplies\(el\)/);
  assert.match(app, /el\.dataset\.when === 'active'/);
  assert.ok(app.includes('obStepEls().forEach(el => { el.hidden = !obStepApplies(el); });'));
  assert.ok(app.includes("obPageEls().forEach(el=>el.classList.toggle('active', parseInt(el.dataset.page,10)===n));"));
  assert.ok(app.includes('if(obCurrentStep < total) obGotoStep(obCurrentStep + 1);') && app.includes('if(obCurrentStep > 1) obGotoStep(obCurrentStep - 1);'));
  assert.ok(app.includes("if(c) c.textContent = pos + '/' + total;"));
  assert.ok(app.includes("ob.addEventListener('click', () => setTimeout(() => { try{ obRefreshBlocks(); updateObStep2ButtonState(); }catch(e){} }, 0));"), 'al elegir "Ya corro" aparecen sus preguntas sin cambiar de pantalla');
  assert.match(html, /#onboard \.ob-page \.ob-step\[hidden\]\{display:none;\}/);
});

test('"¿Cómo conociste Zancada?" se guarda en el perfil solo con valores de la lista, y no hay "Cerrar sesión" arriba del inicio', () => {
  assert.match(app, /const referral = document\.querySelector\('#ob-referral \.choice\.active'\)\?\.dataset\.v \|\| null;/);
  assert.match(app, /state\.profile = \{email:pendingEmail, name, weight, height, birth, gender, referral,/);
  const refBlock = block.slice(block.indexOf('id="ob-referral"'), block.indexOf('data-page="7"'));
  const options = [...refBlock.matchAll(/<div class="choice" data-v="([a-z]+)">(<svg.*?<\/svg>)+<span/g)].map(m => m[1]);
  assert.deepEqual(options, ['instagram', 'tiktok', 'youtube', 'google', 'facebook', 'appstore', 'playstore', 'friend', 'ai', 'other'], 'App Store y Play Store separadas, sin Reddit ni X, cada opción con su logo');
  assert.ok(!/reddit/i.test(block + app), 'Reddit ya no se ofrece');
  assert.ok(!/<div class="choice" data-v="x">/.test(refBlock), 'X ya no se ofrece como red');
  assert.ok(!block.includes('confirmLogout'), 'sin cerrar sesión en el inicio');
});

test('el inicio tiene estilos para los dos temas; los textos están en los 6 idiomas', () => {
  assert.ok(html.includes('id="ob-glass-css"'));
  assert.match(html, /:root\[data-theme="light"\] #onboard/);
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = read('locales/' + l + '.js');
    for (const k of ['ob_q_name', 'ob_q_body', 'ob_q_referral', 'ob_ref_friend', 'ob_ref_ai', 'ob_ref_other', 'ob_skip', 'ob_done_title', 'ob_done_lead']) assert.ok(s.includes(k + ':'), l + ' ' + k);
  }
});

test('el plan habla de "fecha objetivo", no de "fecha de carrera", en pantalla y en los mensajes del coach', () => {
  const expected = { es: 'Fecha objetivo (opcional)', en: 'Target date (optional)', pt: 'Data objetivo (opcional)', fr: 'Date objectif (facultatif)', it: 'Data obiettivo (opzionale)', de: 'Zieldatum (optional)' };
  for (const [l, text] of Object.entries(expected)) {
    const s = read('locales/' + l + '.js');
    assert.ok(s.includes(`ob_racedate_label:"${text}"`), l);
    assert.ok(!/ob_racedate_label:"[^"]*(race date|carrera|prova|course|gara|Rennen)/i.test(s), l + ' sin "carrera"');
  }
  assert.ok(!/perfil_weeklykm_auto_note:"[^"]*fecha de carrera/.test(read('locales/es.js')));
  assert.match(app, /changes\.push\('fecha objetivo'\)/);
  assert.match(app, /La fecha objetivo "\$\{input\.fecha_carrera\}" no es válida/);
});

test('antes de "Todo listo" el inicio ofrece, en una misma pantalla, activar las notificaciones y conectar el reloj; ya no hay pestañas sueltas después de crear la cuenta ni "Traé tu historial"', () => {
  assert.ok(!html.includes('history-import-overlay') && !html.includes('connect-watch-overlay') && !html.includes('notif-prompt-overlay'));
  assert.ok(!/hist_import_(title|lead)/.test(html + app));
  assert.ok(!/maybeOpenNotifPrompt|maybeOpenConnectWatch|openConnectWatch/.test(app), 'sin avisos después de crear la cuenta');
  const at = n => block.indexOf(`data-step="${n}"`);
  assert.ok(at(18) < at(19) && at(19) < at(17) && at(17) < at(20), 'orden: notificaciones, reloj, referencia, listo');
  const connect = block.slice(at(19), at(17));
  for (const brand of ['garmin', 'suunto', 'wahoo', 'coros', 'polar', 'healthconnect']) assert.ok(connect.includes(`data-conn="${brand}"`), brand);
  assert.ok(!connect.includes('connectStrava'), 'Strava ya no se ofrece acá');
  assert.ok(connect.split('obSaveDraft(); connect').length - 1 === 6, 'cada fila guarda las respuestas antes de salir a la página de la marca');
  assert.ok(app.includes('row.disabled = on'));
  assert.ok(app.includes('state.historyImportPrompted = true; state.notifPrompted = true;'), 'al terminar no se vuelve a ofrecer');
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = read('locales/' + l + '.js');
    for (const k of ['conn_title', 'conn_lead', 'conn_section', 'conn_connect', 'conn_continue', 'conn_skip', 'notif_prompt_title', 'notif_prompt_lead', 'notif_prompt_r1', 'notif_prompt_r2', 'notif_prompt_enable', 'notif_prompt_skip']) assert.ok(s.includes(k + ':'), l + ' ' + k);
    assert.ok(!s.includes('hist_import_title:'), l);
  }
});

test('notificaciones en el inicio: se pide el permiso sin doble cartel, el bloque se oculta si no hay nada que pedir, y al terminar se sigue en la misma pantalla', () => {
  assert.ok(app.includes('enablePushNotifications({skipSoftAsk:true})'));
  assert.ok(app.includes('async function enablePushNotifications(opts)'));
  assert.ok(app.includes("Notification.permission === 'default' && !(opts && opts.skipSoftAsk)"));
  const fn = app.slice(app.indexOf('async function obCheckNotifNeeded()'), app.indexOf('async function acceptNotifPrompt()'));
  assert.ok(fn.includes("Notification.permission === 'default'"), 'si ya está concedido o bloqueado no se pide');
  assert.ok(app.includes("if(el.dataset.when === 'notif') return obNotifNeeded;"));
  assert.ok(app.includes('await obCheckNotifNeeded(); }'), 'al aceptar o rechazar no se salta de pantalla: quedan el reloj y la referencia');
  assert.ok(!app.includes('await obCheckNotifNeeded(); obNextStep(); }'));
  assert.ok(app.includes('obNotifNeeded = needs;\n  obRefreshBlocks();') || app.includes('obNotifNeeded = needs;\r\n  obRefreshBlocks();'), 'el bloque desaparece cuando ya no hace falta');
  assert.match(block, /<button class="btn btn-outline" id="np-enable-btn"/, 'activar es una acción secundaria: el lima queda para Continuar');
});

test('conectar un reloj sale a la página de la marca: las respuestas se guardan en sessionStorage (solo esta cuenta y esta pestaña) y se retoma en la misma pantalla', () => {
  assert.ok(app.includes('sessionStorage.setItem(key, JSON.stringify(obCollectDraft()))'));
  assert.ok(app.includes("OB_DRAFT_PREFIX + currentUserId"), 'solo la misma cuenta: el id va en la clave, no en el valor (CodeQL: clear-text-storage)');
  assert.ok(!/uid: *currentUserId/.test(app.slice(app.indexOf('function obCollectDraft'), app.indexOf('function obSaveDraft'))), 'el id de la sesión no se guarda dentro del borrador');
  assert.ok(app.includes('k.indexOf(OB_DRAFT_PREFIX) === 0'), 'al borrar se limpian todos los borradores');
  assert.ok(app.includes('if(obRestoreDraft()) obRefreshConnections()'), 'al volver, se retoma y se actualiza lo conectado');
  assert.ok(app.includes('.test(s)') && app.includes('{1,30}'), 'los deportes restaurados se validan (se usan para armar HTML)');
  assert.ok(app.includes('obClearDraft();\n  enterApp();') || app.includes('obClearDraft();\r\n  enterApp();'), 'al terminar se borra');
  assert.ok(app.includes('async function logout(){\n  obClearDraft();') || app.includes('async function logout(){\r\n  obClearDraft();'), 'al cerrar sesión también');
});

test('el botón principal del inicio no pierde su estilo: los selectores compartidos con la pantalla de consentimientos llevan el mismo estado/pseudo-elemento en cada parte', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').split(String.fromCharCode(13)).join('');
  // un reemplazo mal hecho dejó "#onboard .ob-cta, #consent-modal .ob-cta:disabled{opacity:.34}": el botón de TODO el inicio quedaba casi transparente (y el ::before, pegado arriba)
  assert.ok(!/#onboard \.ob-cta, #consent-modal \.ob-cta[:]/.test(css), 'cada parte del selector lleva su pseudo/estado');
  for (const tail of ['::before', ':active:not(:disabled)', ':disabled']) {
    assert.ok(css.includes('#onboard .ob-cta' + tail + ', #consent-modal .ob-cta' + tail + '{'), tail);
  }
});

test('sin efecto vidrio (pedido del usuario, 2026-11-02): superficies planas, sin desenfoque, sin luces de colores ni brillos de borde', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').split(String.fromCharCode(13)).join('');
  const glass = css.slice(css.indexOf('<style id="ob-glass-css">'), css.indexOf('</style>', css.indexOf('<style id="ob-glass-css">')));
  assert.ok(glass.length > 1000, 'el bloque de estilos del inicio sigue');
  assert.ok(!/backdrop-filter/.test(glass), 'sin desenfoque de fondo');
  assert.ok(!glass.includes('--g-blur'), 'sin variable de desenfoque');
  assert.ok(!glass.includes('radial-gradient('), 'sin luces de colores detrás');
  assert.ok(!glass.includes('linear-gradient(158deg'), 'sin relleno en diagonal');
  assert.ok(!/--g-rim:[^;]*inset [0-9.]+px [0-9.]+px/.test(glass), 'sin brillo de borde arriba-izquierda / abajo-derecha');
  assert.ok(glass.includes('--g-fill:var(--asphalt-2)'), 'tarjetas sólidas del sistema de diseño');
  assert.ok(!css.includes('--lq-edge') && !css.includes('--lq-surface'), 'la barra de abajo y los diálogos volvieron a su estilo anterior');
});

test('el borrador del inicio (sessionStorage) no guarda datos de salud sensibles: ni molestias/lesiones ni embarazo/posparto', () => {
  const a = app.indexOf('function obCollectDraft');
  const b = app.indexOf('function obClearDraft');
  const draft = app.slice(a, b);
  assert.ok(draft.length > 200);
  assert.ok(!draft.includes('ob-healthnotes') && !draft.includes('ob-pregnancy') && !/pregnancy|health:/.test(draft.replace(/\/\/.*$/gm, '')), 'ni se guardan ni se restauran');
  const restore = app.slice(app.indexOf('function obRestoreDraft'), app.indexOf('async function obCheckNotifNeeded'));
  assert.ok(!restore.includes("setVal('ob-healthnotes'") && !restore.includes("setChoice('#ob-pregnancy'"), 'no se restauran');
});
