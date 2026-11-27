// El respaldo semanal tiene que conocer TODAS las tablas. Cuando el GPS pasó a run_tracks, el respaldo siguió "OK" sin las rutas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bk = require('../scripts/backup-supabase.js');

const sqlDir = path.join(__dirname, '..', 'sql');

function tablasDelRepo() {
  const out = new Set();
  for (const f of fs.readdirSync(sqlDir).filter(n => n.endsWith('.sql'))) {
    const sql = fs.readFileSync(path.join(sqlDir, f), 'utf8').replace(/--.*$/gm, '');
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_]+)"?\s*\(/gi)) out.add(m[1].toLowerCase());
  }
  return [...out];
}

test('cada tabla creada en sql/ está en el respaldo, en las de tokens o excluida a propósito', () => {
  const conocidas = new Set([...bk.TABLES, ...bk.TOKEN_TABLES, ...bk.EXCLUDED_TABLES]);
  const halladas = tablasDelRepo();
  assert.ok(halladas.includes('run_tracks') && halladas.length > 8, 'el test encuentra las tablas del repo');
  assert.deepEqual(halladas.filter(t => !conocidas.has(t)), [], 'sumalas a scripts/backup-supabase.js');
});

test('las rutas GPS y el estado de la app son imprescindibles', () => {
  for (const t of ['app_state', 'run_tracks']) assert.ok(bk.TABLES.includes(t) && bk.ESSENTIAL_TABLES.includes(t), t);
});

test('run_tracks se pagina por su clave completa y trae todas las páginas', async () => {
  const pedidos = [];
  const real = global.fetch;
  global.fetch = async (url, opts) => {
    pedidos.push([String(url), opts.headers.Range]);
    const n = pedidos.length === 1 ? 1000 : 3;
    return { ok: true, status: 200, json: async () => Array.from({ length: n }, (_, i) => ({ run_id: i })) };
  };
  try {
    const rows = await bk.fetchAll('https://x.supabase.co', {}, 'run_tracks');
    assert.equal(rows.length, 1003);
    assert.match(pedidos[0][0], /run_tracks\?select=\*&order=user_id,run_id$/);
    assert.deepEqual(pedidos.map(p => p[1]), ['0-999', '1000-1999']);
  } finally { global.fetch = real; }
});
