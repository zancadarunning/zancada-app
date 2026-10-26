// api/_lib/daily-cap.js
//
// Tope DIARIO de pedidos por cuenta (o global) para los endpoints que gastan una cuota que es de la app entera (Strava, Suunto, Wahoo) o que mandan mails
// (Resend: 100 por día en el plan gratis, compartido con los mails de Supabase). El cooldown entre pedidos (check_sync_cooldown) no alcanza: con 20 s a 5 min
// entre pedidos una sola cuenta con un script llega a cientos por día.
//
// Reusa la función atómica increment_chat_usage (sql/chat_usage.sql): cuenta por (id, día) y devuelve true mientras no se pase del tope. chat_usage.user_id no
// tiene clave foránea, así que cada tope usa un UUID derivado (determinístico) de "ámbito + usuario", que nunca choca con un usuario real ni con el del chat.
//
// Falla abierto o cerrado según el endpoint: los que mandan mails o gastan cuota ajena usan failClosed; el resto deja pasar si el limitador no responde.

const crypto = require('crypto');
const { fetchWithTimeout } = require('./fetch-with-timeout');

// UUID (v4-con-forma) derivado de un texto: el mismo texto da siempre el mismo id.
function capId(scope, userId) {
  const h = crypto.createHash('sha256').update('daily-cap:' + scope + ':' + (userId || 'global')).digest();
  h[6] = (h[6] & 0x0f) | 0x40;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

// true = todavía dentro del tope de hoy (y el pedido queda contado); false = ya se pasó.
// userId null = tope global del ámbito.
async function withinDailyCap(base, headers, scope, userId, limit, opts) {
  const onFailure = !(opts && opts.failClosed);
  try {
    const res = await fetchWithTimeout(`${base}/rest/v1/rpc/increment_chat_usage`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_user_id: capId(scope, userId), p_limit: limit })
    }, 5000);
    if (!res.ok) { console.error('daily-cap rpc failed', scope, res.status); return onFailure; }
    return (await res.json()) !== false;
  } catch (e) {
    console.error('daily-cap request failed', scope, e);
    return onFailure;
  }
}

module.exports = { withinDailyCap, capId };
