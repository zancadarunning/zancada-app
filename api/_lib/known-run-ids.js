// api/_lib/known-run-ids.js
//
// Los ids de proveedor que Zancada ya conoce para una persona: los de las carreras guardadas MÁS los de las que la persona borró a mano (state.dismissedRuns, claves "strava:123").
// Sin lo segundo, los crons (que traen los últimos 30 días) volvían a meter una carrera borrada a los 15 minutos y la marcaban otra vez como sesión hecha.
function knownRunIds(data, field, source) {
  const set = new Set(((data && Array.isArray(data.runs)) ? data.runs : []).map(r => r && r[field]));
  const dismissed = data && Array.isArray(data.dismissedRuns) ? data.dismissedRuns : [];
  const prefix = source + ':';
  for (const d of dismissed) {
    const k = d && typeof d.k === 'string' ? d.k : '';
    if (k.indexOf(prefix) !== 0) continue;
    const id = k.slice(prefix.length);
    if (!id) continue;
    set.add(id);
    if (Number.isFinite(Number(id))) set.add(Number(id));   // los ids de Strava/Wahoo son números, los de Polar/COROS texto: se guardan en las dos formas
  }
  return set;
}

// Para los webhooks (Strava, Garmin, Suunto), que llegan de a una actividad y no leen el estado de la persona: saca de `runs` las que ella borró a mano (state.dismissedRuns).
// Sin esto, editar en la marca una actividad ya borrada de Zancada (o un reintento del lote) la volvía a meter y a marcar como sesión hecha. Si la lectura falla, no se filtra nada (como antes).
async function withoutDismissed(base, headers, userId, source, field, runs) {
  if (!Array.isArray(runs) || !runs.length) return runs || [];
  try {
    const res = await fetch(`${base}/rest/v1/app_state?user_id=eq.${encodeURIComponent(userId)}&select=dismissed:data->dismissedRuns&limit=1`, { headers });
    if (!res.ok) return runs;
    const rows = await res.json();
    const data = { dismissedRuns: rows && rows[0] && Array.isArray(rows[0].dismissed) ? rows[0].dismissed : [] };
    if (!data.dismissedRuns.length) return runs;
    const dismissed = knownRunIds(data, field, source);
    return runs.filter(r => !(r && r[field] != null && dismissed.has(r[field])) && !(r && r[field] != null && dismissed.has(String(r[field]))));
  } catch (e) { return runs; }
}

module.exports = { knownRunIds, withoutDismissed };
