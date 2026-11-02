// test/timezone-ahead-of-utc.test.js
//
// En husos adelantados a UTC (Europa, Asia, Oceanía: justo donde viven los usuarios de en/fr/it/de) la medianoche LOCAL cae todavía
// el día anterior en UTC. El gráfico diario de Historial (computeDailyTrend) armaba la fecha con toISOString().slice(0, 10) y quedaba corrido un día: no encontraba las carreras de hoy.
// El dueño vive en Argentina (UTC-3), donde ese error no se ve, así que el test corre en un proceso aparte con TZ de otra parte del mundo.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = `
  const { loadApp } = require(${JSON.stringify(path.join(__dirname, 'support', 'load-app'))});
  const app = loadApp();
  app.state.profile = { units: 'metric', createdAt: '2020-01-01' };
  app.state.runs = [{ id: 1, date: new Date().toISOString(), distanceKm: 5, durationSec: 1800, points: [] }];
  const trend = app.computeDailyTrend(3);
  const pad = n => String(n).padStart(2, '0');
  const n = new Date();
  const localToday = n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
  console.log(JSON.stringify({ last: trend[2], localToday }));
`;

for (const tz of ['Pacific/Auckland', 'Europe/Berlin', 'Asia/Kolkata', 'America/Argentina/Buenos_Aires', 'America/Los_Angeles']) {
  test(`gráfico diario con el huso ${tz}`, () => {
    const out = execFileSync(process.execPath, ['-e', SCRIPT], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    const r = JSON.parse(out.trim().split('\n').pop());
    assert.equal(r.last.date, r.localToday, 'el último día del gráfico es hoy (día local)');
    assert.equal(r.last.km, 5, 'la carrera de hoy cae en el último día del gráfico');
  });
}
