// api/wahoo-sync-plan.js
//
// Deja al día, en la cuenta de Wahoo del usuario, los entrenamientos estructurados del plan de
// Zancada (intervalos y objetivos de pulso que el reloj/ELEMNT muestra durante la sesión). Lo
// llama la app cada vez que cambia el plan -- ver syncPlanToWahoo() en app.js -- y reemplaza al
// envío simple de wahoo-push-workout.js (que solo mandaba nombre y duración de hoy).
//
// Contrato: la app manda SOLO lo que cambió (`days`), las fechas a borrar (`removeDates`) y los
// ids que ya conoce (`known`: { fecha: { workoutId, planId } }); el servidor devuelve los ids
// nuevos (`pushedMap`) para que la app los recuerde. Ver api/_lib/wahoo-plans-sync.js.

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { refreshWahooToken } = require('./_lib/wahoo-activity-helpers');
const { syncWahooPlans } = require('./_lib/wahoo-plans-sync');
const { DATE_RE, cleanZones, cleanLabels, cleanDay, cleanKnown } = require('./_lib/watch-plan-clean');
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
  const days = (Array.isArray(body.days) ? body.days : []).slice(0, MAX_DAYS).map(cleanDay).filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  const removeDates = (Array.isArray(body.removeDates) ? body.removeDates : []).filter(d => DATE_RE.test(String(d))).slice(0, 30);
  const known = cleanKnown(body.known);
  const zones = cleanZones(body.zones);
  const labels = cleanLabels(body.labels);
  const tzOffsetMin = Number.isFinite(Number(body.tzOffsetMin)) ? Math.max(-840, Math.min(840, Number(body.tzOffsetMin))) : 0;

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connRes = await fetch(`${base}/rest/v1/wahoo_connections?user_id=eq.${userId}&select=*`, { headers });
    const conns = await connRes.json();
    if (!conns || !conns.length) { res.status(200).json({ pushed: 0, reason: 'not_connected' }); return; }
    const conn = conns[0];
    let accessToken = conn.access_token;
    if (conn.expires_at < Math.floor(Date.now() / 1000)) {
      const refreshed = await refreshWahooToken(base, headers, userId, conn.refresh_token);
      if (!refreshed) { res.status(200).json({ pushed: 0, reason: 'token_expired' }); return; }
      accessToken = refreshed.accessToken;
    }

    const out = await syncWahooPlans(accessToken, userId, { days, removeDates, zones, labels, tzOffsetMin, known });

    // Marca la semana ya reconciliada para el cron de los lunes (si la columna todavía no existe,
    // el error se ignora): sql/wahoo_plans_week.sql.
    if (!out.failed && !out.reason && DATE_RE.test(String(body.weekStart || ''))) {
      await fetch(`${base}/rest/v1/wahoo_connections?user_id=eq.${userId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ plans_week: body.weekStart })
      }).catch(() => {});
    }

    if (out.firstError) await reportError(new Error(`wahoo plan sync failed: ${out.firstError.step} ${out.firstError.date} -> ${out.firstError.status} ${out.firstError.body}`), { endpoint: 'wahoo-sync-plan' });
    res.status(200).json({
      pushed: out.pushed, removed: out.removed, failed: out.failed,
      pushedMap: out.pushedMap, removedDates: out.removedDates,
      reason: out.reason || ((out.pushed || out.removed || (!days.length && !removeDates.length)) ? undefined : 'wahoo_error')
    });
  } catch (err) {
    console.error('wahoo-sync-plan error', err);
    await reportError(err, { endpoint: 'wahoo-sync-plan' });
    res.status(500).json({ error: err.message });
  }
});
