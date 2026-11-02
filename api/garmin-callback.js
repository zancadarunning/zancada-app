// api/garmin-callback.js
//
// Vuelta del OAuth de Garmin Connect (la dirección registrada en el portal de Garmin: https://www.zancada.org/api/garmin-callback). Mismo rol que coros-auth.js:
//  - GET (lo abre Garmin al volver): solo verifica la firma del "state" y manda a la persona a la app (/conectar?p=garmin). No vincula nada.
//  - POST con la sesión de la app: recién ahí se intercambia el código por los tokens (desde el servidor, con el secreto de la app) y se guarda la conexión.
// Ver api/_lib/oauth-link.js para el porqué de los dos pasos.
//
// Starter no incluye historial: la conexión empieza en blanco y las carreras llegan por el webhook (garmin-webhook.js).

const crypto = require('crypto');
const { encToken, decToken } = require('./_lib/token-crypto');
const { exchangeGarminCode, garminCall, GARMIN_API } = require('./_lib/garmin-activity-helpers');
const { withSentry, reportError } = require('./_lib/sentry');
const { withOAuthLink } = require('./_lib/oauth-link');

function verifyState(state) {
  const secret = process.env.GARMIN_STATE_SECRET;
  if (!secret || !state) return null;
  const parts = String(state).split('.');
  if (parts.length !== 4) return null;
  const [userId, timestamp, sealed, signature] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${userId}.${timestamp}.${sealed}`).digest('hex');
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) return null;
  let codeVerifier;
  try { codeVerifier = decToken(Buffer.from(sealed, 'base64url').toString()); } catch (e) { return null; }
  if (!codeVerifier) return null;
  return { userId, codeVerifier };
}

function failGracefully(res, reason, detail) {
  console.error('garmin-callback: ' + reason, detail || '');
  res.writeHead(302, { Location: '/?link_error=1' });
  res.end();
}

const linkAccount = async (req, res) => {
  const { code, state: rawState } = req.query;
  if (!code || !rawState) { failGracefully(res, 'falta code o state'); return; }
  const verified = verifyState(rawState);
  if (!verified) { failGracefully(res, 'state inválido o vencido'); return; }
  const { userId, codeVerifier } = verified;

  try {
    const tok = await exchangeGarminCode(String(code), codeVerifier);
    if (!tok.ok) { failGracefully(res, 'intercambio de código falló', JSON.stringify({ status: tok.status, error: tok.data && tok.data.error })); return; }
    const t = tok.data;

    // El "userId" de Garmin: con él nos avisan los webhooks. Y los permisos que la persona aceptó.
    const idRes = await garminCall(t.access_token, 'GET', `${GARMIN_API}/partner-gateway/rest/user/id`);
    const garminUserId = idRes.ok && idRes.json && idRes.json.userId ? String(idRes.json.userId) : null;
    if (!garminUserId) { failGracefully(res, 'no se pudo leer el userId de Garmin', 'status ' + idRes.status); return; }
    let permissions = [];
    const permRes = await garminCall(t.access_token, 'GET', `${GARMIN_API}/partner-gateway/rest/user/permissions`);
    if (permRes.ok && permRes.json && Array.isArray(permRes.json.permissions)) permissions = permRes.json.permissions.map(String).slice(0, 20);

    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
    const now = Math.floor(Date.now() / 1000);
    const saveRes = await fetch(`${base}/rest/v1/garmin_connections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: userId,
        garmin_user_id: garminUserId,
        access_token: encToken(t.access_token),
        refresh_token: encToken(t.refresh_token),
        expires_at: now + (Number(t.expires_in) || 86400),
        refresh_expires_at: t.refresh_token_expires_in ? now + Number(t.refresh_token_expires_in) : null,
        permissions
      })
    });
    if (!saveRes.ok) { failGracefully(res, 'no se pudo guardar la conexión', 'status ' + saveRes.status); return; }
    // conexión nueva = la memoria de lo enviado en una conexión anterior ya no vale (esos entrenamientos pudieron borrarse en Garmin): se manda todo de nuevo (lo que sobre lo limpia la limpieza de sueltos)
    await fetch(`${base}/rest/v1/sent_notifications?user_id=eq.${userId}&kind=in.(garmin_wk,garmin_plan)`, { method: 'DELETE', headers }).catch(() => {});

    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (err) {
    console.error('garmin-callback error', err);
    await reportError(err, { endpoint: 'garmin-callback' });
    failGracefully(res, 'excepción no controlada', err && err.message);
  }
};

module.exports = withSentry(withOAuthLink(linkAccount, { provider: 'garmin', verifyState }));
module.exports.verifyState = verifyState;
