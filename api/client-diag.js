// api/client-diag.js
//
// La app (con sesión iniciada) le avisa a Sentry qué está viendo en este dispositivo cuando algo no
// aparece como debería -- por ahora solo el caso de la tarjeta de Suunto en Conectividad ("suunto-card"),
// que en el iPhone no se mostraba y no había forma de ver por qué sin acceso al celular. Es un
// diagnóstico temporal: no guarda nada en la base, solo manda un mensaje de nivel info a Sentry con
// datos cortos y sin secretos (id de usuario abreviado, respuesta de la consulta, navegador, versión).

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { withSentry, reportDiagnostic } = require('./_lib/sentry');

const ALLOWED_TOPICS = new Set(['suunto-card']);

function short(v, n) { return String(v == null ? '' : v).slice(0, n); }

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }

  const body = req.body || {};
  const topic = short(body.topic, 40);
  if (!ALLOWED_TOPICS.has(topic)) { res.status(400).json({ error: 'topic' }); return; }

  const d = body.data && typeof body.data === 'object' ? body.data : {};
  const clean = {};
  for (const k of Object.keys(d).slice(0, 20)) clean[short(k, 30)] = short(typeof d[k] === 'object' ? JSON.stringify(d[k]) : d[k], 200);
  clean.serverUser = short(auth.userId, 8);
  clean.userAgent = short(req.headers['user-agent'], 200);

  await reportDiagnostic(`diag ${topic}`, clean);
  res.status(200).json({ ok: true });
});
