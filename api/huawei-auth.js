// api/huawei-auth.js
//
// Callback de OAuth de Huawei Health Kit (cuenta HUAWEI ID) -- mismo rol que wahoo-auth.js. Detalles del protocolo,
// de la documentación oficial (ver api/_lib/huawei-activity-helpers.js):
//  - el intercambio del code va a https://oauth-login.cloud.huawei.com/oauth2/v3/token, form-urlencoded, con client_id (App ID)
//    y client_secret en el cuerpo, y el mismo redirect_uri que se usó al pedir el code;
//  - el access_token dura 1 hora y el refresh_token solo viene si al pedir el code se mandó access_type=offline;
//  - el code vence a los 5 minutos y se usa una sola vez.
//
// Variables de entorno NUEVAS en Vercel (todas del producto "Zancada" de tipo servidor en HUAWEI ID):
//   HUAWEI_CLIENT_ID      (el "ID de la aplicación")
//   HUAWEI_CLIENT_SECRET  (el "Secreto de la aplicación")
//   HUAWEI_STATE_SECRET   (string largo al azar, uno nuevo)

const { encToken } = require('./_lib/token-crypto');
const crypto = require('crypto');
const { recordToRun, isImportableRecord, fetchRunRecords, mergeHuaweiRuns, OAUTH_TOKEN_URL } = require('./_lib/huawei-activity-helpers');
const { fetchWithTimeout } = require('./_lib/fetch-with-timeout');

const REDIRECT_URI = 'https://zancada.org/api/huawei-auth';

function verifyState(state) {
  const secret = process.env.HUAWEI_STATE_SECRET;
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
const { withOAuthLink } = require('./_lib/oauth-link');
const { safeConvert } = require('./_lib/safe-convert');
const { knownRunIds } = require('./_lib/known-run-ids');

function failGracefully(res, reason, detail) {
  console.error('huawei-auth: ' + reason, detail || '');
  res.writeHead(302, { Location: '/?link_error=1' });
  res.end();
}

// Vinculación real (intercambio del code + guardar tokens). Ver api/_lib/oauth-link.js: corre cuando la app lo confirma con la sesión del usuario (POST).
const linkAccount = async (req, res) => {
  const { code, state: rawState } = req.query;
  if (!code || !rawState) { failGracefully(res, 'falta code o state'); return; }
  const userId = verifyState(rawState);
  if (!userId) { failGracefully(res, 'state inválido o vencido'); return; }
  if (!process.env.HUAWEI_CLIENT_ID || !process.env.HUAWEI_CLIENT_SECRET) { failGracefully(res, 'faltan HUAWEI_CLIENT_ID / HUAWEI_CLIENT_SECRET'); return; }

  try {
    const tokenRes = await fetchWithTimeout(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.HUAWEI_CLIENT_ID,
        client_secret: process.env.HUAWEI_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI
      })
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenData.access_token) { failGracefully(res, 'token exchange failed', { status: tokenRes.status, error: tokenData.error, sub_error: tokenData.sub_error }); return; }
    if (!tokenData.refresh_token) { failGracefully(res, 'Huawei no devolvió refresh_token (¿falta access_type=offline?)'); return; }

    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
    const expiresAt = Math.floor(Date.now() / 1000) + (Number(tokenData.expires_in) || 3600);
    const saveRes = await fetch(`${base}/rest/v1/huawei_connections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: userId,
        access_token: encToken(tokenData.access_token),
        refresh_token: encToken(tokenData.refresh_token),
        expires_at: expiresAt
      })
    });
    if (!saveRes.ok) { failGracefully(res, 'no se pudo guardar la conexión', 'status ' + saveRes.status + ' ' + await saveRes.text().catch(() => '')); return; }

    // Punto de partida: las carreras de los últimos 30 días (el máximo por pedido es 31). Solo el resumen de cada una, sin ruta ni parciales.
    const found = await fetchRunRecords(tokenData.access_token, Date.now() - 30 * 24 * 3600 * 1000, Date.now());
    if (!found.ok) console.error('huawei-auth: no se pudieron traer las carreras', found.status);
    const runRecords = (found.records || []).filter(isImportableRecord);
    if (runRecords.length) {
      const plainHeaders = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
      const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers: plainHeaders });
      const stateRows = await stateRes.json();
      if (stateRows && stateRows.length) {
        const knownIds = knownRunIds(stateRows[0].data, 'huaweiId', 'huawei');
        const newRuns = [];
        for (const r of runRecords.filter(r => !knownIds.has(String(r.id)))) {
          const run = await safeConvert(() => recordToRun(r), 'huawei'); if (run) newRuns.push(run);
        }
        await mergeHuaweiRuns(base, plainHeaders, userId, newRuns, 'skip');
      }
    }
    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (err) {
    console.error('huawei-auth error', err);
    await reportError(err, { endpoint: 'huawei-auth' });
    failGracefully(res, 'excepción no controlada', err.message);
  }
};

module.exports = withSentry(withOAuthLink(linkAccount, { provider: 'huawei', verifyState }));
