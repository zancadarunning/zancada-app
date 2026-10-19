// api/_lib/sync-probe.js
//
// Pregunta liviana para los crons de sincronización (Strava, Wahoo, Polar, COROS): en vez de bajar el app_state.data
// completo de cada cuenta en cada corrida (cada 15 minutos) solo para ver si hay algo nuevo, le pregunta a la base por la
// función sync_probe (sql/sync_probe.sql) y recibe unos pocos bytes. Es lo que más datos salientes de Supabase gastaba.
//
// Devuelve { exists, unknown, pending } (ids como texto) o null si la función no está disponible (todavía no se corrió
// sql/sync_probe.sql, o falló la consulta): en ese caso el cron hace lo de siempre, leer el estado completo. Nunca lanza.

async function syncProbe(base, headers, userId, source, idField, ids) {
  try {
    const res = await fetch(`${base}/rest/v1/rpc/sync_probe`, {
      method: 'POST', headers,
      body: JSON.stringify({ p_user_id: userId, p_source: source, p_id_field: idField, p_ids: (ids || []).filter(i => i != null).map(String) })
    });
    if (!res.ok) return null;
    const out = await res.json();
    if (!out || typeof out !== 'object' || !Array.isArray(out.unknown)) return null;
    return { exists: !!out.exists, unknown: out.unknown.map(String), pending: !!out.pending };
  } catch (e) {
    return null;
  }
}

// ¿Hay actividades nuevas que agregar? (sin respuesta de la sonda: se asume que sí y se lee el estado, como antes)
function probeHasNew(probe) {
  return !probe || (probe.exists && probe.unknown.length > 0);
}
// ¿Puede haber carreras guardadas por completar? Si se agregan carreras nuevas en esta corrida también se revisa, como antes.
function probeMayBackfill(probe) {
  return !probe || (probe.exists && (probe.pending || probe.unknown.length > 0));
}

module.exports = { syncProbe, probeHasNew, probeMayBackfill };
