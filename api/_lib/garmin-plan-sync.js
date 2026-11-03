// api/_lib/garmin-plan-sync.js
//
// Memoria y borrado de los entrenamientos que Zancada mandó a Garmin Connect (Training API V2). A diferencia de COROS, Garmin SÍ deja borrar y mover: un entrenamiento (workout)
// se programa en un día con un "schedule", y los dos se pueden borrar. Se recuerda qué se mandó en sent_notifications (kind 'garmin_wk'):
//   period = "YYYY-MM-DD|<workoutId>|<scheduleId>|<huella de la sesión>"   (una fila por fecha)
// La huella permite no volver a llamar a Garmin por una sesión que no cambió (cuota Starter: 200 llamadas por persona por día).

const { garminCall, GARMIN_API } = require('./garmin-activity-helpers');

const KIND = 'garmin_wk';
const ROW_RE = /^(\d{4}-\d{2}-\d{2})\|(\d{1,20})\|(\d{0,20})\|([a-f0-9]{0,16})$/;

async function loadKnown(base, headers, userId, fromDate) {
  const out = {};
  try {
    const r = await fetch(`${base}/rest/v1/sent_notifications?user_id=eq.${userId}&kind=eq.garmin_wk&period=gte.${encodeURIComponent(fromDate || '0000-00-00')}&select=period&limit=60`, { headers });
    const rows = r.ok ? await r.json() : [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const m = String(row.period).match(ROW_RE);
      if (m) out[m[1]] = { workoutId: m[2], scheduleId: m[3] || null, hash: m[4] || '' };
    }
  } catch (e) { /* sin memoria: se crean de nuevo */ }
  return out;
}

async function forgetKnown(base, headers, userId, date) {
  try { await fetch(`${base}/rest/v1/sent_notifications?user_id=eq.${userId}&kind=eq.garmin_wk&period=like.${encodeURIComponent(date + '|')}*`, { method: 'DELETE', headers }); } catch (e) { /* no es crítico */ }
}

async function saveKnown(base, headers, userId, date, rec) {
  try {
    await forgetKnown(base, headers, userId, date);
    await fetch(`${base}/rest/v1/sent_notifications`, {
      method: 'POST', headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ user_id: userId, kind: KIND, period: `${date}|${rec.workoutId}|${rec.scheduleId || ''}|${rec.hash || ''}` })
    });
  } catch (e) { /* no es crítico */ }
}

// Borra de Garmin el entrenamiento y su programación. Devuelve false si Garmin respondió un error que vale la pena reintentar (429 / 5xx).
async function deleteGarminWorkout(accessToken, rec) {
  let ok = true;
  const del = async url => {
    const r = await garminCall(accessToken, 'DELETE', url);
    if (!(r.ok || r.status === 404 || r.status === 410)) { ok = false; }
    return r;
  };
  if (rec.scheduleId) await del(`${GARMIN_API}/training-api/schedule/${encodeURIComponent(rec.scheduleId)}`);
  if (rec.workoutId) await del(`${GARMIN_API}/training-api/workout/v2/${encodeURIComponent(rec.workoutId)}`);
  return ok;
}

// Limpieza de entrenamientos "sueltos": programados en el calendario de Garmin con el sello de Zancada pero que ya no figuran en lo que recordamos (quedaron de un envío cortado a la mitad, de una
// conexión anterior, etc.). Sin esto el calendario de la persona podría juntar copias. Solo toca lo que Garmin dice que es de Zancada (proveedor o nombre "Zancada - …"), nunca entrenamientos de otras apps.
// Si otra cuenta de Zancada está conectada a esta misma cuenta de Garmin no se hace nada (cada una se llevaría por delante los entrenamientos de la otra). Devuelve cuántos se borraron.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
async function removeOrphanZancadaWorkouts(base, headers, userId, accessToken, garminUserId, fromDate, toDate, maxChecks) {
  if (!DATE_ONLY.test(String(fromDate)) || !DATE_ONLY.test(String(toDate)) || toDate < fromDate) return 0;
  if (garminUserId) {
    const r = await fetch(`${base}/rest/v1/garmin_connections?garmin_user_id=eq.${encodeURIComponent(garminUserId)}&user_id=neq.${userId}&select=user_id&limit=1`, { headers });
    const rows = r.ok ? await r.json().catch(() => null) : null;
    if (!Array.isArray(rows) || rows.length) return 0;   // no se pudo comprobar, o la comparte otra cuenta
  }
  const known = await loadKnown(base, headers, userId, fromDate);
  const knownIds = new Set(Object.values(known).map(r => String(r.workoutId)));
  const lr = await garminCall(accessToken, 'GET', `${GARMIN_API}/training-api/schedule?startDate=${fromDate}&endDate=${toDate}`);
  if (!lr.ok || !Array.isArray(lr.json)) return 0;
  const orphans = lr.json.filter(x => x && x.workoutId != null && !knownIds.has(String(x.workoutId))).slice(0, maxChecks || 8);
  let removed = 0;
  for (const o of orphans) {
    const wr = await garminCall(accessToken, 'GET', `${GARMIN_API}/training-api/workout/v2/${encodeURIComponent(String(o.workoutId))}`);
    if (wr.status === 429) break;
    if (!wr.ok || !wr.json) continue;
    const mine = wr.json.workoutProvider === 'Zancada' || /^Zancada - /.test(String(wr.json.workoutName || ''));
    if (!mine) continue;
    await deleteGarminWorkout(accessToken, { workoutId: String(o.workoutId), scheduleId: o.scheduleId != null ? String(o.scheduleId) : null });
    removed++;
  }
  return removed;
}

// Quita TODO lo que Zancada mandó (al desconectar o al borrar la cuenta). Devuelve cuántos entrenamientos se borraron.
async function removeAllGarminWorkouts(base, headers, userId, accessToken) {
  // Solo lo que todavía está por venir (desde ayer, por el huso) y en orden de fecha: antes se traían hasta 60 filas SIN orden, con las fechas ya pasadas, y los 40 que se recorrían eran
  // justo los más viejos, así que los entrenamientos futuros quedaban en el calendario de Garmin Connect de la persona.
  const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const known = await loadKnown(base, headers, userId, from);
  let removed = 0;
  for (const [date, rec] of Object.entries(known).sort(([x], [y]) => x.localeCompare(y)).slice(0, 40)) {
    let ok = false;
    try { ok = await deleteGarminWorkout(accessToken, rec); } catch (e) { /* se sigue con el resto */ }
    // la memoria de esa fecha se borra SOLO si Garmin confirmó el borrado (antes también con un 429 o un 5xx, y el entrenamiento quedaba huérfano para siempre)
    if (ok) { removed++; await forgetKnown(base, headers, userId, date); }
  }
  return removed;
}

module.exports = { KIND, loadKnown, saveKnown, forgetKnown, deleteGarminWorkout, removeAllGarminWorkouts, removeOrphanZancadaWorkouts };
