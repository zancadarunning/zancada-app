// api/suunto-webhook.js
//
// Recibe los avisos de Suunto ("se subió un entreno nuevo") -- lo que hace que una carrera
// hecha con el reloj aparezca en Zancada en segundos, sin esperar a ningún cron.
//
// Formato confirmado en la documentación de API Zone (Webhook notifications):
//   - POST con Content-Type application/json y un body { type, username, workout: {...} }.
//     type puede ser WORKOUT_CREATED, ROUTE_CREATED, SUUNTO_247_*_CREATED -- acá solo nos
//     interesan los entrenos.
//   - Header X-HMAC-SHA256-Signature: HMAC-SHA256 en hexadecimal del body CRUDO, con el
//     "notification secret" que se carga en el perfil de API Zone (SUUNTO_NOTIFICATION_SECRET).
//   - Hay que responder 2xx en MENOS DE 2 SEGUNDOS, o Suunto reintenta y, si falla seguido,
//     frena todos los avisos de la app (circuit breaker). Por eso acá no se baja el FIT:
//     el body ya trae el resumen del entreno, se guarda directo, y los splits/series los
//     completa después el cron diario (suunto-sync.js).
//   - "username" es el claim "user" del JWT: así se encuentra la conexión (suunto_connections).
//
// Necesita el body crudo para poder verificar la firma, por eso desactiva el bodyParser de
// Vercel (ver handler.config al final).

const crypto = require('crypto');
const { isRunningActivity, workoutToRun, mergeSuuntoRuns } = require('./_lib/suunto-activity-helpers');
const { withSentry, reportError, reportSecurityEvent } = require('./_lib/sentry');

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function signatureMatches(rawBody, headerValue, secret) {
  if (!secret || !headerValue) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(String(headerValue).trim().toLowerCase(), 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

const handler = withSentry(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const secret = process.env.SUUNTO_NOTIFICATION_SECRET;
  if (!secret) { console.error('suunto-webhook: falta SUUNTO_NOTIFICATION_SECRET'); res.status(500).json({ error: 'not configured' }); return; }

  let raw;
  try { raw = await readRawBody(req); }
  catch (e) { res.status(400).json({ error: 'bad body' }); return; }

  if (!signatureMatches(raw, req.headers['x-hmac-sha256-signature'], secret)) {
    await reportSecurityEvent('Webhook de Suunto con firma ausente o inválida', { hasHeader: !!req.headers['x-hmac-sha256-signature'] }).catch(() => {});
    res.status(401).json({ error: 'invalid signature' });
    return;
  }

  let body;
  try { body = JSON.parse(raw.toString('utf8')); }
  catch (e) { res.status(200).json({ ok: true, ignored: 'not json' }); return; }

  // Solo entrenos de correr -- el resto (rutas, 24/7) se ignora con un 200 para que
  // Suunto no los reintente.
  const workout = body && body.workout;
  if (!body || body.type !== 'WORKOUT_CREATED' || !workout || !body.username) { res.status(200).json({ ok: true, ignored: 'type' }); return; }
  if (!isRunningActivity(workout.activityId)) { res.status(200).json({ ok: true, ignored: 'activity' }); return; }

  try {
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

    const connRes = await fetch(`${base}/rest/v1/suunto_connections?suunto_username=eq.${encodeURIComponent(String(body.username))}&select=user_id`, { headers });
    const conns = await connRes.json().catch(() => []);
    if (!Array.isArray(conns) || !conns.length) { res.status(200).json({ ok: true, ignored: 'unknown user' }); return; }

    const run = workoutToRun(workout, null);
    for (const c of conns) {
      await mergeSuuntoRuns(base, headers, c.user_id, [run], 'skip');
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('suunto-webhook error', err);
    await reportError(err, { endpoint: 'suunto-webhook' });
    // 500: Suunto va a reintentar con backoff, que es lo que queremos si fue una falla nuestra.
    res.status(500).json({ error: 'Error' });
  }
});

handler.config = { api: { bodyParser: false } };
module.exports = handler;
