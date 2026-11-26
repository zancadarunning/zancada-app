// api/_lib/ai-consent.js
//
// La IA (Zonda) es opcional: antes de mandar nada a la IA, el servidor comprueba en la cuenta guardada que la persona la tenga activada
// (app_state.data.consent.ai === true, ver app.js: acceptConsent / setAiEnabled). La app ya lo respeta, pero el que decide es el servidor: una versión vieja,
// un error o un pedido armado a mano no pueden saltearlo.
const { fetchWithTimeout } = require('./fetch-with-timeout');

// true = activada; false = no activada; null = no se pudo comprobar (en ese caso tampoco se envía nada).
async function aiAllowed(base, key, userId) {
  try {
    const r = await fetchWithTimeout(`${base}/rest/v1/app_state?user_id=eq.${encodeURIComponent(userId)}&select=ai:data->consent->ai`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }, 6000);
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows)) return null;
    return !!(rows[0] && rows[0].ai === true);
  } catch (e) {
    return null;
  }
}

module.exports = { aiAllowed };
