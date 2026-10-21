#!/usr/bin/env node
// Cifra los tokens de relojes que todavía están en texto plano en la base (o los vuelve a cifrar con una clave nueva).
//
// Uso:   node scripts/encrypt-existing-tokens.js [--dry-run] [--rotate]
//   --dry-run  no escribe nada: solo cuenta cuántos tokens faltan cifrar
//   --rotate   vuelve a cifrar también los que ya están cifrados (después de cambiar la clave: la vieja va en TOKEN_ENCRYPTION_KEY_PREVIOUS)
//
// Necesita en el entorno o en un archivo .env (que NO se sube a git): SUPABASE_URL, SUPABASE_SERVICE_KEY y TOKEN_ENCRYPTION_KEY
// (32 bytes en base64: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"; la MISMA que está en Vercel).
// Nunca imprime tokens, solo cantidades. Se puede correr varias veces: lo que ya está cifrado no se toca (salvo con --rotate).

const fs = require('fs');
const path = require('path');
const { encToken, decToken, isEncrypted, keyIsValid } = require('../api/_lib/token-crypto');

// Columnas con tokens de cada tabla (Polar no tiene refresh_token: sus tokens no vencen)
const TABLES = {
  strava_connections: ['access_token', 'refresh_token'],
  polar_connections: ['access_token'],
  wahoo_connections: ['access_token', 'refresh_token'],
  coros_connections: ['access_token', 'refresh_token'],
  suunto_connections: ['access_token', 'refresh_token']
};

function loadDotEnv() {
  const f = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(?:#.*)?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadDotEnv();
  const dryRun = process.argv.includes('--dry-run');
  const rotate = process.argv.includes('--rotate');
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!base || !key) { console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY (en el entorno o en .env).'); process.exit(1); }
  if (!process.env.TOKEN_ENCRYPTION_KEY) { console.error('Falta TOKEN_ENCRYPTION_KEY (la misma que está en Vercel).'); process.exit(1); }
  if (!keyIsValid()) { console.error('La clave de cifrado no es válida: tiene que ser de 32 bytes en base64 (unos 44 caracteres, termina casi siempre en =). Revisá que la hayas pegado completa, sin espacios.'); process.exit(1); }
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  let total = 0, changed = 0, failed = 0;
  for (const [table, COLUMNS] of Object.entries(TABLES)) {
    const res = await fetch(`${base}/rest/v1/${table}?select=user_id,${COLUMNS.join(',')}`, { headers });
    if (!res.ok) { console.error(`${table}: no se pudo leer (HTTP ${res.status})`); failed++; continue; }
    const rows = await res.json();
    let tableChanged = 0;
    for (const row of rows) {
      total++;
      const patch = {};
      try {
        for (const col of COLUMNS) {
          const value = row[col];
          if (!value) continue;
          if (isEncrypted(value) && !rotate) continue;
          const plain = decToken(value);            // con --rotate descifra con la clave vieja o la nueva
          patch[col] = encToken(plain);
        }
      } catch (e) { console.error(`${table}: una fila no se pudo descifrar (${e.message})`); failed++; continue; }
      if (!Object.keys(patch).length) continue;
      tableChanged++;
      if (dryRun) continue;
      const r = await fetch(`${base}/rest/v1/${table}?user_id=eq.${encodeURIComponent(row.user_id)}`, { method: 'PATCH', headers, body: JSON.stringify(patch) });
      if (!r.ok) { console.error(`${table}: no se pudo actualizar una fila (HTTP ${r.status})`); failed++; tableChanged--; }
    }
    changed += tableChanged;
    console.log(`${table}: ${rows.length} filas, ${tableChanged} ${dryRun ? 'por cifrar' : 'cifradas'}`);
  }
  console.log(`\nTotal: ${total} filas, ${changed} ${dryRun ? 'por cifrar (simulacro, no se escribió nada)' : 'actualizadas'}, ${failed} con error.`);
  if (failed) process.exit(2);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
