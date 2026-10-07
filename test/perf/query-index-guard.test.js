// test/perf/query-index-guard.test.js
//
// "Búsquedas dirigidas, no leer toda la tabla": cada consulta que el servidor (api/*.js) le hace a Supabase filtrando por
// una columna tiene que tener un índice que la cubra (clave primaria o CREATE INDEX en sql/). Si alguien agrega una
// consulta nueva por una columna sin índice, este test falla ANTES de llegar a producción, donde se notaría recién cuando
// la tabla crezca (cada pedido leería la tabla entera).
//
// Las tablas que se crearon a mano en el panel de Supabase (y no tienen su CREATE TABLE en sql/) se declaran en
// CREADAS_FUERA_DE_SQL con la columna que se asume clave primaria: se comprueban con la consulta de control de
// sql/indexes.sql.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CREADAS_FUERA_DE_SQL = { app_state: ['user_id'], push_subscriptions: [], strava_connections: ['user_id'] };

function readAll(dir, ext) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return readAll(p, ext);
    return p.endsWith(ext) ? [{ file: path.relative(ROOT, p), text: fs.readFileSync(p, 'utf8') }] : [];
  });
}

// Qué (tabla, columna) está cubierta según sql/: claves primarias de un CREATE TABLE y CREATE INDEX.
function coveredByIndexes() {
  const covered = new Set();
  const sql = readAll(path.join(ROOT, 'sql'), '.sql').map(f => f.text).join('\n');
  // CREATE TABLE ... ( ... user_id uuid PRIMARY KEY ... )  /  PRIMARY KEY (a, b)
  for (const m of sql.matchAll(/create table(?: if not exists)?\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\)\s*;/gi)) {
    const table = m[1], body = m[2];
    for (const c of body.matchAll(/^\s*(\w+)\s+[^,\n]*primary key/gim)) covered.add(`${table}.${c[1]}`);
    for (const c of body.matchAll(/primary key\s*\(([^)]*)\)/gi)) covered.add(`${table}.${c[1].split(',')[0].trim()}`);
  }
  // CREATE INDEX ... ON tabla (col, ...)  y la forma por expresión ((data->>'calendarToken'))
  for (const m of sql.matchAll(/create (?:unique )?index(?: if not exists)?\s+\w+\s+on\s+(?:public\.)?(\w+)\s*(?:using \w+\s*)?\(\(?\s*([^)]*?)\)\)?\s*(?:;|where|$)/gim)) {
    const table = m[1];
    const first = m[2].split(',')[0].trim().replace(/['"]/g, '');
    covered.add(`${table}.${first.replace(/^\(/, '')}`);
  }
  // Los índices condicionales de sql/indexes.sql (dentro de un DO $$): CREATE INDEX nombre ON tabla (col)
  for (const m of sql.matchAll(/CREATE INDEX\s+\w+\s+ON\s+public\.(\w+)\s*\((\w+)\)/g)) covered.add(`${m[1]}.${m[2]}`);
  for (const [t, cols] of Object.entries(CREADAS_FUERA_DE_SQL)) cols.forEach(c => covered.add(`${t}.${c}`));
  return covered;
}

// Todas las búsquedas con filtro "=eq." del servidor: tabla + columna (o data->>campo).
function queriedColumns() {
  const out = [];
  for (const f of readAll(path.join(ROOT, 'api'), '.js')) {
    for (const m of f.text.matchAll(/rest\/v1\/(\w+)\?([^`'"\s]*)/g)) {
      const table = m[1];
      for (const c of m[2].matchAll(/(?:^|&)([\w>\-]+)=(?:eq|in)\./g)) {
        const col = c[1].replace(/^data->>/, "data->>").replace(/^data->>(\w+)$/, "(data->>$1)");
        out.push({ file: f.file, table, col: c[1] });
      }
    }
  }
  return out;
}

test('toda búsqueda del servidor por una columna tiene un índice que la cubra (no lee la tabla entera)', () => {
  const covered = coveredByIndexes();
  const missing = [];
  for (const q of queriedColumns()) {
    const key = `${q.table}.${q.col}`;
    const keyExpr = q.col.startsWith('data->>') ? `${q.table}.data->>${q.col.slice(7)}` : key;
    if (!covered.has(key) && !covered.has(keyExpr)) missing.push(`${q.file}: ${q.table} filtra por "${q.col}" sin índice`);
  }
  assert.deepEqual([...new Set(missing)], [], 'Agregá un CREATE INDEX en sql/indexes.sql para estas búsquedas');
});

test('el servidor no vuelve a pedir TODA la tabla app_state (cada fila trae el historial entero de un usuario)', () => {
  const offenders = [];
  for (const f of readAll(path.join(ROOT, 'api'), '.js')) {
    for (const m of f.text.matchAll(/rest\/v1\/app_state\?([^`'"\s]*)/g)) {
      const q = m[1];
      const filtered = /(^|&)(user_id|data->>\w+)=(eq|in)\./.test(q);
      if (!filtered) offenders.push(`${f.file}: app_state?${q.slice(0, 60)}`);
    }
  }
  assert.deepEqual(offenders, [], 'toda consulta a app_state tiene que filtrar por usuario (o por un índice)');
});
