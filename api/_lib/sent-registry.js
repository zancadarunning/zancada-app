// api/_lib/sent-registry.js
//
// Registro de avisos ya enviados (tabla sent_notifications, ver sql/sent_notifications.sql). Permite que un cron reintente a quienes
// faltaron sin duplicar: el aviso se "reclama" (insert con clave primaria) ANTES de mandarlo; si la corrida falla, la siguiente ve que
// no está reclamado y lo manda.
//
// Si la tabla todavía no existe en Supabase (o la base no responde), todas las funciones devuelven null y el que llama sigue con su
// comportamiento anterior: nunca rompen el cron.

const BATCH = 100;

// Set de user_id (de los recibidos) que YA tienen registrado este aviso en este período. null si el registro no está disponible.
async function fetchSent(base, headers, kind, period, userIds) {
  const sent = new Set();
  try {
    for (let i = 0; i < userIds.length; i += BATCH) {
      const ids = userIds.slice(i, i + BATCH).map(encodeURIComponent).join(',');
      const res = await fetch(`${base}/rest/v1/sent_notifications?kind=eq.${encodeURIComponent(kind)}&period=eq.${encodeURIComponent(period)}&user_id=in.(${ids})&select=user_id`, { headers });
      if (!res.ok) return null;
      const rows = await res.json();
      if (!Array.isArray(rows)) return null;
      rows.forEach(r => sent.add(r.user_id));
    }
    return sent;
  } catch (e) { return null; }
}

// Reclama el aviso para este usuario: true = lo reclamamos nosotros (hay que mandarlo), false = ya estaba (no mandar),
// null = el registro no está disponible.
async function claim(base, headers, userId, kind, period) {
  try {
    const res = await fetch(`${base}/rest/v1/sent_notifications?on_conflict=user_id,kind,period`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ user_id: userId, kind, period })
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) { return null; }
}

// Devuelve el reclamo (el envío falló por algo pasajero): la próxima corrida lo vuelve a intentar.
async function release(base, headers, userId, kind, period) {
  try {
    await fetch(`${base}/rest/v1/sent_notifications?user_id=eq.${encodeURIComponent(userId)}&kind=eq.${encodeURIComponent(kind)}&period=eq.${encodeURIComponent(period)}`, { method: 'DELETE', headers });
  } catch (e) { /* si no se pudo, a lo sumo queda sin reintentar esa semana */ }
}

// Borra registros de más de `days` días (la tabla solo necesita la semana en curso).
async function pruneOld(base, headers, days) {
  try {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    await fetch(`${base}/rest/v1/sent_notifications?sent_at=lt.${encodeURIComponent(cutoff)}`, { method: 'DELETE', headers });
  } catch (e) { /* no es crítico */ }
}

module.exports = { fetchSent, claim, release, pruneOld };
