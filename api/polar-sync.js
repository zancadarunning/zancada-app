// api/polar-sync.js
//
// Mismo rol que sync-strava.js/coros-sync.js/wahoo-sync.js pero para Polar: lo dispara el
// cron de Vercel y recorre TODAS las cuentas conectadas. Hasta ahora Polar solo se
// sincronizaba con el botón "Sincronizar" manual de polar-sync-now.js. Los tokens de Polar
// no vencen (ver polar-sync-now.js), así que acá no hace falta ningún paso de refresh.

const requireCronSecret = require('./_lib/require-cron-secret');
const { exerciseToRun, mergePolarRuns } = require('./_lib/polar-activity-helpers');
const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  if (!requireCronSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connsRes = await fetch(`${base}/rest/v1/polar_connections?select=*`, { headers });
    const conns = await connsRes.json();

    let synced = 0, errors = 0;
    for (const conn of (Array.isArray(conns) ? conns : [])) {
      try {
        const exsRes = await fetch('https://www.polaraccesslink.com/v3/exercises', {
          headers: { Authorization: `Bearer ${conn.access_token}` }
        });
        const exsData = await exsRes.json().catch(() => null);
        if (!exsRes.ok) {
          errors++;
          console.error('polar-sync (cron): exercises fetch failed', conn.user_id, exsRes.status, JSON.stringify(exsData).slice(0, 500));
          continue;
        }
        const exercises = (exsData && exsData.exercises) || [];
        const runExercises = exercises.filter(ex => String(ex.sport || '').toUpperCase().includes('RUN'));

        if (runExercises.length) {
          const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}&select=data`, { headers });
          const stateRows = await stateRes.json();
          if (stateRows && stateRows.length) {
            const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.polarId));
            // El cron sí busca el FIT de cada ejercicio nuevo (splits/series/potencia) --
            // a diferencia del botón "Sincronizar ahora" (polar-sync-now.js), acá no hay
            // apuro por responder rápido a un usuario esperando en pantalla.
            const newRuns = [];
            for (const ex of runExercises.filter(ex => !knownIds.has(ex.id))) {
              newRuns.push(await exerciseToRun(ex, conn.access_token));
            }
            if (newRuns.length) await mergePolarRuns(base, headers, conn.user_id, newRuns, 'skip');
          }
        }

        synced++;
      } catch (e) {
        errors++;
        console.error('polar-sync (cron): error syncing user', conn.user_id, e);
      }
    }

    res.status(200).json({ synced, errors, total: Array.isArray(conns) ? conns.length : 0 });
  } catch (err) {
    console.error('polar-sync error', err);
    await reportError(err, { endpoint: 'polar-sync' });
    res.status(500).json({ error: err.message });
  }
});
