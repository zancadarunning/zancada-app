// api/coros-describe-tools.js
//
// Diagnóstico SOLO PARA ADMIN (lista ADMIN_EMAILS, igual que admin-stats.js): le pregunta al servidor MCP de COROS cuáles son sus herramientas para escribir entrenamientos y
// devuelve su descripción y su esquema (inputSchema) tal cual los publica. Sirve para armar el envío de entrenamientos al reloj ("Enviar a mi COROS") sin adivinar el formato
// del entrenamiento (course/sections/targetType...): la guía pública de COROS no lo detalla y dice que se lee con una cuenta conectada. Usa la conexión COROS de la cuenta admin
// (hay que tener COROS conectado en Perfil → Conectividad; sirve cualquier cuenta de COROS, no hace falta un reloj).
//
// No lee ni devuelve datos de ninguna persona: solo metadatos de las herramientas.

const { decToken } = require('./_lib/token-crypto');
const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { userCooldown } = require('./_lib/sync-cooldown');
const { corosMcpRequest, refreshCorosToken } = require('./_lib/coros-activity-helpers');
const { withSentry, reportError } = require('./_lib/sentry');

const TOOLS_OF_INTEREST = new Set([
  'createScheduledWorkout', 'updateScheduledWorkout', 'queryScheduledWorkoutDetails', 'queryTrainingSchedule',
  'createSingleWorkout', 'scheduleWorkout', 'queryWorkoutLibrary', 'queryWorkoutDetails', 'createTrainingPlan'
]);

function adminList() {
  return String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const admins = adminList();
  const email = String(auth.email || '').toLowerCase();
  if (!admins.length || !email || !auth.emailConfirmed || !admins.includes(email)) { res.status(403).json({ error: 'Forbidden' }); return; }
  if (!(await userCooldown(auth.userId, 'coros-describe', 20000))) { res.status(429).json({ error: 'Too many requests' }); return; }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  try {
    const connRes = await fetch(`${base}/rest/v1/coros_connections?user_id=eq.${auth.userId}&select=*`, { headers });
    const conns = await connRes.json();
    if (!Array.isArray(conns) || !conns.length) { res.status(200).json({ error: 'not_connected', hint: 'Conectá COROS en Perfil → Conectividad con esta cuenta y volvé a probar.' }); return; }
    const conn = conns[0];
    let accessToken = decToken(conn.access_token);
    if (conn.expires_at < Math.floor(Date.now() / 1000)) {
      const refreshed = await refreshCorosToken(base, headers, auth.userId, decToken(conn.refresh_token));
      if (!refreshed) { res.status(200).json({ error: 'token_expired', hint: 'Desconectá y volvé a conectar COROS.' }); return; }
      accessToken = refreshed.accessToken;
    }
    const result = await corosMcpRequest(accessToken, 'tools/list', {});
    const all = (result && Array.isArray(result.tools)) ? result.tools : [];
    const tools = all.filter(t => TOOLS_OF_INTEREST.has(t.name)).map(t => ({ name: t.name, description: t.description || '', inputSchema: t.inputSchema || null }));
    res.status(200).json({ totalTools: all.length, names: all.map(t => t.name), tools });
  } catch (err) {
    console.error('coros-describe-tools error', err);
    await reportError(err, { endpoint: 'coros-describe-tools' });
    res.status(500).json({ error: 'Internal error' });
  }
});
