// api/suunto-test-upload.js
//
// TEMPORAL -- sube una carrera de prueba (FIT generado en api/_lib/test-fit.js) a la cuenta de
// Suunto de QUIEN LLAMA, para probar de punta a punta la recepción de carreras (Suunto procesa el
// archivo, crea el entrenamiento y avisa por webhook a api/suunto-webhook.js). Se borra junto con
// test-fit.js y el enlace de prueba de app.js cuando termine la prueba.
//
// Dos acciones (la función serverless tiene poco tiempo, así que no se espera el procesamiento):
//   { action: "start" }              -> Upload API: POST /v2/upload (init) + PUT del archivo al blob
//   { action: "status", uploadId }   -> GET /v2/upload/{id}: estado y workoutKey cuando termina
//
// La fecha de la carrera es de hace 14 días a propósito: así cae en una semana anterior y NO toca el
// plan actual (el guardado de carreras marca como hecha la sesión del día solo dentro de la semana en curso).

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { fetchWithTimeout } = require('./_lib/fetch-with-timeout');
const { checkSyncCooldown } = require('./_lib/sync-cooldown');
const { SUUNTO_API_BASE, suuntoApiHeaders, ensureFreshSuuntoToken } = require('./_lib/suunto-activity-helpers');
const { buildTestRunFit } = require('./_lib/test-fit');
const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;
  const body = req.body || {};

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connRes = await fetch(`${base}/rest/v1/suunto_connections?user_id=eq.${userId}&select=*`, { headers });
    const conns = await connRes.json();
    if (!conns || !conns.length) { res.status(200).json({ ok: false, reason: 'not_connected' }); return; }
    const accessToken = await ensureFreshSuuntoToken(base, headers, conns[0]);
    if (!accessToken) { res.status(200).json({ ok: false, reason: 'token_expired' }); return; }

    if (body.action === 'status') {
      const id = String(body.uploadId || '');
      if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) { res.status(400).json({ error: 'uploadId' }); return; }
      const r = await fetchWithTimeout(`${SUUNTO_API_BASE}/v2/upload/${id}`, { headers: suuntoApiHeaders(accessToken) }, 8000);
      const data = await r.json().catch(() => null);
      res.status(200).json({ ok: r.ok, httpStatus: r.status, status: data && data.status, message: data && data.message, workoutKey: data && data.workoutKey });
      return;
    }

    if (body.action !== 'start') { res.status(400).json({ error: 'action' }); return; }

    // Un envío por minuto como máximo (cada prueba gasta cuota de la Developer API y crea un entrenamiento).
    const allowed = await checkSyncCooldown(base, headers, userId, 'suunto-test', 60000);
    if (!allowed) { res.status(200).json({ ok: false, reason: 'cooldown' }); return; }

    // entre 10 y 25 días atrás y a una hora distinta cada vez
    const startDate = new Date(Date.now() - (10 + Math.floor(Math.random() * 15)) * 86400000 - Math.floor(Math.random() * 6 * 3600000));
    const fit = await buildTestRunFit(startDate);

    const initRes = await fetchWithTimeout(`${SUUNTO_API_BASE}/v2/upload`, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, suuntoApiHeaders(accessToken)),
      body: JSON.stringify({ description: 'Zancada test run', comment: 'Test upload from Zancada (safe to delete)', notifyUser: false })
    }, 10000);
    const init = await initRes.json().catch(() => null);
    if (!initRes.ok || !init || !init.url) {
      res.status(200).json({ ok: false, step: 'init', httpStatus: initRes.status, body: JSON.stringify(init).slice(0, 300) });
      return;
    }

    const putRes = await fetchWithTimeout(init.url, {
      method: init.method || 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/octet-stream' }, init.headers || {}),
      body: fit.bytes
    }, 15000);
    if (!putRes.ok) {
      res.status(200).json({ ok: false, step: 'put', httpStatus: putRes.status, body: (await putRes.text().catch(() => '')).slice(0, 300) });
      return;
    }
    res.status(200).json({ ok: true, uploadId: init.id, putStatus: putRes.status, distanceM: fit.totalDistance, startedAt: startDate.toISOString() });
  } catch (err) {
    console.error('suunto-test-upload error', err);
    await reportError(err, { endpoint: 'suunto-test-upload' });
    res.status(500).json({ error: err.message });
  }
});
