// Sentry no debe recibir tokens ni query strings (token del calendario, access_token de Strava) ni diagnósticos con datos de entrenamientos.
const test = require('node:test');
const assert = require('node:assert/strict');
const { scrubBreadcrumb, scrubEvent, reportDiagnostic } = require('../api/_lib/sentry.js');

test('los breadcrumbs HTTP pierden la query string', () => {
  const b = scrubBreadcrumb({ category: 'http', data: { url: 'https://x.supabase.co/rest/v1/app_state?data->>calendarToken=eq.SECRETO&select=*', 'http.query': 'data->>calendarToken=eq.SECRETO', method: 'GET' } });
  assert.equal(b.data.url, 'https://x.supabase.co/rest/v1/app_state');
  assert.equal(b.data['http.query'], undefined);
  assert.equal(b.data.method, 'GET');
});

test('el evento no lleva query_string, cookies, Authorization ni cuerpo del pedido', () => {
  const e = scrubEvent({ request: { url: 'https://zancada.org/api/calendar-feed?token=SECRETO', query_string: 'token=SECRETO', cookies: { a: 'b' }, headers: { authorization: 'Bearer abc', 'user-agent': 'x' }, data: { token: 'SECRETO' } },
    breadcrumbs: [{ data: { url: 'https://a.b/c?access_token=SECRETO' } }] });
  assert.equal(e.request.url, 'https://zancada.org/api/calendar-feed');
  assert.equal(e.request.query_string, undefined);
  assert.equal(e.request.headers.authorization, undefined);
  assert.equal(e.request.data, undefined);
  assert.equal(e.breadcrumbs[0].data.url, 'https://a.b/c');
  assert.ok(!JSON.stringify(e).includes('SECRETO'));
});

test('reportDiagnostic no envía nada si SENTRY_DIAGNOSTICS no está en 1', async () => {
  delete process.env.SENTRY_DIAGNOSTICS;
  const r = await reportDiagnostic('diag', { dist: 8000 });
  assert.equal(r, undefined);
});
