// Reglas de la base de datos que NO pueden romperse sin darse cuenta. Si un test de acá falla es a propósito: agregaste una tabla, una función o una
// consulta nueva y falta la parte de seguridad (RLS, revocar permisos, borrado de la cuenta, segundo paso). Corregilo, o sumá la excepción con el motivo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const sqlDir = path.join(ROOT, 'sql');
const sqlFiles = fs.readdirSync(sqlDir).filter(f => f.endsWith('.sql'));
const strip = t => t.replace(/--.*$/gm, '');
const sql = Object.fromEntries(sqlFiles.map(f => [f, strip(fs.readFileSync(path.join(sqlDir, f), 'utf8'))]));
const allSql = Object.values(sql).join('\n');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Tablas que se crearon a mano en Supabase (no tienen CREATE TABLE en sql/) y guardan datos de personas.
const HAND_MADE_USER_TABLES = ['app_state', 'push_subscriptions', 'strava_connections'];
// Tablas que el navegador consulta directo con la sesión de la persona (`.from('...')` en app.js). Cada una necesita RLS por usuario.
const CLIENT_TABLES = ['app_state', 'push_subscriptions', 'strava_connections', 'polar_connections', 'wahoo_connections', 'coros_connections', 'suunto_connections'];

function createdTables() {
  const out = [];
  for (const [file, text] of Object.entries(sql)) {
    for (const m of text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(([\s\S]*?)\n\)\s*;/gi)) out.push({ file, name: m[1], body: m[2] });
  }
  return out;
}

test('toda tabla que se crea en sql/ activa RLS (si no, cualquiera con la clave pública podría leerla)', () => {
  const sinRls = createdTables().filter(t => !new RegExp(`alter\\s+table\\s+(only\\s+)?public\\.${t.name}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(allSql));
  assert.deepEqual(sinRls.map(t => `${t.file}: ${t.name}`), []);
});

test('toda función SECURITY DEFINER se revoca a anon/public (si no, cualquiera la llama desde /rpc con la clave pública)', () => {
  const sinRevoke = [];
  for (const [file, text] of Object.entries(sql)) {
    for (const part of text.split(/create\s+(?:or\s+replace\s+)?function\s+/i).slice(1)) {
      const name = (part.match(/^public\.(\w+)/i) || [])[1];
      if (!name || !/security\s+definer/i.test(part.split(/\$\$[\s\S]*?\$\$/)[0] + part.slice(0, 800))) continue;
      const revoked = new RegExp(`revoke\\s+(all|execute)\\s+on\\s+function\\s+public\\.${name}\\b[^;]*\\b(anon|public)\\b`, 'i').test(allSql);
      if (!revoked) sinRevoke.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(sinRevoke, []);
});

test('ninguna política deja una tabla abierta con using (true) / with check (true), salvo las listadas', () => {
  const ALLOWED = ['usernames_select_any'];   // la tabla social de nombres de usuario (función sin uso, ver sql/drop_unused_social.sql)
  const abiertas = [];
  for (const [file, text] of Object.entries(sql)) {
    for (const m of text.matchAll(/create\s+policy\s+"?(\w+)"?[^;]*?\b(?:using|with\s+check)\s*\(\s*true\s*\)/gi)) if (!ALLOWED.includes(m[1])) abiertas.push(`${file}: ${m[1]}`);
  }
  assert.deepEqual(abiertas, []);
});

test('toda tabla con datos de personas se borra al borrar la cuenta ("Borrar mis datos" y cuenta entera)', () => {
  const del = read('api/delete-account.js');
  const conUsuario = createdTables().filter(t => /\b(user_id|follower_id)\b/.test(t.body)).map(t => t.name);
  const faltan = [...new Set([...conUsuario, ...HAND_MADE_USER_TABLES])].filter(t => !del.includes(`'${t}'`));
  assert.deepEqual(faltan, [], 'agregá la tabla a la lista de delete-account.js');
});

test('las claves a auth.users sin ON DELETE CASCADE se vacían ANTES de borrar el usuario (si no, la base impide borrar la cuenta)', () => {
  const del = read('api/delete-account.js');
  const pre = (del.match(/for \(const table of \[([^\]]*)\]\) \{\s*\n\s*const pre/) || [])[1] || '';
  const sinCascada = createdTables().filter(t => /user_id[^,]*references\s+auth\.users\s*\(\s*id\s*\)(?![^,]*on\s+delete\s+cascade)/i.test(t.body)).map(t => t.name);
  for (const t of [...sinCascada, 'push_subscriptions', 'strava_connections']) assert.ok(pre.includes(`'${t}'`), `${t} apunta a auth.users sin cascada y delete-account.js no la vacía antes de borrar el usuario`);
  // y el arreglo definitivo en la base queda a mano para volver a correrlo
  const fix = sql['cascade_user_foreign_keys.sql'] || '';
  for (const t of ['push_subscriptions', 'strava_connections']) assert.match(fix, new RegExp(`alter\\s+table\\s+public\\.${t}[\\s\\S]*?on\\s+delete\\s+cascade`, 'i'));
});

test('el navegador solo consulta tablas conocidas, y cada una tiene reglas de acceso por usuario (RLS)', () => {
  const app = read('app.js');
  const usadas = [...new Set([...app.matchAll(/\.from\('([a-z_]+)'\)/g)].map(m => m[1]))];
  assert.deepEqual(usadas.filter(t => !CLIENT_TABLES.includes(t)), [], 'una tabla nueva consultada desde el navegador necesita RLS por usuario (auth.uid() = user_id) y agregarse a CLIENT_TABLES acá');
  // las tablas con sql/ propio activan RLS (lo verifica el primer test); las creadas a mano tienen su RLS en sql/user_data_rls.sql
  const rls = Object.values(sql).join('\n');
  for (const t of CLIENT_TABLES) assert.match(rls, new RegExp('alter\\s+table\\s+public\\.' + t + '\\s+enable\\s+row\\s+level\\s+security', 'i'), t + ' no activa RLS');
});

test('la verificación en dos pasos ya no existe: ni políticas mfa_required ni mfa_ok() en sql/ (solo el archivo que las quita)', () => {
  for (const [file, text] of Object.entries(sql)) {
    if (file === 'remove_mfa.sql') continue;
    assert.doesNotMatch(text, /mfa_required|mfa_ok/i, file);
  }
  assert.match(sql['remove_mfa.sql'] || '', /drop function if exists public\.mfa_ok\(\)/i);
});

test('la base deja sin permisos de tabla al rol anónimo (la app solo usa sesiones iniciadas)', () => {
  const f = sql['revoke_anon_table_privileges.sql'] || '';
  assert.match(f, /revoke\s+all\s+on\s+all\s+tables\s+in\s+schema\s+public\s+from\s+anon/i);
  assert.match(f, /revoke\s+truncate[\s\S]*?from\s+authenticated/i);
});
