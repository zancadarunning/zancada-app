// api/suunto-auth.js
//
// Callback de OAuth de Suunto -- mismo rol que wahoo-auth.js/polar-auth.js. El canje del
// código por el token usa HTTP Basic (client_id:client_secret) con el body form-urlencoded,
// igual que Polar, contra https://cloudapi-oauth.suunto.com/oauth/token (confirmado en la
// documentación pública de API Zone).
//
// Acá SOLO se guarda la conexión. La primera sincronización de carreras la hacen el botón
// "Sincronizar ahora" y el cron (suunto-sync*.js), para que este redirect -- que el
// navegador está esperando -- responda rápido siempre.

const crypto = require('crypto');
const { SUUNTO_OAUTH_BASE, basicAuthHeader, suuntoUsernameFromToken } = require('./_lib/suunto-activity-helpers');
const { fetchWithTimeout } = require('./_lib/fetch-with-timeout');

const REDIRECT_URI = 'https://zancada.org/api/suunto-auth';

// Huella NO reversible de cómo le llegan las credenciales a la función (largo de cada una, si
// tienen espacios o saltos de línea, y 6 caracteres de un hash del secret). Sirve para
// diagnosticar un invalid_client sin exponer ningún valor: un client_id de API Zone tiene 36
// caracteres; un espacio al final de una variable de Vercel es la causa clásica.
function credentialFingerprint() {
  const cid = String(process.env.SUUNTO_CLIENT_ID || ''), sec = String(process.env.SUUNTO_CLIENT_SECRET || '');
  const ws = /\s/.test(cid) || /\s/.test(sec) ? 1 : 0;
  return 'c' + cid.length + 's' + sec.length + 'w' + ws + 'f' + crypto.createHash('sha256').update(sec).digest('hex').slice(0, 6);
}

function verifyState(state) {
  const secret = process.env.SUUNTO_STATE_SECRET;
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

// Ver el comentario igual a este en strava-auth.js: sin esto, cada rama de error dejaba al
// usuario en una página muerta sin ningún link de vuelta a la app.
// A diferencia de las otras marcas, acá el fallo NO es silencioso: vuelve a la app con
// ?suunto_connect=error (app.js muestra un aviso) y queda registrado en Sentry. Antes, un fallo
// al guardar la conexión se veía idéntico a una conexión exitosa, y la integración todavía no
// se probó con muchas cuentas reales.
async function failGracefully(res, reason, detail, code, diag) {
  console.error('suunto-auth: ' + reason, detail || '');
  await reportError(new Error('suunto-auth: ' + reason), { detail: detail == null ? null : String(detail).slice(0, 300) }).catch(() => {});
  res.writeHead(302, { Location: '/?suunto_connect=error&why=' + encodeURIComponent(String(code || 'unknown').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 60))
    + (diag ? '&dx=' + encodeURIComponent(String(diag).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 40)) : '') });
  res.end();
}

// Vinculación real (intercambio del code + guardar tokens). Ver api/_lib/oauth-link.js: ya no corre al volver de la marca sino
// cuando la app lo confirma con la sesión del usuario (POST).
const linkAccount = async (req, res) => {
  const { code, state: rawState } = req.query;
  if (!code || !rawState) { await failGracefully(res, 'falta code o state', null, 'missing_code'); return; }
  const userId = verifyState(rawState);
  if (!userId) { await failGracefully(res, 'state inválido o vencido', null, 'bad_state'); return; }

  try {
    const tokenRes = await fetchWithTimeout(`${SUUNTO_OAUTH_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: basicAuthHeader()
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI })
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenData.access_token || !tokenData.refresh_token) { await failGracefully(res, 'token exchange failed', 'status ' + tokenRes.status + ' ' + JSON.stringify({ error: tokenData.error, description: tokenData.error_description || tokenData.message, hasAccess: !!tokenData.access_token, hasRefresh: !!tokenData.refresh_token }), 'token_' + tokenRes.status + (tokenData.error ? '_' + tokenData.error : ''), credentialFingerprint()); return; }

    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
    const expiresAt = Math.floor(Date.now() / 1000) + (tokenData.expires_in || 86400);
    const saveRes = await fetch(`${base}/rest/v1/suunto_connections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: userId,
        suunto_username: suuntoUsernameFromToken(tokenData.access_token),
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt
      })
    });
    if (!saveRes.ok) { await failGracefully(res, 'no se pudo guardar la conexión', await saveRes.text().catch(() => ''), 'save_' + saveRes.status); return; }

    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (err) {
    console.error('suunto-auth error', err);
    await reportError(err, { endpoint: 'suunto-auth' });
    await failGracefully(res, 'excepción no controlada', err.message, 'exception');
  }
};

module.exports = withSentry(withOAuthLink(linkAccount, { provider: 'suunto', verifyState }));
