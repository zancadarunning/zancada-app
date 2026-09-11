// api/wahoo-auth.js
//
// Callback de OAuth de Wahoo -- mismo rol que strava-auth.js/polar-auth.js.
// El intercambio del código por el token va form-urlencoded con
// client_id/client_secret en el body (no Basic auth como Polar, no JSON como
// Strava) -- ver la documentación de cloud-api.wahooligan.com.

const crypto = require('crypto');
const { workoutToRun, mergeWahooRuns, isRunningWorkoutType } = require('./_lib/wahoo-activity-helpers');

const REDIRECT_URI = 'https://zancada.org/api/wahoo-auth';

function verifyState(state) {
  const secret = process.env.WAHOO_STATE_SECRET;
  if (!secret || !state) return null;
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [userId, timestamp, signature] = parts;
  const payload = `${userId}.${timestamp}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) return null;
  return userId;
}

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  const { code, state: rawState } = req.query;
  if (!code || !rawState) { res.status(400).send('Falta code o state'); return; }
  const userId = verifyState(rawState);
  if (!userId) { res.status(400).send('State inválido o vencido'); return; }

  try {
    const tokenRes = await fetch('https://api.wahooligan.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.WAHOO_CLIENT_ID,
        client_secret: process.env.WAHOO_CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) { res.status(400).json(tokenData); return; }

    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
    const expiresAt = Math.floor(Date.now() / 1000) + (tokenData.expires_in || 7200);
    await fetch(`${base}/rest/v1/wahoo_connections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: userId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt
      })
    });

    // Traer los workouts recientes como punto de partida (paginado -- pedimos
    // los últimos 30, alcanza para "los últimos 30 días" como en Strava/Polar
    // salvo que el usuario entrene más de una vez por día seguido).
    const wRes = await fetch('https://api.wahooligan.com/v1/workouts?page=1&per_page=30', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const wData = await wRes.json();
    const workouts = (wData && wData.workouts) || [];
    const runWorkouts = workouts.filter(w => isRunningWorkoutType(w.workout_type_id));
    if (runWorkouts.length) {
      const plainHeaders = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
      const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers: plainHeaders });
      const stateRows = await stateRes.json();
      if (stateRows && stateRows.length) {
        const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.wahooId));
        const newRuns = runWorkouts.filter(w => !knownIds.has(w.id)).map(workoutToRun);
        await mergeWahooRuns(base, plainHeaders, userId, newRuns, 'skip');
      }
    }
    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (err) {
    console.error('wahoo-auth error', err);
    await reportError(err, { endpoint: 'wahoo-auth' });
    res.status(500).send('Error: ' + err.message);
  }
});
