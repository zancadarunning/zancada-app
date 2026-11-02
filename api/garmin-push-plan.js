// api/garmin-push-plan.js
//
// Manda las sesiones de la semana del plan a Garmin Connect (Training API V2): cada sesión es un entrenamiento (workout) con calentamiento, repeticiones y vuelta a la calma, y se programa
// en su día (schedule). Garmin Connect lo sincroniza al reloj. Mismo contrato que coros-push-plan.js / suunto-push-plan.js: el cliente manda las sesiones ya armadas (watchDayPayload en app.js).
//
// Diferencia con COROS: Garmin deja BORRAR y mover. Una sesión cambiada se borra y se vuelve a crear; una sesión que el plan quitó o movió de día se borra de Garmin.
// Cuota Starter: 100 llamadas por minuto (toda la app) y 200 por día por persona: por eso (a) una huella por sesión evita llamar por lo que no cambió, (b) hay enfriamiento y tope diario.
//
// Los datos que viajan son del plan de la propia persona (nunca datos de Garmin hacia ningún otro lado).

const verifyUser = require('./_lib/verify-user');
const { checkSyncCooldown } = require('./_lib/sync-cooldown');
const { applyCors, isPreflight } = require('./_lib/cors');
const { DATE_RE, cleanZones, cleanDay } = require('./_lib/watch-plan-clean');
const { payloadHash, isDuplicate, remember } = require('./_lib/plan-dedupe');
const { withinDailyCap } = require('./_lib/daily-cap');
const { ensureFreshGarminToken, garminCall, GARMIN_API } = require('./_lib/garmin-activity-helpers');
const { buildGarminWorkout, countSteps } = require('./_lib/garmin-workout-builder');
const { loadKnown, saveKnown, forgetKnown, deleteGarminWorkout } = require('./_lib/garmin-plan-sync');
const { withSentry, reportError } = require('./_lib/sentry');

const MAX_DAYS = 7;
const errText = e => String((e && e.message) || e).slice(0, 300);

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;

  const body = req.body || {};
  const days = (Array.isArray(body.days) ? body.days : []).slice(0, MAX_DAYS).map(cleanDay).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  const keepDates = new Set((Array.isArray(body.keepDates) ? body.keepDates : []).filter(d => DATE_RE.test(String(d))).slice(0, 14));
  const zones = cleanZones(body.zones);
  const today = DATE_RE.test(String(body.today || '')) ? body.today : null;

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  const planHash = payloadHash({ v: 1, days, keepDates: [...keepDates].sort(), zones, today });
  if (body.force !== true && await isDuplicate(base, headers, userId, 'garmin_plan', planHash)) {
    res.status(200).json({ pushed: 0, failed: 0, unchanged: true, pushedDates: days.map(d => d.date) });
    return;
  }
  if (!(await checkSyncCooldown(base, headers, userId, 'garmin-plan', 300000, { failClosed: true }))) { res.status(200).json({ pushed: 0, reason: 'cooldown' }); return; }
  if (!(await withinDailyCap(base, headers, 'garmin-plan', userId, 12, { failClosed: true }))) { res.status(200).json({ pushed: 0, reason: 'cooldown' }); return; }

  try {
    const connRes = await fetch(`${base}/rest/v1/garmin_connections?user_id=eq.${userId}&select=user_id,access_token,refresh_token,expires_at,refresh_expires_at,permissions`, { headers });
    const conns = await connRes.json();
    if (!Array.isArray(conns) || !conns.length) { res.status(200).json({ pushed: 0, reason: 'not_connected' }); return; }
    const conn = conns[0];
    if (Array.isArray(conn.permissions) && conn.permissions.length && !conn.permissions.includes('WORKOUT_IMPORT')) { res.status(200).json({ pushed: 0, reason: 'no_permission' }); return; }
    const accessToken = await ensureFreshGarminToken(base, headers, conn);
    if (!accessToken) { res.status(200).json({ pushed: 0, reason: 'token_expired' }); return; }

    const known = await loadKnown(base, headers, userId, today || '0000-00-00');
    let created = 0, skipped = 0, failed = 0, deleted = 0, firstError = null;
    let stop = null;   // 'rate_limited' | 'no_permission': se corta el envío
    const pushedDates = [];
    const fail = (date, e) => { failed++; if (!firstError) firstError = { date, message: errText(e) }; };
    const classify = r => { if (r.status === 429) return 'rate_limited'; if (r.status === 412 || r.status === 403) return 'no_permission'; return null; };

    for (const day of days) {
      if (stop) break;
      const dayHash = payloadHash({ v: 1, day, zones }).slice(0, 16);
      const rec = known[day.date];
      if (rec && rec.hash === dayHash) { skipped++; pushedDates.push(day.date); continue; }   // sin cambios: no se gasta cuota
      try {
        // cambió (o no existía): se borra lo anterior de esa fecha y se crea de nuevo
        if (rec) { await deleteGarminWorkout(accessToken, rec); await forgetKnown(base, headers, userId, day.date); }
        const workout = buildGarminWorkout(day, zones);
        if (countSteps(workout) > 100) throw new Error('demasiados pasos para Garmin');
        const wr = await garminCall(accessToken, 'POST', `${GARMIN_API}/workoutportal/workout/v2`, workout);
        stop = classify(wr);
        if (stop) break;
        const workoutId = wr.json && wr.json.workoutId != null ? String(wr.json.workoutId) : null;
        if (!wr.ok || !workoutId) throw new Error(`Garmin no creó el entrenamiento (HTTP ${wr.status}) ${wr.text}`);
        const sr = await garminCall(accessToken, 'POST', `${GARMIN_API}/training-api/schedule/`, { workoutId: Number(workoutId), date: day.date });
        stop = classify(sr);
        if (stop || !sr.ok) {
          // no quedó programado: se borra el entrenamiento suelto para no dejar basura en la cuenta de la persona
          await deleteGarminWorkout(accessToken, { workoutId, scheduleId: null }).catch(() => {});
          if (stop) break;
          throw new Error(`Garmin no programó el entrenamiento (HTTP ${sr.status}) ${sr.text}`);
        }
        let scheduleId = sr.json && sr.json.scheduleId != null ? String(sr.json.scheduleId) : '';
        if (!scheduleId) {
          // Garmin puede responder sin cuerpo: se busca la programación recién creada para poder borrarla/moverla después
          try {
            const lr = await garminCall(accessToken, 'GET', `${GARMIN_API}/training-api/schedule?startDate=${day.date}&endDate=${day.date}`);
            const found = (Array.isArray(lr.json) ? lr.json : []).find(x => x && String(x.workoutId) === workoutId && x.scheduleId != null);
            if (found) scheduleId = String(found.scheduleId);
          } catch (e) { /* sin id: al borrar se borra el entrenamiento, que se lleva su programación */ }
        }
        await saveKnown(base, headers, userId, day.date, { workoutId, scheduleId, hash: dayHash });
        created++; pushedDates.push(day.date);
      } catch (e) { fail(day.date, e); }
    }

    // sesiones que el plan quitó o movió de día (fechas futuras que ya no están): se borran de Garmin
    const staleDates = Object.keys(known).filter(d => (!today || d > today) && keepDates.size && !keepDates.has(d) && !days.some(x => x.date === d)).sort();
    if (!stop) {
      for (const date of staleDates.slice(0, 7)) {
        try { if (await deleteGarminWorkout(accessToken, known[date])) { await forgetKnown(base, headers, userId, date); deleted++; } } catch (e) { /* se reintenta en el próximo envío */ }
      }
    }

    if (!failed && !stop) await remember(base, headers, userId, 'garmin_plan', planHash);
    if (firstError) await reportError(new Error(`garmin plan push failed: ${firstError.message}`), { endpoint: 'garmin-push-plan' });
    res.status(200).json({
      pushed: created, created, skipped, failed, deleted, pushedDates, staleDates,
      reason: stop || (created + skipped || !days.length ? undefined : 'garmin_error')
    });
  } catch (err) {
    console.error('garmin-push-plan error', err);
    await reportError(err, { endpoint: 'garmin-push-plan' });
    res.status(500).json({ error: 'Internal error' });
  }
});
