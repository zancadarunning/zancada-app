// api/delete-account.js
//
// Borra la cuenta de un usuario por completo: sus datos en la base y, al
// final, su usuario de autenticación en Supabase. Sigue el mismo estilo que
// tus otros endpoints (fetch directo a la REST API de Supabase, sin
// librerías extra como @supabase/supabase-js).
//
// Usa las mismas variables de entorno que ya tenés configuradas para
// strava-auth.js:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  // Verificamos el token contra Supabase Auth para saber con certeza qué
  // usuario está pidiendo el borrado (nunca confiamos en un user_id que
  // venga del cliente).
  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

    // Antes de borrar cada conexión, le avisamos al proveedor que revoque el
    // permiso -- si no, la autorización queda activa de su lado aunque acá
    // ya no quede rastro de ella (esto un rato NO lo hacíamos para Polar y
    // Wahoo, solo para Strava; quedaba el mismo problema para los otros dos
    // relojes, solo que nadie lo había notado todavía).
    // Helper para las 4 lecturas de conexión de abajo: si Supabase devuelve un error
    // transitorio (rate limit, timeout), el body es un objeto {code,message}, no un
    // array -- connRows[0] en ese objeto da undefined, así que accessToken queda falsy
    // y la revocación se salteaba en silencio, sin loguear nada (el try/catch de
    // alrededor nunca se disparaba porque nada tiraba excepción). Mismo chequeo
    // response.ok que ya usa send-reminders.js para este mismo problema.
    async function readConnection(table, select) {
      const connRes = await fetch(`${base}/rest/v1/${table}?user_id=eq.${userId}&select=${select}`, { headers });
      if (!connRes.ok) {
        console.error(`delete-account: ${table} fetch failed`, connRes.status, await connRes.text().catch(() => ''));
        return null;
      }
      const rows = await connRes.json();
      return (Array.isArray(rows) && rows[0]) || null;
    }

    try {
      const conn = await readConnection('strava_connections', 'access_token');
      if (conn && conn.access_token) {
        await fetch(`https://www.strava.com/oauth/deauthorize?access_token=${encodeURIComponent(conn.access_token)}`, { method: 'POST' });
      }
    } catch (e) { console.error('delete-account: strava revoke failed', e); }

    try {
      const conn = await readConnection('polar_connections', 'access_token,polar_user_id');
      if (conn && conn.access_token) {
        await fetch(`https://www.polaraccesslink.com/v3/users/${conn.polar_user_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${conn.access_token}` }
        });
      }
    } catch (e) { console.error('delete-account: polar revoke failed', e); }

    try {
      const conn = await readConnection('wahoo_connections', 'access_token');
      if (conn && conn.access_token) {
        await fetch('https://api.wahooligan.com/v1/permissions', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${conn.access_token}` }
        });
      }
    } catch (e) { console.error('delete-account: wahoo revoke failed', e); }

    // COROS se sumó después de que se hiciera este mismo arreglo para Polar/Wahoo (ver el
    // comentario de arriba) y quedó afuera -- mismo problema: sin este bloque, el borrado
    // de cuenta borraba coros_connections de nuestra base (por el ON DELETE CASCADE hacia
    // auth.users) pero nunca le avisaba a COROS, así que el permiso de Zancada seguía
    // apareciendo activo del lado de la cuenta de COROS del usuario para siempre.
    try {
      const conn = await readConnection('coros_connections', 'access_token');
      if (conn && conn.access_token) {
        await fetch('https://mcpus.coros.com/oauth2/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: conn.access_token, client_id: process.env.COROS_CLIENT_ID })
        });
      }
    } catch (e) { console.error('delete-account: coros revoke failed', e); }

    // Borramos el usuario de autenticación ANTES que los datos de la app -- a
    // propósito, en este orden y no al revés. Antes se borraban primero
    // app_state/push_subscriptions/strava_connections/chat_usage y recién al final
    // se intentaba borrar el usuario de auth: si ese último paso fallaba (un timeout,
    // un rate limit del admin API, o dos taps seguidos al botón de borrar cuenta
    // disparando dos pedidos en paralelo), la cuenta seguía existiendo y el usuario
    // podía volver a entrar -- pero ya con todos sus datos borrados para siempre, sin
    // ningún aviso de que eso había pasado. Ahora, si este borrado falla, no se tocó
    // ninguna fila de datos todavía: el usuario puede simplemente reintentar.
    //
    // Este es también el paso que de verdad limpia la base: strava_connections/
    // polar_connections/wahoo_connections/coros_connections y las tablas sociales
    // (usernames/follows/run_feed/run_likes) tienen su user_id con ON DELETE CASCADE
    // hacia auth.users (ver sql/create_polar_connections.sql, sql/create_wahoo_connections.sql,
    // sql/create_coros_connections.sql, sql/social.sql), así que este DELETE las limpia
    // solas. app_state/push_subscriptions/strava_connections se crearon a mano (no
    // versionadas) y también tienen cascade, pero se vuelven a borrar explícito más
    // abajo por las dudas.
    const deleteRes = await fetch(`${base}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (!deleteRes.ok) {
      const errBody = await deleteRes.text();
      console.error('delete-account: failed to delete auth user', errBody);
      res.status(500).json({ error: 'Could not delete account' });
      return;
    }

    // A partir de acá la cuenta ya no existe (el paso irreversible ya pasó), así que
    // estos borrados son solo limpieza extra -- tolerantes a errores, si una tabla
    // falla seguimos con las demás en vez de frenar la respuesta. chat_usage
    // (sql/chat_usage.sql) es la única que de verdad los necesita: su user_id NO tiene
    // ninguna foreign key hacia auth.users (PRIMARY KEY (user_id, usage_date) suelto,
    // sin REFERENCES), así que el borrado de arriba no la toca -- sin este loop
    // quedaría huérfana para siempre una fila por cada día que el usuario haya usado
    // el chat con el coach.
    const tables = ['app_state', 'push_subscriptions', 'strava_connections', 'chat_usage'];
    for (const table of tables) {
      try {
        await fetch(`${base}/rest/v1/${table}?user_id=eq.${userId}`, { method: 'DELETE', headers });
      } catch (e) { console.error(`delete-account: failed to clear ${table}`, e); }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('delete-account error', err);
    await reportError(err, { endpoint: 'delete-account' });
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});
