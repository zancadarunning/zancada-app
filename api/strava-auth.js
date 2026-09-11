const crypto = require('crypto');
const { activityToRun, mergeStravaRuns } = require('./_lib/strava-activity-helpers');

// Verifica el "state" firmado por api/strava-init.js antes de confiar en el
// user_id que trae. Sin esto, cualquiera podía armar a mano un link de
// autorización de Strava con state=<user_id de otra persona> y pegar SU
// PROPIA cuenta de Strava en la cuenta ajena. El state tiene el formato
// "<userId>.<timestamp>.<firma>"; se recalcula la firma con el mismo secreto
// y se compara, y además se rechaza si pasaron más de 10 minutos desde que
// se generó (para que un link viejo no se pueda reusar).
function verifyState(state) {
  const secret = process.env.STRAVA_STATE_SECRET;
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
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) { res.status(400).json(tokenData); return; }
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
    await fetch(`${base}/rest/v1/strava_connections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: userId,
        athlete_id: tokenData.athlete.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_at
      })
    });
    // Traer carreras de los últimos 30 días como punto de partida
    const after = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const actsRes = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=30`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const acts = await actsRes.json();
    const runActs = Array.isArray(acts) ? acts.filter(a => ((a.sport_type || a.type || '').includes('Run'))) : [];
    if (runActs.length) {
      const plainHeaders = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
      const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers: plainHeaders });
      const stateRows = await stateRes.json();
      if (stateRows && stateRows.length) {
        const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.stravaId));
        const newRuns = [];
        for (const act of runActs) {
          if (knownIds.has(act.id)) continue;
          newRuns.push(await activityToRun(act, tokenData.access_token));
        }
        await mergeStravaRuns(base, plainHeaders, userId, newRuns, 'skip');
      }
    }
    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (err) {
    console.error('strava-auth error', err);
    await reportError(err, { endpoint: 'strava-auth' });
    res.status(500).send('Error: ' + err.message);
  }
});
