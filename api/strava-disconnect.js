// api/strava-disconnect.js
//
// Desconecta Strava "de verdad": además de borrar la fila en
// strava_connections, le avisa a Strava que revoque el permiso, para que la
// autorización no quede activa de su lado después de desconectar desde la
// app. Sigue el mismo estilo que tus otros endpoints (fetch directo a la
// REST API de Supabase, sin librerías extra).
//
// También borra las carreras que se habían importado de Strava
// (app_state.data.runs con source:'strava') -- antes solo se borraba la
// fila de strava_connections y las carreras sincronizadas (con su ruta GPS
// y frecuencia cardíaca) quedaban guardadas para siempre, aunque el usuario
// ya hubiera desconectado la cuenta. Eso contradice tanto lo que dice la
// política de privacidad (los datos de Strava están atados a la conexión)
// como lo que exige el acuerdo de desarrollador de Strava (borrar los datos
// obtenidos por su API cuando el usuario revoca el acceso). Los kilómetros
// de las zapatillas se recalculan después, sumando solo las carreras que
// quedan, para que no arrastren kilometraje de carreras ya borradas.
//
// Usa las mismas variables de entorno que ya tenés configuradas para
// strava-auth.js:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { purgeStravaRunsForUser } = require('./_lib/strava-activity-helpers');

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

    try {
      const connRes = await fetch(`${base}/rest/v1/strava_connections?user_id=eq.${userId}&select=access_token`, { headers });
      const connRows = await connRes.json();
      const accessToken = connRows && connRows[0] && connRows[0].access_token;
      if (accessToken) {
        await fetch(`https://www.strava.com/oauth/deauthorize?access_token=${encodeURIComponent(accessToken)}`, { method: 'POST' });
      }
    } catch (e) {
      // Si Strava no responde o el token ya venció, igual seguimos: es mejor
      // dejar la conexión borrada de nuestro lado que dejar al usuario
      // trabado sin poder desconectar.
      console.error('strava-disconnect: revoke failed', e);
    }

    const delRes = await fetch(`${base}/rest/v1/strava_connections?user_id=eq.${userId}`, { method: 'DELETE', headers });
    if (!delRes.ok) {
      console.error('strava-disconnect: failed to delete connection row', await delRes.text());
      res.status(500).json({ error: 'Could not disconnect Strava' });
      return;
    }

    try {
      await purgeStravaRunsForUser(base, headers, userId);
    } catch (e) {
      // No dejamos que un fallo acá bloquee la desconexión en sí (ya se borró
      // strava_connections y se revocó el permiso) -- pero lo logueamos para
      // no perder de vista que puede haber quedado data de Strava sin purgar.
      console.error('strava-disconnect: error purging synced runs', e);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('strava-disconnect error', err);
    await reportError(err, { endpoint: 'strava-disconnect' });
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});
