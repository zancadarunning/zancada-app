// api/_lib/sync-cooldown.js
//
// Auditoría de costos: envuelve la llamada a la función SQL check_sync_cooldown
// (ver sql/check_sync_cooldown.sql) para los endpoints de "Sincronizar ahora" y
// el reprocesado de video, que hasta ahora no tenían ningún límite de frecuencia
// por usuario más allá de estar logueado. Devuelve true si se puede seguir
// (y ya quedó registrado el intento), false si hay que cortar acá.
//
// Si la llamada a Supabase falla por lo que sea (RPC caída, red, etc.), dejamos
// pasar el pedido -- preferimos arriesgarnos a algún costo de más antes que
// romper "Sincronizar ahora" para todo el mundo por un problema de
// infraestructura del rate limit en sí (mismo criterio que ya usa el chequeo de
// cuota diaria del chat, ver api/chat.js).
const { fetchWithTimeout } = require('./fetch-with-timeout');

// opts.failClosed: si el limitador mismo falla (RPC caída), NO se deja pasar. Se usa en los endpoints que cuestan plata o mandan
// emails (feedback, remux); en los "Sincronizar ahora" se sigue dejando pasar para no romper el botón por un problema del limitador.
async function checkSyncCooldown(base, headers, userId, provider, cooldownMs, opts) {
  const onFailure = !(opts && opts.failClosed);
  try {
    const res = await fetchWithTimeout(`${base}/rest/v1/rpc/check_sync_cooldown`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_user_id: userId, p_provider: provider, p_cooldown_ms: cooldownMs })
    }, 5000);
    if (!res.ok) {
      console.error('check_sync_cooldown rpc failed', provider, res.status, await res.text().catch(() => ''));
      return onFailure;
    }
    return await res.json();
  } catch (e) {
    console.error('check_sync_cooldown request failed', provider, e);
    return onFailure;
  }
}

module.exports = { checkSyncCooldown };
