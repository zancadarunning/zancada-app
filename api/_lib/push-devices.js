// api/_lib/push-devices.js
//
// Una cuenta puede tener VARIOS dispositivos con notificaciones (celular Android, iPhone...): push_subscriptions tiene una fila por (user_id, device_id)
// (sql/push_subscriptions_multi_device.sql). Antes la clave era solo user_id: el último dispositivo en activar pisaba a los demás y cerrar sesión o
// apagar las notificaciones en uno borraba las de todos.

// rows: filas de push_subscriptions (de cualquier cantidad de usuarios). Devuelve { [user_id]: { devices: [{ subscription, platform, device_id }] } }
// sin repetir el mismo destino (mismo endpoint o mismo token): las filas "legacy" de antes de la migración suelen duplicar al dispositivo que ya se registró de nuevo.
function groupByUser(rows) {
  const out = {};
  const seen = new Set();
  for (const s of Array.isArray(rows) ? rows : []) {
    if (!s || !s.user_id) continue;
    const sub = s.subscription || {};
    const dest = sub.endpoint || sub.token || '';
    const key = s.user_id + '|' + (dest || ('sin-destino-' + (s.device_id || '')));
    if (seen.has(key)) continue;
    seen.add(key);
    if (!out[s.user_id]) out[s.user_id] = { devices: [] };
    out[s.user_id].devices.push({ subscription: s.subscription, platform: s.platform || 'web', device_id: s.device_id });
  }
  return out;
}

// Borra la fila de UN dispositivo (el destino murió: 404/410 de Web Push, token de FCM inválido). Sin device_id (base todavía sin migrar) borra la de la cuenta.
// (URL armada por concatenación: cada valor va escapado con encodeURIComponent)
async function deleteDevice(base, headers, userId, deviceId) {
  let url = base + '/rest/v1/push_subscriptions?user_id=eq.' + encodeURIComponent(userId);
  if (deviceId) url += '&device_id=eq.' + encodeURIComponent(deviceId);
  try { await fetch(url, { method: 'DELETE', headers }); } catch (e) { /* si falla, el próximo envío lo vuelve a intentar */ }
}

module.exports = { groupByUser, deleteDevice };
