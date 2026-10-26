// api/_lib/strava-revoke.js
//
// Revoca el permiso de Zancada en la cuenta de Strava de una persona (al desconectar o al borrar la cuenta). El access token de Strava dura 6 horas: si ya
// venció, deauthorize falla y la autorización quedaba activa del lado de Strava aunque nosotros borráramos la conexión. Por eso se renueva antes y se revisa
// la respuesta. Devuelve true si Strava confirmó la revocación (o si ya no había nada que revocar: 401 = el permiso ya no existe).
const { decToken } = require('./token-crypto');

async function revokeStravaAccess(conn) {
  if (!conn) return true;
  let token = decToken(conn.access_token);
  if (!token) return true;
  const exp = Number(conn.expires_at) || 0;
  const refreshTok = decToken(conn.refresh_token || '') || null;
  if (refreshTok && exp < Math.floor(Date.now() / 1000) + 120) {
    try {
      const r = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: refreshTok })
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d && d.access_token) token = d.access_token;
      else if (r.status === 400 || r.status === 401) return true;   // Strava ya no reconoce el permiso: nada que revocar
    } catch (e) { /* se intenta con el token que haya */ }
  }
  try {
    const res = await fetch('https://www.strava.com/oauth/deauthorize?access_token=' + encodeURIComponent(token), { method: 'POST' });
    if (res.ok || res.status === 401) return true;
    console.error('strava revoke: Strava respondió', res.status);
    return false;
  } catch (e) {
    console.error('strava revoke: no se pudo llamar a Strava', e && e.message);
    return false;
  }
}

module.exports = { revokeStravaAccess };
