// api/polar-sync-now.js
//
// Mismo rol que strava-sync-now.js: traer ejercicios nuevos "a pedido" (lo
// llama syncTodayNow() en app.js). No hace falta el paso de refrescar el
// access_token que tiene la versión de Strava -- los tokens de Polar no
// vencen. Ver la nota importante sobre timing en el comentario de abajo.

const verifyUser = require('./_lib/verify-user');
const { exerciseToRun, mergePolarRuns } = require('./_lib/polar-activity-helpers');
const { applyCors, isPreflight } = require('./_lib/cors');

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  const auth = await verifyUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const userId = auth.userId;

  const base = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

  try {
    const connRes = await fetch(`${base}/rest/v1/polar_connections?user_id=eq.${userId}&select=access_token`, { headers });
    const conns = await connRes.json();
    if (!conns || !conns.length) {
      return res.status(200).json({ synced: false, reason: 'not_connected' });
    }
    const accessToken = conns[0].access_token;

    // OJO -- restricción propia de la API de Polar (no un bug nuestro): este
    // endpoint solo devuelve ejercicios subidos a Flow DESPUÉS de que el
    // usuario quedó registrado contra nuestra app (ver polar-auth.js). Un
    // ejercicio cargado antes de conectar nunca va a aparecer acá, ni ahora
    // ni en ningún sync futuro.
    const exsRes = await fetch('https://www.polaraccesslink.com/v3/exercises', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const exsData = await exsRes.json().catch(() => null);
    // exsRes.ok es la primera pregunta a hacerse acá -- si Polar devuelve un
    // 401/403/lo que sea, exsData no tiene forma de {exercises:[...]} y antes
    // esto se leía como "0 ejercicios" silenciosamente, sin ninguna pista de
    // que en realidad la llamada había fallado.
    if (!exsRes.ok) {
      return res.status(200).json({ synced: false, reason: 'no_new_activity', debug: { httpStatus: exsRes.status, body: exsData } });
    }
    const exercises = (exsData && exsData.exercises) || [];
    const runExercises = exercises.filter(ex => String(ex.sport || '').toUpperCase().includes('RUN'));

    if (!runExercises.length) {
      return res.status(200).json({
        synced: false, reason: 'no_new_activity',
        debug: { totalExercises: exercises.length, sports: exercises.map(ex => ex.sport) }
      });
    }

    const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${userId}&select=data`, { headers });
    const stateRows = await stateRes.json();
    if (!stateRows || !stateRows.length) {
      return res.status(200).json({ synced: false });
    }
    const knownIds = new Set((stateRows[0].data && stateRows[0].data.runs || []).map(r => r.polarId));
    const newRuns = runExercises.filter(ex => !knownIds.has(ex.id)).map(exerciseToRun);

    if (newRuns.length) {
      await mergePolarRuns(base, headers, userId, newRuns, 'skip');
    }

    res.status(200).json({ synced: newRuns.length > 0 });
  } catch (err) {
    console.error('polar-sync-now error', err);
    await reportError(err, { endpoint: 'polar-sync-now' });
    res.status(500).json({ error: err.message });
  }
});
