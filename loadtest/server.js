// loadtest/server.js
//
// Servidor LOCAL que expone los endpoints de api/ (los mismos archivos que corren en Vercel) con una base de datos simulada
// en memoria. Sirve para medir cómo se comporta el servidor bajo carga SIN tocar producción, Supabase ni servicios de
// terceros. Lo usa loadtest/run.js; también se puede levantar a mano: node loadtest/server.js
//
// La base simulada tarda DB_LATENCY_MS por consulta (por defecto 15 ms, parecido a Supabase desde Vercel) y devuelve filas.
// Con DB_SCAN_COST_US > 0 simula una búsqueda SIN índice: cuesta CPU proporcional al tamaño de la tabla (así se ve la
// diferencia entre leer la tabla entera y una búsqueda dirigida).

const http = require('http');
const path = require('path');

const PORT = Number(process.env.PORT || 4799);
const DB_LATENCY_MS = Number(process.env.DB_LATENCY_MS || 15);
const TABLE_ROWS = Number(process.env.TABLE_ROWS || 20000);
const DB_SCAN_COST_US = Number(process.env.DB_SCAN_COST_US || 0); // microsegundos por 1.000 filas leídas (0 = con índice)

process.env.SUPABASE_URL = 'https://mock.supabase.test';
process.env.SUPABASE_SERVICE_KEY = 'mock-key';
process.env.CRON_SECRET = 'mock-cron-secret';

const plan = Array.from({ length: 7 }, (_, i) => ({ day: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][i], typeKey: 'easy', dist: i % 2 ? 0 : 6, terrain: 'asfalto' }));
const stats = { dbCalls: 0, rowsScanned: 0 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

global.fetch = async (url) => {
  url = String(url);
  stats.dbCalls++;
  await sleep(DB_LATENCY_MS);
  if (url.includes('/rest/v1/app_state')) {
    // sin índice: la base lee todas las filas para encontrar la del token (consume CPU del servidor de la base)
    const scanned = DB_SCAN_COST_US > 0 ? TABLE_ROWS : 1;
    stats.rowsScanned += scanned;
    if (DB_SCAN_COST_US > 0) {
      const busyMs = (DB_SCAN_COST_US * scanned) / 1000 / 1000;
      const t = process.hrtime.bigint();
      while (Number(process.hrtime.bigint() - t) / 1e6 < busyMs) { /* ocupa CPU como un scan */ }
    }
    const rows = [{ plan, weekStart: new Date().toISOString().slice(0, 10), nextWeek: null, lang: 'es', profile: { name: 'Mock' } }];
    return { ok: true, status: 200, json: async () => rows, text: async () => '' };
  }
  return { ok: true, status: 200, json: async () => [], text: async () => '' };
};

const ROUTES = { '/api/calendar-feed': () => require(path.join(__dirname, '..', 'api', 'calendar-feed.js')) };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/__stats') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(stats)); }
  const load = ROUTES[u.pathname];
  if (!load) { res.statusCode = 404; return res.end('not found'); }
  req.query = Object.fromEntries(u.searchParams);
  res.status = c => { res.statusCode = c; return res; };
  res.json = b => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)); return res; };
  res.send = b => { res.end(b); return res; };
  try { await load()(req, res); } catch (e) { res.statusCode = 500; res.end('error ' + e.message); }
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => console.log(`loadtest server en http://127.0.0.1:${PORT} (db ${DB_LATENCY_MS} ms, scan ${DB_SCAN_COST_US} us/1000 filas)`));
}
module.exports = { server, stats };
