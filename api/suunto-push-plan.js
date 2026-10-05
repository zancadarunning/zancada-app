// api/suunto-push-plan.js
//
// Manda las próximas sesiones del plan al reloj Suunto del usuario como "SuuntoPlus Guides"
// (pasos, repeticiones y objetivos de pulso que el reloj muestra durante el entreno). La guía
// aparece primero en la app de Suunto y baja al reloj cuando éste se sincroniza.
//
// A diferencia de wahoo-push-workout.js (un workout simple), acá sí van los intervalos
// estructurados -- ver api/_lib/suunto-guide-builder.js para el formato.
//
// El cliente (app.js) ya sabe armar la descripción de cada sesión (planLabel(), estructura de
// series/cuestas/fartlek, zonas de pulso propias del corredor): este endpoint no repite esa
// lógica, solo valida lo que llega, arma el ZIP y lo sube con el token guardado.
//
// Cada guía lleva externalId "zancada-<fecha>": si ya existe una para esa fecha (el usuario
// tocó el botón dos veces, o cambió el plan), se ACTUALIZA en vez de duplicarla (Suunto
// responde 409 si se intenta crear una con el mismo externalId). Las guías de Zancada de
// fechas pasadas se borran para no ocupar el espacio limitado del reloj.

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { fetchWithTimeout } = require('./_lib/fetch-with-timeout');
const {
  SUUNTO_API_BASE, suuntoApiHeaders, ensureFreshSuuntoToken
} = require('./_lib/suunto-activity-helpers');
const { buildGuide, buildGuideZip } = require('./_lib/suunto-guide-builder');
const { withSentry, reportError } = require('./_lib/sentry');

const GUIDES = `${SUUNTO_API_BASE}/v2/guides`;
const MAX_DAYS = 7;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanZones(zones) {
  const out = {};
  for (let n = 1; n <= 5; n++) {
    const z = zones && zones[n];
    if (z && Number.isFinite(Number(z.min)) && Number.isFinite(Number(z.max))) out[n] = { min: Number(z.min), max: Number(z.max) };
  }
  return out;
}

function cleanLabels(labels) {
  const out = {};
  for (const k of ['warmup', 'cooldown', 'work', 'rest', 'main']) {
    if (labels && typeof labels[k] === 'string') out[k] = labels[k].slice(0, 40);
  }
  return out;
}

function cleanDay(d) {
  if (!d || !DATE_RE.test(String(d.date || ''))) return null;
  const distKm = Number(d.distKm);
  if (!(distKm > 0) || distKm > 500) return null;
  const iv = d.interval && typeof d.interval === 'object' ? {
    reps: Number(d.interval.reps), repMeters: Number(d.interval.repMeters),
    recoveryMin: Number(d.interval.recoveryMin), workMin: Number(d.interval.workMin), restMin: Number(d.interval.restMin)
  } : null;
  return {
    date: d.date,
    name: String(d.name || '').slice(0, 60),
    typeKey: String(d.typeKey || '').slice(0, 30),
    zone: d.zone == null ? null : Number(d.zone),
    distKm,
    desc: String(d.desc || '').slice(0, 2000),
    interval: iv,
    repSec: Number(d.repSec) > 0 ? Number(d.repSec) : 0
  };
}

async function guidesRequest(path, accessToken, init) {
  const headers = Object.assign(suuntoApiHeaders(accessToken), init && init.headers);
  return fetchWithTimeout(`${GUIDES}${path}`, Object.assign({}, init, { headers }), 10000);
}

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;

  const body = req.body || {};
  const days = (Array.isArray(body.days) ? body.days : []).slice(0, MAX_DAYS).map(cleanDay).filter(Boolean);
  if (!days.length) { res.status(400).json({ error: 'No hay sesiones válidas para enviar' }); return; }
  const zones = cleanZones(body.zones);
  const labels = cleanLabels(body.labels);
  const today = DATE_RE.test(String(body.today || '')) ? body.today : null;

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connRes = await fetch(`${base}/rest/v1/suunto_connections?user_id=eq.${userId}&select=*`, { headers });
    const conns = await connRes.json();
    if (!conns || !conns.length) { res.status(200).json({ pushed: 0, reason: 'not_connected' }); return; }
    const accessToken = await ensureFreshSuuntoToken(base, headers, conns[0]);
    if (!accessToken) { res.status(200).json({ pushed: 0, reason: 'token_expired' }); return; }

    // Guías que ya tiene el usuario (para actualizar en vez de duplicar, y limpiar las viejas).
    let existing = [];
    const listRes = await guidesRequest('/items', accessToken, { method: 'GET' });
    if (listRes.status === 403) { res.status(200).json({ pushed: 0, reason: 'guides_forbidden' }); return; }
    if (listRes.ok) {
      const listData = await listRes.json().catch(() => null);
      existing = (listData && Array.isArray(listData.payload)) ? listData.payload : [];
    }
    const mine = existing.filter(g => g && g.owner === 'Zancada' && typeof g.externalId === 'string' && g.externalId.startsWith('zancada-'));

    let pushed = 0, failed = 0, firstError = null;
    for (const day of days) {
      const guide = buildGuide(day, zones, labels);
      const zip = buildGuideZip(guide);
      const prior = mine.find(g => g.externalId === guide.externalId);
      const r = await guidesRequest(prior ? `/files/${encodeURIComponent(prior.id)}` : '/files', accessToken, {
        method: prior ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: zip
      });
      if (r.ok) { pushed++; continue; }
      failed++;
      if (!firstError) firstError = { status: r.status, body: (await r.text().catch(() => '')).slice(0, 300) };
      console.error('suunto-push-plan: guide upload failed', guide.externalId, r.status);
    }

    // Limpieza: guías de Zancada de fechas anteriores a hoy (el reloj tiene espacio limitado).
    if (today) {
      for (const g of mine) {
        const ext = String(g.externalId).slice('zancada-'.length);
        if (DATE_RE.test(ext) && ext < today) {
          await guidesRequest(`/files/${encodeURIComponent(g.id)}`, accessToken, { method: 'DELETE' }).catch(() => {});
        }
      }
    }

    if (firstError) await reportError(new Error(`suunto guide upload failed: ${firstError.status} ${firstError.body}`), { endpoint: 'suunto-push-plan' });
    res.status(200).json({ pushed, failed, reason: pushed ? undefined : 'suunto_error' });
  } catch (err) {
    console.error('suunto-push-plan error', err);
    await reportError(err, { endpoint: 'suunto-push-plan' });
    res.status(500).json({ error: err.message });
  }
});
