// api/wahoo-plans-cron.js
//
// Cron CADA HORA que sube a Wahoo los entrenamientos de la semana nueva "a las 2 am del lunes"
// (hora LOCAL de cada usuario), aunque nadie abra la app. Es el gemelo de suunto-guides-cron.js:
// la app deja en app_state.data.watchPlan las sesiones ya armadas de esta semana y la próxima; acá
// solo se leen. Mismo chequeo barato de base de datos antes de gastar llamadas a Wahoo (la app en
// modo sandbox permite 25 cada 5 minutos):
//   1. Fecha/hora LOCAL del usuario (app_state.data.profile.tz).
//   2. Si todavía no son las 2:00, o la semana de hoy ya está reconciliada (wahoo_connections.
//      plans_week), no hace nada.
//   3. Si no, sube las sesiones de la semana (de la fecha local de hoy al domingo) y marca la semana.
// No borra lo de la semana pasada (ahorra cuota): la app lo limpia la próxima vez que se abre.
// Sin la columna plans_week no hace nada (si no, repetiría el trabajo TODAS las horas).

const requireCronSecret = require('./_lib/require-cron-secret');
const { rotateForFairness } = require('./_lib/cron-rotation');
const { refreshWahooToken } = require('./_lib/wahoo-activity-helpers');
const { syncWahooPlans } = require('./_lib/wahoo-plans-sync');
const { localDateParts, addDaysIso, mondayOfIso } = require('./_lib/suunto-guides-sync');
const { cleanZones, cleanLabels, cleanDay, cleanKnown } = require('./_lib/watch-plan-clean');
const { withSentry, reportError } = require('./_lib/sentry');

const FIRST_HOUR = 2; // hora local (2:00 am) desde la cual se sube la semana nueva

// Minutos que el huso `tz` está "detrás" de UTC en este instante (igual que Date.getTimezoneOffset()).
function tzOffsetFor(tz, nowMs) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(nowMs));
    const g = (t) => Number(parts.find(p => p.type === t).value);
    const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
    return Math.round((Math.floor(nowMs / 60000) * 60000 - asUtc) / 60000);
  } catch (e) { return 0; }
}

async function processConnection(base, headers, conn, nowMs) {
  if (!('plans_week' in conn)) return 'nocolumn';
  const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}&select=plan:data->watchPlan,tz:data->profile->>tz,auto:data->>watchAutoPush,known:data->wahooSent`, { headers });
  const rows = await stateRes.json();
  const row = Array.isArray(rows) && rows[0];
  if (!row || !row.plan || row.auto === 'false') return 'skip';

  const { date: localDate, hour } = localDateParts(row.tz || 'UTC', nowMs);
  if (hour < FIRST_HOUR) return 'early';
  const weekStart = mondayOfIso(localDate);
  if (conn.plans_week === weekStart) return 'done';

  const weekEnd = addDaysIso(weekStart, 6);
  const days = (Array.isArray(row.plan.days) ? row.plan.days : [])
    .map(cleanDay).filter(d => d && d.date >= weekStart && d.date <= weekEnd && d.date >= localDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  let accessToken = conn.access_token;
  if (conn.expires_at < Math.floor(nowMs / 1000)) {
    const refreshed = await refreshWahooToken(base, headers, conn.user_id, conn.refresh_token);
    if (!refreshed) return 'token';
    accessToken = refreshed.accessToken;
  }

  // wahooSent guarda { fecha: { sig, workoutId, planId } }; acá solo importan los ids.
  const knownRaw = {};
  if (row.known && typeof row.known === 'object') {
    for (const [k, v] of Object.entries(row.known)) knownRaw[k] = { workoutId: v && v.workoutId, planId: v && v.planId };
  }
  const out = await syncWahooPlans(accessToken, conn.user_id, {
    days, removeDates: [], zones: cleanZones(row.plan.zones), labels: cleanLabels(row.plan.labels),
    tzOffsetMin: tzOffsetFor(row.tz, nowMs), known: cleanKnown(knownRaw)
  });
  if (out.failed || out.reason) return 'error';

  await fetch(`${base}/rest/v1/wahoo_connections?user_id=eq.${conn.user_id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ plans_week: weekStart })
  }).catch(() => {});
  return 'synced';
}

module.exports = withSentry(async (req, res) => {
  if (!(await requireCronSecret(req))) return res.status(401).json({ error: 'Unauthorized' });

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connsRes = await fetch(`${base}/rest/v1/wahoo_connections?select=*`, { headers });
    const conns = await connsRes.json();
    const list = rotateForFairness(Array.isArray(conns) ? conns : [], 3600 * 1000);

    const CRON_TIME_BUDGET_MS = 8000;
    const start = Date.now();
    const tally = { synced: 0, done: 0, early: 0, skip: 0, token: 0, error: 0, nocolumn: 0, budget: 0 };
    for (const conn of list) {
      if (Date.now() - start > CRON_TIME_BUDGET_MS) { tally.budget++; continue; }
      try {
        const r = await processConnection(base, headers, conn, Date.now());
        tally[r] = (tally[r] || 0) + 1;
      } catch (e) {
        tally.error++;
        console.error('wahoo-plans-cron: error for user', conn.user_id, e && e.message);
      }
    }
    res.status(200).json(Object.assign({ total: list.length }, tally));
  } catch (err) {
    console.error('wahoo-plans-cron error', err);
    await reportError(err, { endpoint: 'wahoo-plans-cron' });
    res.status(500).json({ error: err.message });
  }
});
