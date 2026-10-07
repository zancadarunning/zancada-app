// loadtest/run.js
//
// Prueba de carga: levanta loadtest/server.js (los endpoints reales de api/ con una base simulada) y le pega con muchos
// pedidos en paralelo. Falla (exit 1) si hay errores o la latencia p95 supera el umbral, así un cambio que empeora el
// servidor se descubre acá y no con usuarios reales.
//
//   npm run loadtest                          (calendario, 50 en paralelo, 8 s)
//   node loadtest/run.js --concurrency 100 --seconds 15 --p95 250
//   node loadtest/run.js --no-index           (simula una búsqueda SIN índice sobre 20.000 filas: tiene que FALLAR)
//
// SEGURIDAD: este script solo le pega a su propio servidor local (127.0.0.1). No acepta una URL: así es imposible apuntarlo
// por error a zancada.org. Para probar un deploy de preview de Vercel, usar una herramienta externa contra esa URL
// (k6/autocannon) y nunca contra producción: ver loadtest/README.md.

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}
const CONCURRENCY = Number(arg('concurrency', 50));
const SECONDS = Number(arg('seconds', 8));
const P95_MS = Number(arg('p95', 250));
const NO_INDEX = process.argv.includes('--no-index');
const PORT = 4799;

function percentile(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0; }

async function main() {
  // 5000 us por 1.000 filas -> 20.000 filas = 100 ms de CPU por búsqueda sin índice
  const env = Object.assign({}, process.env, { PORT: String(PORT), DB_SCAN_COST_US: NO_INDEX ? '5000' : '0', TABLE_ROWS: '20000' });
  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY });
  const lat = []; let errors = 0, done = 0;
  const stopAt = Date.now() + SECONDS * 1000;
  const token = 'abcdefghij-0123456789';
  function hit() {
    return new Promise(resolve => {
      const t0 = process.hrtime.bigint();
      http.get({ host: '127.0.0.1', port: PORT, path: `/api/calendar-feed?t=${token}`, agent }, res => {
        res.resume();
        res.on('end', () => { lat.push(Number(process.hrtime.bigint() - t0) / 1e6); if (res.statusCode !== 200) errors++; done++; resolve(); });
      }).on('error', () => { errors++; done++; resolve(); });
    });
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (Date.now() < stopAt) await hit(); }));
  const stats = await new Promise(r => http.get({ host: '127.0.0.1', port: PORT, path: '/__stats' }, res => {
    let b = ''; res.on('data', d => { b += d; }); res.on('end', () => r(JSON.parse(b)));
  }));
  srv.kill();
  lat.sort((a, b) => a - b);
  const p50 = percentile(lat, 0.5), p95 = percentile(lat, 0.95), p99 = percentile(lat, 0.99);
  console.log(`pedidos: ${done}  (${(done / SECONDS).toFixed(0)}/s)  errores: ${errors}`);
  console.log(`latencia  p50 ${p50.toFixed(0)} ms | p95 ${p95.toFixed(0)} ms | p99 ${p99.toFixed(0)} ms   (umbral p95: ${P95_MS} ms)`);
  console.log(`base simulada: ${stats.dbCalls} consultas, ${stats.rowsScanned} filas leídas${NO_INDEX ? '  [modo SIN índice]' : ''}`);
  const fails = [];
  if (errors > 0) fails.push(`${errors} pedidos con error`);
  if (p95 > P95_MS) fails.push(`p95 ${p95.toFixed(0)} ms supera ${P95_MS} ms`);
  if (fails.length) { console.error('FALLÓ: ' + fails.join('; ')); process.exit(1); }
  console.log('OK');
}
main().catch(e => { console.error(e); process.exit(1); });
