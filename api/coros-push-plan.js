// api/coros-push-plan.js
//
// Deja al día, en el calendario de COROS del usuario, las sesiones de la semana del plan de Zancada (el reloj las muestra como entrenamientos del día). Lo llama la app cada vez que
// cambia el plan (ver syncPlanToCoros() en app.js), igual que Wahoo y Suunto. Usa el MCP de COROS con la conexión que ya tiene el usuario (sin aprobación de partner).
//
// LÍMITE DE COROS (por MCP): se puede CREAR y ACTUALIZAR un entrenamiento agendado, pero NO borrarlo ni moverlo (eso solo se hace en la app de COROS). Por eso:
//   1) si el plan cambia la sesión de una fecha, se ACTUALIZA el entrenamiento ya enviado (updateScheduledWorkout), no se crea otro;
//   2) si una sesión ya enviada desaparece del plan (cancelada o movida), no se la puede borrar: se devuelve en `staleDates` y la app le avisa a la persona que la quite en COROS.
// Qué entrenamiento corresponde a cada fecha lo recuerda el SERVIDOR (tabla sent_notifications, tipo 'coros_id', período 'fecha|idInPlan'): sirve aunque la persona use dos teléfonos.
//
// ESTADO: probado de punta a punta el 2026-10-26 con una cuenta real (los entrenamientos aparecen en el calendario de COROS con duración, distancia, pulso y carga). Habilitado para todos;
// COROS_PLAN_PUSH=0 en Vercel lo pausa. El formato sigue el esquema real publicado por el MCP de COROS (ver coros-workout-builder.js).

const { decToken } = require('./_lib/token-crypto');
const verifyUser = require('./_lib/verify-user');
const { checkSyncCooldown } = require('./_lib/sync-cooldown');
const { applyCors, isPreflight } = require('./_lib/cors');
const { DATE_RE, cleanZones, cleanLabels, cleanDay } = require('./_lib/watch-plan-clean');
const { payloadHash, isDuplicate, remember } = require('./_lib/plan-dedupe');
const { withinDailyCap } = require('./_lib/daily-cap');
const { callCorosMcpTool, refreshCorosToken } = require('./_lib/coros-activity-helpers');
const { buildCorosCourse, corosDate, extractIdInPlan } = require('./_lib/coros-workout-builder');
const { withSentry, reportError } = require('./_lib/sentry');

const MAX_DAYS = 7;
const KIND = 'coros_id';
const NOT_FOUND_RE = /not\s*found|does not exist|no longer exists|doesn'?t exist|不存在/i;
const NOT_EDITABLE_RE = /not\s+editable|cannot be (edited|modified|updated)|completed|already (done|finished)|past date|read[- ]only/i;

function adminList() {
  return String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}
const REJECT_RE = /reject|invalid|error|fail|not allowed|must be|is required|violat|cannot|unable|denied/i;
const errText = e => String((e && e.message) || e).slice(0, 400);

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;

  const isAdmin = !!(auth.emailConfirmed && auth.email && adminList().includes(String(auth.email).toLowerCase()));
  // Habilitado para todos. COROS_PLAN_PUSH=0 en Vercel lo pausa (el admin sigue pudiendo probar): interruptor de emergencia si COROS cambia algo o aparece un problema.
  if (process.env.COROS_PLAN_PUSH === '0' && !isAdmin) { res.status(200).json({ pushed: 0, reason: 'not_enabled' }); return; }

  const body = req.body || {};
  const days = (Array.isArray(body.days) ? body.days : []).slice(0, MAX_DAYS).map(cleanDay).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  const keepDates = new Set((Array.isArray(body.keepDates) ? body.keepDates : []).filter(d => DATE_RE.test(String(d))).slice(0, 14));
  const zones = cleanZones(body.zones);
  const labels = cleanLabels(body.labels);
  const today = DATE_RE.test(String(body.today || '')) ? body.today : null;

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  // v: versión del envío. Subirla invalida lo "ya enviado" recordado (la v1 contaba como enviados entrenamientos que COROS no había confirmado)
  const planHash = payloadHash({ v: 2, days, keepDates: [...keepDates].sort(), zones, labels, today });
  if (body.force !== true && await isDuplicate(base, headers, userId, 'coros_plan', planHash)) {
    res.status(200).json({ pushed: 0, failed: 0, unchanged: true, pushedDates: days.map(d => d.date) });
    return;
  }
  if (!(await checkSyncCooldown(base, headers, userId, 'coros-plan', 300000, { failClosed: true }))) { res.status(200).json({ pushed: 0, reason: 'cooldown' }); return; }
  if (!(await withinDailyCap(base, headers, 'coros-plan', userId, 24, { failClosed: true }))) { res.status(200).json({ pushed: 0, reason: 'cooldown' }); return; }

  try {
    const connRes = await fetch(`${base}/rest/v1/coros_connections?user_id=eq.${userId}&select=*`, { headers });
    const conns = await connRes.json();
    if (!Array.isArray(conns) || !conns.length) { res.status(200).json({ pushed: 0, reason: 'not_connected' }); return; }
    const conn = conns[0];
    let accessToken = decToken(conn.access_token);
    if (conn.expires_at < Math.floor(Date.now() / 1000)) {
      const refreshed = await refreshCorosToken(base, headers, userId, decToken(conn.refresh_token));
      if (!refreshed) { res.status(200).json({ pushed: 0, reason: 'token_expired' }); return; }
      accessToken = refreshed.accessToken;
    }

    // qué entrenamiento de COROS corresponde a cada fecha (la memoria vive en el servidor)
    const idByDate = {};
    try {
      const fromDate = today || '0000-00-00';
      const r = await fetch(`${base}/rest/v1/sent_notifications?user_id=eq.${userId}&kind=eq.coros_id&period=gte.${encodeURIComponent(fromDate)}&select=period&limit=60`, { headers });
      const rows = r.ok ? await r.json() : [];
      for (const row of Array.isArray(rows) ? rows : []) {
        const m = String(row.period).match(/^(\d{4}-\d{2}-\d{2})\|(\d{1,30})$/);
        if (m) idByDate[m[1]] = m[2];
      }
    } catch (e) { /* sin memoria: se crean de nuevo (peor caso: un entrenamiento repetido) */ }

    const saveId = async (date, id) => {
      try {
        await fetch(`${base}/rest/v1/sent_notifications?user_id=eq.${userId}&kind=eq.coros_id&period=like.${encodeURIComponent(date + '|')}*`, { method: 'DELETE', headers });
        await fetch(`${base}/rest/v1/sent_notifications`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ user_id: userId, kind: KIND, period: `${date}|${id}` }) });
      } catch (e) { /* no es crítico */ }
    };

    let created = 0, updated = 0, skipped = 0, failed = 0, noId = 0, firstError = null;
    const raws = [];   // respuesta cruda de COROS (solo se devuelve al admin): una herramienta puede rechazar el entrenamiento con un texto normal, sin marcarlo como error
    const rawOf = r => String(typeof r === 'string' ? r : JSON.stringify(r)).slice(0, 600);
    const pushedDates = [];
    const fail = (date, e) => { failed++; if (!firstError) firstError = { date, message: errText(e) }; };

    for (const day of days) {
      const course = buildCorosCourse(day, zones, labels);
      const date8 = corosDate(day.date);
      let done = false;
      const knownId = idByDate[day.date];
      if (knownId) {
        try {
          const r = await callCorosMcpTool(accessToken, 'updateScheduledWorkout', { date: date8, idInPlan: String(knownId), course });
          if (raws.length < 3) raws.push({ date: day.date, tool: 'update', raw: rawOf(r) });
          if (!extractIdInPlan(r) && REJECT_RE.test(rawOf(r))) throw new Error('COROS rechazó la actualización: ' + rawOf(r));
          const newId = extractIdInPlan(r) || knownId;
          if (newId !== knownId) await saveId(day.date, newId);
          updated++; pushedDates.push(day.date); done = true;
        } catch (e) {
          const msg = errText(e);
          if (NOT_FOUND_RE.test(msg)) { /* la borraron a mano en COROS: se vuelve a crear */ }
          else if (NOT_EDITABLE_RE.test(msg)) { skipped++; pushedDates.push(day.date); done = true; }   // hecha o pasada: no se toca (y no se crea otra encima)
          else { fail(day.date, e); done = true; }
        }
      }
      if (!done) {
        try {
          const r = await callCorosMcpTool(accessToken, 'createScheduledWorkout', { date: date8, course });
          if (raws.length < 3) raws.push({ date: day.date, tool: 'create', raw: rawOf(r) });
          const newId = extractIdInPlan(r);
          // sin idInPlan COROS no confirmó que lo guardó (o lo rechazó con un texto normal): NO se cuenta como enviado
          if (!newId) { noId++; throw new Error('COROS no confirmó el entrenamiento (sin idInPlan): ' + rawOf(r)); }
          await saveId(day.date, newId);
          created++; pushedDates.push(day.date);
        } catch (e) { fail(day.date, e); }
      }
    }

    // sesiones ya enviadas que el plan quitó (o movió): COROS no deja borrarlas por MCP -> se le avisa a la persona. Hoy no cuenta: una sesión de hoy que falta en el plan suele ser una hecha
    // (el plan ya no la lista), no una sobrante
    const staleDates = Object.keys(idByDate).filter(d => (!today || d > today) && keepDates.size && !keepDates.has(d)).sort();

    if (!failed) await remember(base, headers, userId, 'coros_plan', planHash);
    if (firstError) await reportError(new Error(`coros plan push failed: ${firstError.message}`), { endpoint: 'coros-push-plan' });
    res.status(200).json({
      pushed: created + updated, created, updated, skipped, failed, noId, pushedDates, staleDates,
      reason: (created + updated + skipped || !days.length) ? undefined : 'coros_error',
      debug: isAdmin ? { firstError: firstError || undefined, raws } : undefined
    });
  } catch (err) {
    console.error('coros-push-plan error', err);
    await reportError(err, { endpoint: 'coros-push-plan' });
    res.status(500).json({ error: 'Internal error' });
  }
});
