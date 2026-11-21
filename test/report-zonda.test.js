// Botón "Reportar" en cada respuesta de Zonda (Google Play exige poder reportar contenido de IA sin salir de la app).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('cada respuesta de Zonda trae el botón Reportar (sin handlers inline) y el mensaje del usuario no', () => {
  assert.ok(app.includes("m.role==='coach' ? `<button type=\"button\" class=\"msg-report\" data-on-click=\"reportCoachMsg(${msgIdx})\">"));
  assert.ok(app.includes('const msgIdx = (allMsgs.length - msgs.length) + i;'));
  assert.ok(/\.msg-report\{/.test(html));
});

test('reportCoachMsg confirma, manda la respuesta y el mensaje anterior con kind:report, y avisa el resultado', () => {
  const fn = app.slice(app.indexOf('async function reportCoachMsg(idx){'), app.indexOf('// Aviso de que hay un mensaje del coach'));
  assert.ok(fn.includes("showConfirm(t('report_confirm')"));
  assert.ok(fn.includes("kind:'report'"));
  assert.ok(fn.includes("apiUrl('/api/send-feedback')"));
  assert.ok(fn.includes("showToast(t('report_sent'))") && fn.includes("showToast(t('report_error'),'error')"));
  assert.ok(fn.includes("role === 'user'"), 'incluye el mensaje anterior del usuario');
});

test('los textos del reporte existen en los 6 idiomas', () => {
  for (const l of ['es', 'en', 'pt', 'fr', 'it', 'de']) {
    const s = fs.readFileSync(path.join(root, 'locales', l + '.js'), 'utf8');
    for (const k of ['chat_report', 'report_confirm', 'report_send', 'report_sent', 'report_error'])
      assert.ok(new RegExp(k + ':"[^"]+"').test(s), l + ' ' + k);
  }
});
