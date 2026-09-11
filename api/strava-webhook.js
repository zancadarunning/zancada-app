const { activityToRun, mergeStravaRuns, purgeStravaRunsForUser } = require('./_lib/strava-activity-helpers');

async function syncActivity(athleteId, activityId) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  const connRes = await fetch(`${base}/rest/v1/strava_connections?athlete_id=eq.${athleteId}&select=*`, { headers });
  const conns = await connRes.json();
  if (!conns || !conns.length) return;
  let conn = conns[0];

  if (conn.expires_at < Math.floor(Date.now() / 1000)) {
    const refreshRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: conn.refresh_token })
    });
    const refreshed = await refreshRes.json();
    if (refreshed.access_token) {
      conn.access_token = refreshed.access_token;
      await fetch(`${base}/rest/v1/strava_connections?user_id=eq.${conn.user_id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ access_token: refreshed.access_token, refresh_token: refreshed.refresh_token, expires_at: refreshed.expires_at })
      });
    }
  }

  const actRes = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${conn.access_token}` }
  });
  const act = await actRes.json();
  if (!act || !((act.sport_type || act.type || '').includes('Run'))) return;

  const newRun = await activityToRun(act, conn.access_token);
  // 'upsert': Strava manda este mismo evento tanto para actividades nuevas
  // como para ediciones de una actividad ya sincronizada (aspect_type
  // 'create' o 'update'), así que si ya la teníamos hay que reemplazarla
  // con los datos nuevos, no saltearla. merge_strava_runs preserva el
  // shoeId que el usuario haya asignado a mano en la app.
  await mergeStravaRuns(base, headers, conn.user_id, [newRun], 'upsert');
}

// Strava manda este evento cuando el usuario revoca el acceso de la app
// desde SU PROPIA cuenta de Strava (Configuración → Mis apps), sin pasar
// por el botón "Desconectar" de Zancada -- antes este caso no se manejaba
// para nada, así que la conexión (con un token que Strava ya invalidó) y
// las carreras importadas se quedaban en la base para siempre, y el cron de
// sincronización seguía intentando (y fallando) contra ese token muerto.
// El acuerdo de desarrollador de Strava exige borrar los datos obtenidos
// por su API en cuanto el usuario revoca el acceso, así que hacemos lo
// mismo que strava-disconnect.js: borrar la conexión y purgar las carreras.
async function deauthorizeAthlete(athleteId) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  const connRes = await fetch(`${base}/rest/v1/strava_connections?athlete_id=eq.${athleteId}&select=user_id`, { headers });
  const conns = await connRes.json();
  if (!conns || !conns.length) return;
  const userId = conns[0].user_id;

  await fetch(`${base}/rest/v1/strava_connections?athlete_id=eq.${athleteId}`, { method: 'DELETE', headers });
  await purgeStravaRunsForUser(base, headers, userId);
}

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.STRAVA_VERIFY_TOKEN) {
      res.status(200).json({ 'hub.challenge': challenge });
      return;
    }
    res.status(403).send('Forbidden');
    return;
  }

  if (req.method === 'POST') {
    res.status(200).send('EVENT_RECEIVED');
    try {
      const event = req.body;
      if (event && event.object_type === 'activity' && (event.aspect_type === 'create' || event.aspect_type === 'update')) {
        await syncActivity(event.owner_id, event.object_id);
      } else if (event && event.object_type === 'athlete' && event.updates && event.updates.authorized === 'false') {
        await deauthorizeAthlete(event.object_id);
      }
    } catch (e) { console.error(e); await reportError(e, { endpoint: 'strava-webhook' }); }
    return;
  }

  res.status(405).send('Method not allowed');
});
