// api/wahoo-push-workout.js
//
// Manda la sesión planeada de hoy al calendario de Wahoo del usuario -- esto
// es lo nuevo que Strava/Polar no pueden hacer (son de solo lectura).
//
// ALCANCE DE ESTA PRIMERA VERSIÓN: manda un workout "simple" (nombre, tipo,
// hora de inicio, duración) -- NO manda intervalos estructurados (calentar/
// series/enfriar con ritmo objetivo por tramo). Wahoo sí soporta eso vía un
// "plan file" (POST /v1/plans con un JSON en un formato propio, documentado
// en un PDF de Confluence que no pude extraer de forma confiable), pero
// arriesgar un formato adivinado ahí es peor que no mandarlo -- si más
// adelante conseguís acceso a ese formato exacto, se puede sumar sin romper
// esta parte.
//
// El cliente (app.js) ya calcula nombre/tipo/duración de la sesión de hoy
// con la misma lógica que usa para mostrarla en Inicio (planLabel(),
// planAmountText()) -- este endpoint no duplica esa lógica, solo la relaya a
// Wahoo con el token guardado.

const verifyUser = require('./_lib/verify-user');
const { refreshWahooToken } = require('./_lib/wahoo-activity-helpers');
const { applyCors, isPreflight } = require('./_lib/cors');

module.exports = async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;

  const { name, startsISO, minutes } = req.body || {};
  if (!name || !startsISO || !minutes) { res.status(400).json({ error: 'Faltan name, startsISO o minutes' }); return; }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connRes = await fetch(`${base}/rest/v1/wahoo_connections?user_id=eq.${userId}&select=*`, { headers });
    const conns = await connRes.json();
    if (!conns || !conns.length) { res.status(200).json({ pushed: false, reason: 'not_connected' }); return; }
    let conn = conns[0];

    if (conn.expires_at < Math.floor(Date.now() / 1000)) {
      const refreshed = await refreshWahooToken(base, headers, userId, conn.refresh_token);
      if (!refreshed) { res.status(200).json({ pushed: false, reason: 'token_expired' }); return; }
      conn.access_token = refreshed.accessToken;
    }

    // workout_token identifica la sesión del lado de Wahoo -- usamos la fecha
    // para que reenviar la sesión del mismo día sea al menos reconocible como
    // "la misma", aunque Wahoo no documenta si dedupea por este campo.
    const workoutToken = `zancada_${userId}_${startsISO.slice(0, 10)}`;
    const body = new URLSearchParams({
      'workout[name]': name,
      'workout[workout_token]': workoutToken,
      'workout[workout_type_id]': '1', // RUNNING (outdoor) -- ver isRunningWorkoutType en _lib
      'workout[starts]': startsISO,
      'workout[minutes]': String(minutes)
    });
    const pushRes = await fetch('https://api.wahooligan.com/v1/workouts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.access_token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const respBody = await pushRes.text().catch(() => '');
    if (!pushRes.ok) {
      res.status(200).json({ pushed: false, reason: 'wahoo_error', debug: { httpStatus: pushRes.status, body: respBody } });
      return;
    }
    // Temporal: devolvemos lo que Wahoo realmente guardó (incluido el "starts"
    // que nos haya normalizado) para diagnosticar por qué no aparece del lado
    // de Wahoo -- ver el pedido de debug en el chat. Sacar el campo debug una
    // vez confirmado que funciona de punta a punta.
    res.status(200).json({ pushed: true, debug: { sentStarts: startsISO, wahooResponse: respBody } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
