// api/_lib/wahoo-plans-sync.js
//
// Lógica compartida para dejar al día los entrenamientos estructurados de Zancada en la cuenta de
// Wahoo del usuario: la usan el endpoint que llama la app (wahoo-sync-plan.js) y el cron de los
// lunes (wahoo-plans-cron.js).
//
// Cómo funciona Wahoo (documentación: cloud-api.wahooligan.com): crear un entrenamiento
// estructurado son DOS pasos -- (1) POST /v1/plans con el archivo plan.json (en base64) para
// guardar el plan en la biblioteca del usuario, (2) POST /v1/workouts con workout[plan_id] para
// agendarlo. Un workout se actualiza con PUT /v1/workouts/:id y se borra con DELETE; un plan,
// con PUT/DELETE /v1/plans/:id (solo los que creó esta app).
//
// Decisiones de diseño:
//   - Cada workout lleva workout_token = "zancada_<userId>_<fecha>" (el mismo que ya usaba el
//     envío simple de wahoo-push-workout.js), así se reconoce el de cada fecha y se ADOPTA uno
//     viejo en vez de duplicarlo.
//   - Wahoo exige un external_id único por plan y NO se pueden leer planes sin el permiso
//     plans_read (la app solo pide plans_write), así que cuando una sesión cambia se crea un plan
//     NUEVO (external_id = "zancada-<fecha>-<hash del contenido>"), el workout pasa a apuntar a
//     él y se borra el plan viejo. El id del plan viejo sale del propio workout (plan_id).
//   - Cuota: la app en modo sandbox permite 25 llamadas cada 5 minutos, 100 por hora y 250 por
//     día (200/1000/5000 en producción). Cada llamada lee los headers X-RateLimit-Remaining y, si
//     queda casi nada, corta y devuelve reason "rate_limited": la app reintenta más tarde.

const { fetchWithTimeout } = require('./fetch-with-timeout');
const { buildWahooPlan, planToDataUri, planHash, workoutStartsISO } = require('./wahoo-plan-builder');

const API = 'https://api.wahooligan.com';
const RUNNING_OUTDOOR = 1; // workout_type_id

function makeCtx(accessToken, userId) {
  return { accessToken, userId, stopped: false, workouts: null };
}

function tokenFor(userId, date) { return `zancada_${userId}_${date}`; }

// Pedido a Wahoo con control de cuota. Después de una respuesta con poca cuota restante (o un 429)
// se marca ctx.stopped y los pedidos siguientes se cancelan.
async function wf(ctx, path, init) {
  if (ctx.stopped) { const e = new Error('rate limited'); e.rateLimited = true; throw e; }
  const headers = Object.assign({ Authorization: `Bearer ${ctx.accessToken}` }, init && init.headers);
  const res = await fetchWithTimeout(API + path, Object.assign({}, init, { headers }), 12000);
  const raw = res.headers && res.headers.get ? res.headers.get('x-ratelimit-remaining') : null;
  const rem = String(raw || '').split(',').map(s => Number(s.trim()));
  if (res.status === 429 || (rem.length >= 3 && rem.slice(0, 3).some(n => Number.isFinite(n) && n <= 1))) ctx.stopped = true;
  return res;
}

function formBody(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v != null) p.append(k, String(v));
  return p;
}

// Lista (una vez por sincronización) los workouts de Zancada que ya hay en la cuenta.
async function loadZancadaWorkouts(ctx) {
  if (ctx.workouts) return ctx.workouts;
  const prefix = `zancada_${ctx.userId}_`;
  const found = new Map();
  for (let page = 1; page <= 2; page++) {
    const r = await wf(ctx, `/v1/workouts?page=${page}&per_page=30`, { method: 'GET' });
    if (!r.ok) break;
    const data = await r.json().catch(() => null);
    const list = (data && data.workouts) || [];
    for (const w of list) {
      if (w && typeof w.workout_token === 'string' && w.workout_token.startsWith(prefix)) {
        found.set(w.workout_token.slice(prefix.length), { id: w.id, planId: w.plan_id || (Array.isArray(w.plan_ids) ? w.plan_ids[0] : null) || null });
      }
    }
    if (list.length < 30) break;
  }
  ctx.workouts = found;
  return found;
}

// POST /v1/plans. La documentación dice JSON pero sus ejemplos van form-urlencoded: se prueba el
// formato de los ejemplos y, si el servidor lo rechaza por formato, el JSON.
async function createPlan(ctx, plan, externalId, filename) {
  const fields = {
    'plan[file]': planToDataUri(plan),
    'plan[filename]': filename,
    'plan[external_id]': externalId,
    'plan[provider_updated_at]': new Date().toISOString()
  };
  let r = await wf(ctx, '/v1/plans', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formBody(fields) });
  if (!r.ok && [400, 415, 422].includes(r.status) && !ctx.stopped) {
    r = await wf(ctx, '/v1/plans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: { file: fields['plan[file]'], filename, external_id: externalId, provider_updated_at: fields['plan[provider_updated_at]'] } })
    });
  }
  if (!r.ok) return { ok: false, status: r.status, body: (await r.text().catch(() => '')).slice(0, 300) };
  const data = await r.json().catch(() => null);
  return data && data.id ? { ok: true, id: data.id } : { ok: false, status: r.status, body: 'sin id en la respuesta' };
}

// Crea o actualiza el workout de una fecha apuntando al plan indicado. Devuelve { ok, id }.
async function upsertWorkout(ctx, existingId, day, planId, tzOffsetMin) {
  const fields = {
    'workout[name]': String(day.name || 'Zancada').slice(0, 100),
    'workout[workout_token]': tokenFor(ctx.userId, day.date),
    'workout[workout_type_id]': RUNNING_OUTDOOR,
    'workout[starts]': workoutStartsISO(day.date, tzOffsetMin),
    'workout[minutes]': Math.min(600, Math.max(5, Math.round(Number(day.durMin) || 30))),
    'workout[plan_id]': planId
  };
  const r = await wf(ctx, existingId ? `/v1/workouts/${encodeURIComponent(existingId)}` : '/v1/workouts', {
    method: existingId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody(fields)
  });
  if (!r.ok) return { ok: false, status: r.status, body: (await r.text().catch(() => '')).slice(0, 300) };
  const data = await r.json().catch(() => null);
  return { ok: true, id: (data && data.id) || existingId };
}

async function deleteQuiet(ctx, path) {
  try { const r = await wf(ctx, path, { method: 'DELETE' }); return r.ok || r.status === 404; }
  catch (e) { if (e.rateLimited) throw e; return false; }
}

// Sube/actualiza una sesión. known = { workoutId, planId } que la app recuerda (o null).
async function pushDay(ctx, day, { zones, labels, tzOffsetMin, known }) {
  let existing = known && known.workoutId ? { id: known.workoutId, planId: known.planId || null } : null;
  if (!existing) existing = (await loadZancadaWorkouts(ctx)).get(day.date) || null;

  const plan = buildWahooPlan(day, zones, labels);
  const externalId = `zancada-${day.date}-${planHash(plan)}`;
  const created = await createPlan(ctx, plan, externalId, `${externalId}.json`);
  if (!created.ok) return { ok: false, step: 'plan', status: created.status, body: created.body };

  let w = await upsertWorkout(ctx, existing && existing.id, day, created.id, tzOffsetMin);
  // El workout recordado ya no existe (borrado a mano): se crea de nuevo.
  if (!w.ok && existing && w.status === 404) w = await upsertWorkout(ctx, null, day, created.id, tzOffsetMin);
  if (!w.ok) { await deleteQuiet(ctx, `/v1/plans/${created.id}`); return { ok: false, step: 'workout', status: w.status, body: w.body }; }

  // El plan anterior de esta fecha queda huérfano: se borra (los workouts asociados no se tocan).
  if (existing && existing.planId && existing.planId !== created.id) await deleteQuiet(ctx, `/v1/plans/${existing.planId}`);
  return { ok: true, workoutId: w.id, planId: created.id };
}

async function removeDay(ctx, date, known) {
  let existing = known && known.workoutId ? { id: known.workoutId, planId: known.planId || null } : null;
  if (!existing) existing = (await loadZancadaWorkouts(ctx)).get(date) || null;
  if (!existing) return true; // ya no estaba
  const ok = await deleteQuiet(ctx, `/v1/workouts/${encodeURIComponent(existing.id)}`);
  if (ok && existing.planId) await deleteQuiet(ctx, `/v1/plans/${existing.planId}`);
  return ok;
}

// days: sesiones a subir; removeDates: fechas a borrar; known: { fecha: {workoutId, planId} }.
async function syncWahooPlans(accessToken, userId, { days, removeDates, zones, labels, tzOffsetMin, known }) {
  const ctx = makeCtx(accessToken, userId);
  known = known || {};
  const out = { pushed: 0, removed: 0, failed: 0, pushedMap: {}, removedDates: [], reason: undefined, firstError: null };
  const fail = (e) => { out.failed++; if (!out.firstError) out.firstError = e; };

  try {
    for (const day of days) {
      const r = await pushDay(ctx, day, { zones, labels, tzOffsetMin, known: known[day.date] });
      if (r.ok) { out.pushed++; out.pushedMap[day.date] = { workoutId: r.workoutId, planId: r.planId }; }
      else {
        fail({ date: day.date, step: r.step, status: r.status, body: r.body });
        // Sin el permiso de planes (token viejo sin plans_write) no tiene sentido seguir.
        if (r.step === 'plan' && (r.status === 401 || r.status === 403)) { out.reason = 'reconnect_needed'; break; }
      }
    }
    if (!out.reason) {
      for (const date of removeDates || []) {
        if (await removeDay(ctx, date, known[date])) { out.removed++; out.removedDates.push(date); }
        else fail({ date, step: 'delete', status: 0, body: '' });
      }
    }
  } catch (e) {
    if (!e.rateLimited) throw e;
    out.reason = 'rate_limited';
  }
  if (ctx.stopped && !out.reason && out.failed) out.reason = 'rate_limited';
  return out;
}

// Borra de la cuenta de Wahoo todos los entrenamientos (y sus planes) que subió Zancada: se usa al
// desconectar, para no dejar entrenamientos huérfanos que ya nada va a actualizar.
async function removeAllZancada(accessToken, userId) {
  const ctx = makeCtx(accessToken, userId);
  let removed = 0;
  try {
    for (const [, w] of await loadZancadaWorkouts(ctx)) {
      if (await deleteQuiet(ctx, `/v1/workouts/${encodeURIComponent(w.id)}`)) {
        removed++;
        if (w.planId) await deleteQuiet(ctx, `/v1/plans/${w.planId}`);
      }
    }
  } catch (e) { if (!e.rateLimited) throw e; }
  return removed;
}

module.exports = { syncWahooPlans, removeAllZancada, loadZancadaWorkouts, makeCtx, tokenFor, wf };
