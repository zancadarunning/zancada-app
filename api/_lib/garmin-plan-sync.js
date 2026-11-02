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

// Quita TODO lo que Zancada mandó (al desconectar o al borrar la cuenta). Devuelve cuántos entrenamientos se borraron.
async function removeAllGarminWorkouts(base, headers, userId, accessToken) {
  const known = await loadKnown(base, headers, userId, '0000-00-00');
  let removed = 0;
  for (const [date, rec] of Object.entries(known).slice(0, 40)) {
    try { if (await deleteGarminWorkout(accessToken, rec)) removed++; } catch (e) { /* se sigue con el resto */ }
    await forgetKnown(base, headers, userId, date);
  }
  return removed;
}

module.exports = { KIND, loadKnown, saveKnown, forgetKnown, deleteGarminWorkout, removeAllGarminWorkouts };
