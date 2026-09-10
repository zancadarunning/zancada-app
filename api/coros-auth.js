// api/coros-auth.js
//
// Callback de OAuth de COROS -- mismo rol que strava-auth.js/polar-auth.js/
// wahoo-auth.js, pero con PKCE en vez de client_secret (ver el comentario
// grande en coros-init.js).
//
// OJO -- REGIÓN: registramos a Zancada como cliente contra el servidor de la
// región "Americas" (mcpus.coros.com), que es donde razonablemente caen la
// mayoría de los usuarios de Zancada (Argentina/LatAm). COROS tiene servidores
// separados para Europa (mcpeu.coros.com) y China (mcpcn.coros.com) con sus
// propios client_id -- si en algún momento aparecen usuarios de esas regiones
// y la conexión les falla en este paso, hace falta registrar un cliente
// nuevo contra el servidor de esa región y armar la misma lógica de acá pero
// eligiendo el host según de dónde sea el usuario (no hay forma de saberlo
// de antemano, antes de que intente conectar).
const crypto = require('crypto');
const { activityToRun, mergeCorosRuns, callCorosMcpTool } = require('./_lib/coros-activity-helpers');

const REDIRECT_URI = 'https://zancada.org/api/coros-auth';
const REGION_HOST = 'mcpus.coros.com';

function verifyState(state) {
  const secret = process.env.COROS_STATE_SECRET;
  if (!secret || !state) return null;
  const parts = state.split('.');
  if (parts.length !== 4) return null;
  const [userId, timestamp, codeVerifier, signature] = parts;
  const payload = `${userId}.${timestamp}.${codeVerifier}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) return null;
  return { userId, codeVerifier };
}

module.exports = async (req, res) => {
  const { code, state: rawState } = req.query;
  if (!code || !rawState) { res.status(400).send('Falta code o state'); return; }
  const verified = verifyState(rawState);
  if (!verified) { res.status(400).send('State inválido o vencido'); return; }
  const { userId, codeVerifier } = verified;

  try {
    const tokenRes = await fetch(`https://${REGION_HOST}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.COROS_CLIENT_ID,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) { res.status(400).json(tokenData); return; }

    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
    const expiresAt = Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600);
    await fetch(`${base}/rest/v1/coros_connections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: userId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt
      })
    });

    // Traer las carreras recientes como punto de partida, igual que al conectar
    // Strava/Polar/Wahoo. querySportRecords/getActivityDetail son nombres de tool
    // documentados por COROS -- los argumentos exactos (rango de fechas, filtro por
    // deporte) no están publicados, así que esto puede necesitar un ajuste la
    // primera vez que se pruebe con una cuenta real (ver el comentario grande en
    // _lib/coros-activity-helpers.js).
    try {
      const records = await callCorosMcpTool(tokenData.access_token, 'querySportRecords', { limit: 30 });
      const list = Array.isArray(records) ? records : (records && records.records) || [];
      const runRecords = list.filter(r => {
        const sport = r.sportType ?? r.sport_type ?? r.sportName ?? '';
        return String(sport).toLowerCase().includes('run');
      });
      if (runRecords.length) {
        const plainHeaders = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
        const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers: plainHeaders });
        const stateRows = await stateRes.json();
        if (stateRows && stateRows.length) {
          const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.corosId));
          const newRunRecords = runRecords.filter(r => !knownIds.has(r.id ?? r.activityId ?? r.labelId));
          const newRuns = [];
          for (const record of newRunRecords) {
            let detail = null;
            try {
              detail = await callCorosMcpTool(tokenData.access_token, 'getActivityDetail', { id: record.id ?? record.activityId ?? record.labelId });
            } catch (e) {
              console.error('coros-auth: getActivityDetail failed for', record.id, e);
            }
            newRuns.push(activityToRun(record, detail));
          }
          if (newRuns.length) await mergeCorosRuns(base, plainHeaders, userId, newRuns, 'skip');
        }
      }
    } catch (e) {
      // No frenamos la conexión si el primer sync falla -- la cuenta ya quedó
      // conectada, el próximo sync (manual o el que dispare la app) puede reintentar.
      console.error('coros-auth: sync inicial falló', e);
    }

    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (err) {
    console.error('coros-auth error', err);
    res.status(500).send('Error: ' + err.message);
  }
};
