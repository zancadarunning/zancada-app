// api/polar-auth.js
//
// Callback de OAuth de Polar AccessLink -- mismo rol que strava-auth.js,
// pero el protocolo de Polar tiene dos pasos que Strava no pide:
//   1. El intercambio del código por el token usa autenticación HTTP Basic
//      (client_id:client_secret en base64) en vez de mandarlos en el body,
//      y el body va form-urlencoded en vez de JSON.
//   2. Antes de poder pedir datos, hay que "registrar" al usuario contra
//      nuestra app (POST /v3/users) -- si no, cualquier pedido de datos
//      devuelve vacío aunque el token sea válido. 409 significa que ya
//      estaba registrado (por ejemplo, reconectó después de desconectar):
//      no es un error, seguimos igual.
//
// El access_token de Polar no vence (no hay refresh_token que rotar), así
// que a diferencia de strava_connections no hace falta guardar expires_at
// ni una rutina de renovación periódica.

const crypto = require('crypto');
const { exerciseToRun, mergePolarRuns } = require('./_lib/polar-activity-helpers');

const REDIRECT_URI = 'https://zancada.org/api/polar-auth';

function verifyState(state) {
  const secret = process.env.POLAR_STATE_SECRET;
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
    const basicAuth = Buffer.from(`${process.env.POLAR_CLIENT_ID}:${process.env.POLAR_CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch('https://polarremote.com/v2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${basicAuth}`
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) { res.status(400).json(tokenData); return; }
    const accessToken = tokenData.access_token;
    const polarUserId = tokenData.x_user_id;

    // Registrar al usuario contra nuestra app -- 409 (ya registrado) no es un
    // error, todo lo demás que no sea 2xx sí lo es.
    const registerRes = await fetch('https://www.polaraccesslink.com/v3/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'member-id': userId })
    });
    if (!registerRes.ok && registerRes.status !== 409) {
      const text = await registerRes.text().catch(() => '');
      throw new Error(`polar user registration failed: ${registerRes.status} ${text}`);
    }

    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
    await fetch(`${base}/rest/v1/polar_connections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ user_id: userId, polar_user_id: String(polarUserId), member_id: userId, access_token: accessToken })
    });

    // Traer ejercicios de los últimos 30 días como punto de partida (es lo
    // máximo que devuelve /v3/exercises sin transacción -- ver swagger).
    const exsRes = await fetch('https://www.polaraccesslink.com/v3/exercises', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const exsData = await exsRes.json();
    const exercises = (exsData && exsData.exercises) || [];
    const runExercises = exercises.filter(ex => String(ex.sport || '').toUpperCase().includes('RUN'));
    if (runExercises.length) {
      const plainHeaders = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
      const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers: plainHeaders });
      const stateRows = await stateRes.json();
      if (stateRows && stateRows.length) {
        const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.polarId));
        const newRuns = runExercises.filter(ex => !knownIds.has(ex.id)).map(exerciseToRun);
        await mergePolarRuns(base, plainHeaders, userId, newRuns, 'skip');
      }
    }
    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (err) {
    console.error('polar-auth error', err);
    await reportError(err, { endpoint: 'polar-auth' });
    res.status(500).send('Error: ' + err.message);
  }
});
