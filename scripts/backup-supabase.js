#!/usr/bin/env node
// Exporta los datos de Supabase a archivos JSON locales (el plan gratuito no trae backups automáticos).
//
// Uso:   node scripts/backup-supabase.js [carpeta-destino] [--with-tokens]
// Necesita las variables SUPABASE_URL y SUPABASE_SERVICE_KEY (las mismas que usa Vercel) en el entorno o en un archivo .env.
//
// Por defecto NO exporta las tablas de conexiones con relojes (guardan tokens de acceso de cada persona): si hay que restaurar,
// cada persona vuelve a conectar su reloj. Con --with-tokens se incluyen. El destino por defecto queda FUERA de OneDrive y del repo.
// Los archivos contienen datos personales (salud, GPS, mails): guardalos como un secreto.

const fs = require('fs');
const path = require('path');
const os = require('os');

const TABLES = [
  'app_state', 'push_subscriptions',
  'chat_usage', 'sent_notifications', 'sync_cooldowns'
];
const TOKEN_TABLES = ['strava_connections', 'polar_connections', 'wahoo_connections', 'coros_connections', 'suunto_connections'];
const PAGE = 1000;

function loadDotEnv() {
  const f = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(?:#.*)?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function fetchAll(base, headers, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${base}/rest/v1/${table}?select=*`, { headers: { ...headers, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' } });
    if (res.status === 404) return null;   // la tabla no existe en esta base
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function fetchUsers(base, headers) {
  const out = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=${PAGE}`, { headers });
    if (!res.ok) throw new Error(`auth users: HTTP ${res.status}`);
    const body = await res.json();
    const list = body.users || [];
    // solo lo necesario para reconstruir cuentas: las contraseñas (hash) no se exportan
    out.push(...list.map(u => ({ id: u.id, email: u.email, created_at: u.created_at, email_confirmed_at: u.email_confirmed_at, last_sign_in_at: u.last_sign_in_at, providers: (u.app_metadata && u.app_metadata.providers) || [] })));
    if (list.length < PAGE) return out;
  }
}

async function main() {
  loadDotEnv();
  const args = process.argv.slice(2);
  const withTokens = args.includes('--with-tokens');
  const dirArg = args.find(a => !a.startsWith('--'));
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!base || !key) { console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY (en el entorno o en .env).'); process.exit(1); }

  const stamp = new Date().toISOString().slice(0, 10);
  const dir = dirArg || path.join(os.homedir(), 'Backups', 'zancada', `supabase-${stamp}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });   // el respaldo tiene datos personales: solo para el dueño
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const summary = {};
  const failed = [];
  for (const table of [...TABLES, ...(withTokens ? TOKEN_TABLES : [])]) {
    try {
      const rows = await fetchAll(base, headers, table);
      if (rows === null) { summary[table] = 'no existe'; continue; }
      fs.writeFileSync(path.join(dir, `${table}.json`), JSON.stringify(rows), { mode: 0o600 });
      summary[table] = rows.length;
    } catch (e) { failed.push(table); summary[table] = 'ERROR'; console.error(e.message); }
  }
  try {
    const users = await fetchUsers(base, headers);
    fs.writeFileSync(path.join(dir, 'auth_users.json'), JSON.stringify(users), { mode: 0o600 });
    summary.auth_users = users.length;
  } catch (e) { failed.push('auth_users'); summary.auth_users = 'ERROR'; console.error(e.message); }

  console.log(`Destino: ${dir}`);
  console.table(summary);
  if (failed.length) { console.error('Fallaron:', failed.join(', ')); process.exit(2); }
  console.log('Listo. Estos archivos tienen datos personales: no los subas a GitHub ni a un lugar público.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
