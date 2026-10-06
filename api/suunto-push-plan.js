// api/suunto-push-plan.js
//
// Mantiene al día, en la cuenta de Suunto del usuario, las próximas sesiones del plan como
// "SuuntoPlus Guides" (pasos, repeticiones y objetivos de pulso que el reloj muestra durante el
// entreno). La guía aparece primero en la app de Suunto y baja al reloj cuando éste se
// sincroniza. Requiere un reloj Suunto compatible emparejado para verse en la app.
//
// A diferencia de wahoo-push-workout.js (un workout simple), acá sí van los intervalos
// estructurados -- ver api/_lib/suunto-guide-builder.js para el formato.
//
// El cliente (app.js) ya sabe armar la descripción de cada sesión (planLabel(), estructura de
// series/cuestas/fartlek, zonas de pulso propias del corredor): este endpoint no repite esa
// lógica, solo valida lo que llega, arma el ZIP y lo sube con el token guardado.
//
// DOS MODOS (los dos usan externalId "zancada-<fecha>" para reconocer cada guía):
//   - Manual (reconcile ausente): sube/actualiza los `days` recibidos y borra las guías de
//     Zancada de fechas ANTERIORES a `today` (el reloj tiene espacio limitado).
//   - Reconcile (reconcile:true): es el que usa la sincronización automática. `keepDates` es el
//     conjunto COMPLETO de fechas que tienen que existir; `days` trae solo las que cambiaron
//     desde el último envío. Se suben/actualizan esos `days` y se BORRA toda guía de Zancada
//     cuya fecha ya no esté en keepDates (sesión cancelada, hecha, movida, semana nueva) --
//     incluso si keepDates viene vacío. Así el plan en Suunto sigue al plan de Zancada sin que
//     nadie tenga que tocar nada.
//
// Cuida la cuota de la Developer API de Suunto (200 llamadas por semana): 1 llamada de listado
// + 1 por guía que cambió + 1 por guía que sobra.
//
// Las guías se suben de la fecha MÁS LEJANA a la más cercana: Suunto borra solo las guías más
// viejas cuando el reloj se queda sin espacio, así que las de hoy y mañana son las últimas en
// llegar y las que más tardan en ser desplazadas.

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { ensureFreshSuuntoToken } = require('./_lib/suunto-activity-helpers');
const { listZancadaGuides, syncGuides } = require('./_lib/suunto-guides-sync');
const { DATE_RE, cleanZones, cleanLabels, cleanDay } = require('./_lib/watch-plan-clean');
const { withSentry, reportError } = require('./_lib/sentry');

const MAX_DAYS = 14;

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;

  const body = req.body || {};
  const reconcile = body.reconcile === true;
  const days = (Array.isArray(body.days) ? body.days : []).slice(0, MAX_DAYS).map(cleanDay).filter(Boolean);
  const keepDates = reconcile
    ? new Set((Array.isArray(body.keepDates) ? body.keepDates : []).filter(d => DATE_RE.test(String(d))).slice(0, MAX_DAYS))
    : null;
  // En reconcile, una lista vacía de `days` es válida (puede haber solo cosas para borrar).
  if (!days.length && !reconcile) { res.status(400).json({ error: 'No hay sesiones válidas para enviar' }); return; }
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

    // Guías que ya tiene el usuario (para actualizar en vez de duplicar, y limpiar las que sobran).
    // Sin la lista no se puede reconciliar con seguridad (se podrían duplicar guías): se corta
    // y la sincronización automática lo reintenta en el próximo cambio.
    const found = await listZancadaGuides(accessToken);
    if (found.forbidden) { res.status(200).json({ pushed: 0, reason: 'guides_forbidden' }); return; }
    if (!found.ok) { res.status(200).json({ pushed: 0, reason: found.rateLimited ? 'rate_limited' : 'suunto_error' }); return; }

    const out = await syncGuides(accessToken, { days, zones, labels, keepDates, today, existing: found });
    const { pushed, failed, removed, pushedDates, firstError } = out;
    if (out.rateLimited) { res.status(200).json({ pushed, failed, removed: 0, pushedDates, reason: 'rate_limited' }); return; }

    // Marca la semana ya reconciliada: el cron de los lunes (suunto-guides-cron.js) la usa para
    // no repetir el trabajo. Si la columna todavía no existe (sql/suunto_guides_week.sql sin
    // correr) el error se ignora.
    if (reconcile && DATE_RE.test(String(body.weekStart || '')) && !failed) {
      await fetch(`${base}/rest/v1/suunto_connections?user_id=eq.${userId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ guides_week: body.weekStart })
      }).catch(() => {});
    }

    if (firstError) await reportError(new Error(`suunto guide upload failed: ${firstError.method} ${firstError.externalId} -> ${firstError.status} ${firstError.body}`), { endpoint: 'suunto-push-plan' });
    res.status(200).json({ pushed, failed, removed, pushedDates, reason: (pushed || removed || !days.length) ? undefined : 'suunto_error' });
  } catch (err) {
    console.error('suunto-push-plan error', err);
    await reportError(err, { endpoint: 'suunto-push-plan' });
    res.status(500).json({ error: err.message });
  }
});
