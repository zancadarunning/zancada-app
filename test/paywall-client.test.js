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

test('se revisa el plan al entrar, al volver a la app y cuando el servidor dice que falta; al cerrar sesión se cierra también la de RevenueCat', () => {
  assert.match(app, /try\{ checkPaywall\(true\); \}catch\(e\)\{\}/);
  assert.match(app, /visibilityState === 'visible'\)\{ try\{ checkPaywall\(false\); \}/);
  assert.match(app, /data\.error\.code === 'subscription_required'\)\{ try\{ showPaywall\(\); \}/);
  assert.match(app, /async function logout\(\)\{\r?\n\s*obClearDraft\(\);[^\n]*\r?\n\s*try\{ const P = purchasesPlugin\(\); if\(P && billingConfigured\) await P\.logOut\(\); \}catch\(e\)\{\}/);
});

test('los textos de la suscripción existen en los 6 idiomas y la leyenda legal menciona renovación automática, 24 horas y cómo cancelar', () => {
  const keys = ['paywall_kicker', 'paywall_title', 'paywall_sub', 'paywall_f1', 'paywall_f2', 'paywall_f3', 'paywall_f4', 'paywall_monthly', 'paywall_yearly', 'paywall_save', 'paywall_per_month', 'paywall_per_year', 'paywall_trial', 'paywall_legal', 'paywall_restore', 'paywall_unavailable', 'paywall_activating', 'paywall_welcome', 'paywall_pending', 'paywall_error', 'paywall_restore_none'];
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
