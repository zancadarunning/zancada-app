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
    // para que reenviar la sesión del mismo día sea reconocible como "la
    // misma". Confirmado con una prueba real: Wahoo NO dedupea por este campo
    // solo -- cada POST crea un workout nuevo, así que tocar "Enviar a mi
    // reloj" más de una vez el mismo día generaba duplicados en el calendario
    // del usuario. Por eso ahora primero preguntamos si ya existe uno con
    // este workout_token entre los últimos creados, y si existe no mandamos
    // uno nuevo (no hay endpoint documentado de "actualizar" un workout, así
    // que "no duplicar" es más seguro que adivinar uno).
    const workoutToken = `zancada_${userId}_${startsISO.slice(0, 10)}`;
    const existingRes = await fetch('https://api.wahooligan.com/v1/workouts?page=1&per_page=10', {
      headers: { Authorization: `Bearer ${conn.access_token}` }
    });
    if (existingRes.ok) {
      const existingData = await existingRes.json().catch(() => null);
      const existing = (existingData && existingData.workouts || []).find(w => w.workout_token === workoutToken);
      if (existing) { res.status(200).json({ pushed: true, alreadyExists: true }); return; }
    }
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
    if (!pushRes.ok) {
      const text = await pushRes.text().catch(() => '');
      console.error('wahoo-push-workout: create failed', pushRes.status, text);
      res.status(200).json({ pushed: false, reason: 'wahoo_error' });
      return;
    }
    res.status(200).json({ pushed: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
