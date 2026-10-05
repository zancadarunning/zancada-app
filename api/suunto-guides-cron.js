// api/suunto-guides-cron.js
//
// Cron CADA HORA que sube las guías de la semana nueva a Suunto "a las 2 am del lunes"
// (2:00 am, hora LOCAL de cada usuario), aunque nadie abra la app. Pedido del usuario: que los
// ejercicios de la semana ya estén en Suunto el lunes a primera hora, sin tener que entrar a
// Zancada para que se sincronicen.
//
// Cómo funciona sin abrir la app: cada vez que cambia algo, la app guarda en
// app_state.data.suuntoPlan las sesiones ya armadas de esta semana Y de la que viene (con las
// zonas de pulso y los textos traducidos), y a esta función le alcanza con leerlas. Cada
// corrida, por cuenta:
//   1. Mira la fecha/hora LOCAL del usuario (app_state.data.profile.tz).
//   2. Si todavía no son las 2:00 am, o ya reconcilió la semana de hoy (suunto_connections.
//      guides_week), no hace nada -- el chequeo es solo de base de datos, no gasta ninguna
//      llamada a Suunto (la Developer API permite 200 por semana).
//   3. Si no, reconcilia: sube las sesiones de la semana actual, borra las guías que sobran
//      (las de la semana pasada) y marca la semana en guides_week.
// Si el usuario abre la app el lunes antes de las 2, la propia app ya reconcilia (y marca
// guides_week), y este cron no repite nada.

const requireCronSecret = require('./_lib/require-cron-secret');
const { ensureFreshSuuntoToken } = require('./_lib/suunto-activity-helpers');
const { syncGuides, localDateParts, addDaysIso, mondayOfIso, DATE_RE } = require('./_lib/suunto-guides-sync');
const { withSentry, reportError } = require('./_lib/sentry');

const FIRST_HOUR = 2; // hora local (2:00 am) desde la cual se sube la semana nueva

// Valida lo que la app dejó guardado (un cliente podría haber guardado cualquier cosa).
function cleanStoredDay(d) {
  if (!d || !DATE_RE.test(String(d.date || ''))) return null;
  const distKm = Number(d.distKm);
  if (!(distKm > 0) || distKm > 500) return null;
  const iv = d.interval && typeof d.interval === 'object' ? {
    reps: Number(d.interval.reps), repMeters: Number(d.interval.repMeters),
    recoveryMin: Number(d.interval.recoveryMin), workMin: Number(d.interval.workMin), restMin: Number(d.interval.restMin)
  } : null;
  return {
    date: d.date, name: String(d.name || '').slice(0, 60), typeKey: String(d.typeKey || '').slice(0, 30),
    zone: d.zone == null ? null : Number(d.zone), distKm, desc: String(d.desc || '').slice(0, 2000),
    interval: iv, repSec: Number(d.repSec) > 0 ? Number(d.repSec) : 0
  };
}
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
  for (const k of ['warmup', 'cooldown', 'work', 'rest', 'main']) if (labels && typeof labels[k] === 'string') out[k] = labels[k].slice(0, 40);
  return out;
}

async function processConnection(base, headers, conn, nowMs) {
  // Sin la columna guides_week (sql/suunto_guides_week.sql sin correr) no hay forma de recordar qué semana
  // ya se hizo, y el cron repetiría el trabajo TODAS las horas gastando la cuota de Suunto: mejor no hacer nada.
  if (!('guides_week' in conn)) return 'nocolumn';
  const stateRes = await fetch(`${base}/rest/v1/app_state?user_id=eq.${conn.user_id}&select=plan:data->suuntoPlan,tz:data->profile->>tz,auto:data->>suuntoAutoPush`, { headers });
  const rows = await stateRes.json();
  const row = Array.isArray(rows) && rows[0];
  if (!row || !row.plan || row.auto === 'false') return 'skip';

  const { date: localDate, hour } = localDateParts(row.tz || 'UTC', nowMs);
  if (hour < FIRST_HOUR) return 'early';
  const weekStart = mondayOfIso(localDate);
  if (conn.guides_week === weekStart) return 'done';

  const weekEnd = addDaysIso(weekStart, 6);
  const days = (Array.isArray(row.plan.days) ? row.plan.days : [])
    .map(cleanStoredDay).filter(d => d && d.date >= weekStart && d.date <= weekEnd && d.date >= localDate);
  const keepDates = new Set(days.map(d => d.date));

  const accessToken = await ensureFreshSuuntoToken(base, headers, conn);
  if (!accessToken) return 'token';

  const out = await syncGuides(accessToken, { days, zones: cleanZones(row.plan.zones), labels: cleanLabels(row.plan.labels), keepDates, today: localDate });
  if (out.listFailed || out.failed) return 'error';

  await fetch(`${base}/rest/v1/suunto_connections?user_id=eq.${conn.user_id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ guides_week: weekStart })
  }).catch(() => {});
  return 'synced';
}

module.exports = withSentry(async (req, res) => {
  if (!(await requireCronSecret(req))) return res.status(401).json({ error: 'Unauthorized' });

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const connsRes = await fetch(`${base}/rest/v1/suunto_connections?select=*`, { headers });
    const conns = await connsRes.json();
    const list = Array.isArray(conns) ? conns : [];

    const CRON_TIME_BUDGET_MS = 8000;
    const start = Date.now();
    const tally = { synced: 0, done: 0, early: 0, skip: 0, token: 0, error: 0, budget: 0 };
    for (const conn of list) {
      if (Date.now() - start > CRON_TIME_BUDGET_MS) { tally.budget++; continue; }
      try {
        const r = await processConnection(base, headers, conn, Date.now());
        tally[r] = (tally[r] || 0) + 1;
      } catch (e) {
        tally.error++;
        console.error('suunto-guides-cron: error for user', conn.user_id, e && e.message);
      }
    }
    res.status(200).json(Object.assign({ total: list.length }, tally));
  } catch (err) {
    console.error('suunto-guides-cron error', err);
    await reportError(err, { endpoint: 'suunto-guides-cron' });
    res.status(500).json({ error: err.message });
  }
});
