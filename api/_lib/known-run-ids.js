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

module.exports = { knownRunIds };
