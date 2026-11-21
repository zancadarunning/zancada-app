// Pantalla de suscripción y control de acceso de la app (ver "SUSCRIPCIÓN" en app.js). Apagado hasta el lanzamiento (PAYWALL_ENABLED = false): no cambia nada para nadie.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const app = read('app.js'), html = read('index.html');

test('apagado por defecto: sin PAYWALL_ENABLED no se consulta nada ni se muestra ninguna pantalla', async () => {
  assert.match(app, /const PAYWALL_ENABLED = false;/);
  const a = loadApp();
  let fetched = 0; const realFetch = global.fetch; global.fetch = async () => { fetched++; return { ok: true, json: async () => ({}) }; };
  try {
    a.state.profile = {};
    await a.checkPaywall(true);
    assert.equal(fetched, 0, 'no hace ningún pedido');
  } finally { global.fetch = realFetch; }
});

test('la pantalla de suscripción existe, no se cierra con el botón atrás (no es un overlay-sheet) y no usa código inline', () => {
  const m = html.match(/<div id="paywall"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  assert.ok(m, 'falta #paywall');
  assert.doesNotMatch(m[0], /class="overlay/, 'si fuera un overlay, el botón atrás de Android la cerraría');
  assert.doesNotMatch(m[0], /onclick=|onerror=|javascript:/i);
  assert.match(m[0], /data-on-click="restorePaywall\(\)"/, 'Restaurar compras (lo exige Apple y conviene en Play)');
  assert.match(m[0], /terms\.html/); assert.match(m[0], /privacy\.html/);
  assert.match(m[0], /data-on-click="confirmLogout\(\)"/, 'se puede cerrar sesión: nadie queda atrapado');
  assert.match(m[0], /paywall_legal/, 'texto de renovación automática y cómo cancelar');
});

test('el plan lo decide el servidor: la compra se confirma consultando api/entitlement, nunca por lo que diga el teléfono; y sin conexión no se bloquea a nadie', () => {
  const block = app.slice(app.indexOf('SUSCRIPCIÓN (cobro)'), app.indexOf('function renderRDRuta'));
  assert.match(block, /apiUrl\('\/api\/entitlement'\)/);
  assert.match(block, /if\(plan === null\) return;/, 'si no se pudo consultar, no se bloquea');
  assert.match(block, /await P\.purchasePackage\(\{aPackage: pkg\}\);\s*await waitForPlan\(\);/, 'después de comprar espera la confirmación del servidor');
  assert.match(block, /P\.logIn\(\{appUserID: userId\}\)/, 'el id de la cuenta es el usuario de RevenueCat');
  assert.doesNotMatch(block, /customerInfo\.entitlements|entitlements\.active/, 'no se confía en el estado local de la compra');
  assert.match(block, /isNativeApp\(\)/, 'solo en la app instalada');
});

test('cobro seguro: nunca se compra como anónimo, no se compra si ya hay plan, "ya comprado" no cobra de nuevo y una confirmación demorada llega sola', () => {
  const block = app.slice(app.indexOf('SUSCRIPCIÓN (cobro)'), app.indexOf('function renderRDRuta'));
  assert.match(block, /P\.getAppUserID\(\)/, 'se confirma quién quedó identificado en RevenueCat');
  assert.match(block, /billingUser = userId;/);
  assert.match(block, /if\(!P \|\| !\(await initBilling\(currentUserId\)\)\) throw/, 'la pantalla de planes exige usuario identificado');
  const buy = block.slice(block.indexOf('async function buyPaywallPlan'), block.indexOf('async function restorePaywall'));
  assert.ok(buy.indexOf('initBilling(currentUserId)') < buy.indexOf('purchasePackage'), 'primero se identifica, después se compra');
  assert.ok(buy.indexOf('const before = await fetchPlan()') < buy.indexOf('purchasePackage'), 'se mira el plan del servidor antes de cobrar');
  assert.match(buy, /PRODUCT_ALREADY_PURCHASED_ERROR[\s\S]*restorePurchases/, 'ya comprado: se sincroniza, no se vuelve a cobrar');
  assert.match(buy, /RECEIPT_ALREADY_IN_USE_ERROR[\s\S]*paywall_in_use/);
  assert.match(block, /function pollPlanLater\(\)/);
  assert.match(block, /setPaywallMsg\(t\('paywall_pending'\)\);\s*pollPlanLater\(\);/);
  assert.match(app, /await P\.logOut\(\); \}catch\(e\)\{\}\r?\n\s*billingUser = null;/, 'al cerrar sesión se olvida el usuario de cobro');
});

test('se revisa el plan al entrar, al volver a la app y cuando el servidor dice que falta; al cerrar sesión se cierra también la de RevenueCat', () => {
  assert.match(app, /try\{ checkPaywall\(true\); \}catch\(e\)\{\}/);
  assert.match(app, /visibilityState === 'visible'\)\{ try\{ checkPaywall\(false\); \}/);
  assert.match(app, /data\.error\.code === 'subscription_required' && PAYWALL_ENABLED && isNativeApp\(\)\)\{ try\{ checkPaywall\(true\); \}/);
  assert.match(app, /async function logout\(\)\{\r?\n\s*obClearDraft\(\);[^\n]*\r?\n\s*try\{ const P = purchasesPlugin\(\); if\(P && billingConfigured\) await P\.logOut\(\); \}catch\(e\)\{\}/);
});

test('los textos de la suscripción existen en los 6 idiomas y la leyenda legal menciona renovación automática, 24 horas y cómo cancelar', () => {
  const keys = ['paywall_kicker', 'paywall_title', 'paywall_sub', 'paywall_f1', 'paywall_f2', 'paywall_f3', 'paywall_f4', 'paywall_monthly', 'paywall_yearly', 'paywall_save', 'paywall_per_month', 'paywall_per_year', 'paywall_trial', 'paywall_legal', 'paywall_restore', 'paywall_unavailable', 'paywall_activating', 'paywall_welcome', 'paywall_pending', 'paywall_error', 'paywall_restore_none', 'paywall_in_use'];
  const I = {}; global.window = {};
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) new Function('window', read('locales/' + l + '.js'))(global.window);
  Object.assign(I, global.window.I18N);
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    for (const k of keys) assert.ok(I[l][k] && I[l][k].length > 1, l + ' ' + k);
    assert.match(I[l].paywall_legal, /24/, l + ': 24 horas');
    assert.match(I[l].paywall_legal, /Play Store/, l + ': dónde cancelar');
    assert.match(I[l].paywall_trial, /14/, l + ': prueba de 14 días');
  }
});

test('tarjeta "Tu suscripción": solo con plan pago activo (con vencimiento); el regalo no muestra botón de la tienda', () => {
  assert.match(html, /id="plan-card" style="display:none;"/);
  assert.match(html, /play\.google\.com\/store\/account\/subscriptions/);
  const a = loadApp();
  const card = { style: { display: 'none' } }, txt = { textContent: '' };
  const realGet = a.document.getElementById;
  a.document.getElementById = id => id === 'plan-card' ? card : id === 'plan-card-text' ? txt : realGet.call(a.document, id);
  try {
    a.renderPlanCard({ active: true, expiresAt: '2027-03-01T00:00:00Z' });
    assert.equal(card.style.display, '');
    assert.ok(txt.textContent.length > 5);
    a.renderPlanCard({ active: true, expiresAt: null });   // regalo
    assert.equal(card.style.display, 'none');
    a.renderPlanCard({ active: false, expiresAt: null });
    assert.equal(card.style.display, 'none');
  } finally { a.document.getElementById = realGet; }
});

test('borrar la cuenta avisa de la suscripción paga vigente en los 6 idiomas', () => {
  assert.match(app, /delete_account_sub_warning/);
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) assert.match(read('locales/' + l + '.js'), /delete_account_sub_warning:"/, l);
});

test('la pantalla de pago nunca tapa una carrera en curso y en la web no se muestra (no hay cobro ahí)', () => {
  const block = app.slice(app.indexOf('async function checkPaywall'), app.indexOf('function renderPlanCard'));
  assert.match(block, /getElementById\('runActive'\)[\s\S]*return;/, 'con una carrera en pantalla no se revisa el plan');
  assert.ok(block.indexOf('runActive') < block.indexOf('showPaywall()'), 'la revisión de la carrera va antes de mostrar la pantalla');
  assert.match(app, /subscription_required' && PAYWALL_ENABLED && isNativeApp\(\)/, 'en la web el 402 no abre una pantalla de pago imposible de pagar');
});

test('tarjeta "Mi suscripción": título propio (no el de los tramos), administra la suscripción de Zancada y lleva al historial de compras de Play, en los 6 idiomas', () => {
  const card = html.slice(html.indexOf('id="plan-card"'), html.indexOf('id="plan-card"') + 1200);
  assert.ok(card.includes('data-i18n="sub_card_title"'), 'el título ya no usa plan_title (que es "Tramos del entrenamiento")');
  assert.ok(!card.includes('data-i18n="plan_title"'));
  assert.ok(card.includes('https://play.google.com/store/account/subscriptions?package=org.zancada.app'));
  assert.ok(card.includes('https://play.google.com/store/account/orderhistory'));
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = read('locales/' + l + '.js');
    for (const k of ['sub_card_title', 'sub_card_note', 'sub_card_history', 'plan_manage']) assert.match(s, new RegExp(k + ':"[^"]+"'), l + ' ' + k);
  }
});
