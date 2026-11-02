// api/garmin-webhook.js
//
// Recibe las notificaciones PUSH de Garmin (Activity API, nivel Starter: solo push). Se registra en https://apis.garmin.com/tools/endpoints, una URL por tipo de dato, todas a esta dirección:
//   https://www.zancada.org/api/garmin-webhook/<GARMIN_WEBHOOK_SECRET>
// (Garmin recorta la query de la dirección que se registra, por eso el secreto va en la RUTA; vercel.json la reescribe a ?k=<secreto>. La forma con ?k= también anda.)
// Garmin no firma los avisos: la defensa es el secreto en la dirección (comparado en tiempo constante) y que solo se actúa sobre cuentas de Garmin que ya conectó alguien en Zancada.
//
// Tipos que se atienden (lista con el nombre del tipo como clave del JSON):
//   activities            resumen de una actividad terminada -> se suma al Historial (y avisa con una notificación si es reciente)
//   activityDetails       el detalle (ruta GPS, pulso, parciales) -> completa la misma carrera
//   manuallyUpdatedActivities  una actividad cargada o corregida a mano en Garmin Connect (sin reloj) -> reemplaza a la ya importada
//   deregistrations       la persona se desconectó desde Garmin -> se borra la conexión y lo importado
//   userPermissionsChange la persona cambió qué comparte -> se guardan los permisos
// El resto (salud diaria, archivos FIT, etc.) se ignora con un 200 para que Garmin no reintente.
//
// Garmin pide responder 200 en menos de 30 s y reintenta cada hora hasta 7 días si no. Acá se responde 200 DESPUÉS de guardar (en lugar de antes): si algo falla, el reintento de
// Garmin recupera el aviso. Los datos de Garmin no llegan nunca a Zonda ni a ninguna IA (licencia, sección 15.11).

const crypto = require('crypto');
const { isRunningActivity, activityToRun, mergeGarminRuns, purgeGarminRunsForUser } = require('./_lib/garmin-activity-helpers');
const { mergeAndNotify } = require('./_lib/notify-new-run');
const { withSentry, reportError, reportSecurityEvent } = require('./_lib/sentry');

function secretMatches(given, expected) {
  if (!expected || !given) return false;
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

const list = v => (Array.isArray(v) ? v : []);

// Convertir una actividad puede fallar si el aviso viene roto. Eso NO puede devolver 500: Garmin reintentaría cada hora durante 7 días el MISMO lote (con las actividades de otras personas) y una sola
// rota las dejaría a todas trabadas. Se salta esa actividad y se sigue. Los errores de la base de datos, en cambio, sí siguen devolviendo 500 para que Garmin reintente.
function safeRun(fn, what) {
  try { return fn(); } catch (e) { console.error('garmin-webhook: ' + what + ' con datos rotos, se salta:', e && e.message); return null; }
}

module.exports = withSentry(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const secret = process.env.GARMIN_WEBHOOK_SECRET;
  if (!secret) { console.error('garmin-webhook: falta GARMIN_WEBHOOK_SECRET'); res.status(500).json({ error: 'not configured' }); return; }
  const given = req.query && req.query.k;
  if (!secretMatches(Array.isArray(given) ? given[0] : given, secret)) {
    await reportSecurityEvent('Webhook de Garmin con secreto ausente o inválido', { hasKey: !!given }).catch(() => {});
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : null;
  if (!body) { res.status(200).json({ ok: true, ignored: 'not json' }); return; }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  // cuentas de Zancada conectadas a ese userId de Garmin (puede haber más de una)
  const connsCache = new Map();
  async function connsFor(garminUserId) {
    const id = String(garminUserId || '');
    if (!id) return [];
    if (connsCache.has(id)) return connsCache.get(id);
    const r = await fetch(`${base}/rest/v1/garmin_connections?garmin_user_id=eq.${encodeURIComponent(id)}&select=user_id`, { headers });
    const rows = r.ok ? await r.json().catch(() => []) : [];
    const out = Array.isArray(rows) ? rows : [];
    connsCache.set(id, out);
    return out;
  }

  try {
    // --- desconexión desde Garmin: se borra todo lo de esa cuenta ---
    for (const d of list(body.deregistrations).slice(0, 50)) {
      for (const row of await connsFor(d && d.userId)) {
        try { await purgeGarminRunsForUser(base, headers, row.user_id); } catch (e) { console.error('garmin-webhook: no se pudieron purgar las carreras', e && e.message); throw e; }
        await fetch(`${base}/rest/v1/sent_notifications?user_id=eq.${row.user_id}&kind=in.(garmin_wk,garmin_plan)`, { method: 'DELETE', headers }).catch(() => {});
        await fetch(`${base}/rest/v1/garmin_connections?user_id=eq.${row.user_id}`, { method: 'DELETE', headers });
      }
    }

    // --- cambio de permisos ---
    for (const p of list(body.userPermissionsChange).slice(0, 50)) {
      const perms = list(p && p.permissions).map(String).slice(0, 20);
      for (const row of await connsFor(p && p.userId)) {
        await fetch(`${base}/rest/v1/garmin_connections?user_id=eq.${row.user_id}`, { method: 'PATCH', headers, body: JSON.stringify({ permissions: perms }) });
      }
    }

    // --- actividades terminadas ---
    for (const a of list(body.activities).slice(0, 100)) {
      if (!a || !isRunningActivity(a.activityType) || a.isParent) continue;
      const run = safeRun(() => activityToRun(a), 'actividad');
      if (!run || !run.garminId || !run.distanceKm) continue;
      for (const row of await connsFor(a.userId)) {
        await mergeAndNotify(mergeGarminRuns, base, headers, row.user_id, [run], 'skip', 'garmin', 900);
      }
    }

    // --- actividades cargadas o corregidas a mano en Garmin Connect (sin reloj, deviceName "unknown"): la versión nueva reemplaza a la anterior, igual que cuando el detalle completa una carrera.
    // Las de un reloj no se tocan acá: su ruta y sus parciales vienen del detalle y un reemplazo los borraría. ---
    for (const a of list(body.manuallyUpdatedActivities).slice(0, 100)) {
      if (!a || !isRunningActivity(a.activityType) || a.isParent) continue;
      if (String(a.deviceName || 'unknown').trim().toLowerCase() !== 'unknown') continue;
      const run = safeRun(() => activityToRun(a), 'actividad');
      if (!run || !run.garminId || !run.distanceKm) continue;
      for (const row of await connsFor(a.userId)) {
        await mergeGarminRuns(base, headers, row.user_id, [run], 'upsert');
      }
    }

    // --- detalle (ruta, pulso, parciales): completa la misma carrera ---
    for (const d of list(body.activityDetails).slice(0, 20)) {
      const summary = d && d.summary;
      if (!summary || !isRunningActivity(summary.activityType)) continue;
      const run = safeRun(() => activityToRun(Object.assign({}, summary, { activityId: d.activityId != null ? d.activityId : summary.activityId, summaryId: d.summaryId }), d), 'detalle');
      if (!run || !run.garminId || !run.distanceKm) continue;
      for (const row of await connsFor(d.userId)) {
        await mergeGarminRuns(base, headers, row.user_id, [run], 'upsert');
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('garmin-webhook error', err);
    await reportError(err, { endpoint: 'garmin-webhook' });
    // 500: Garmin reintenta cada hora (hasta 7 días), que es lo que queremos si fue una falla nuestra
    res.status(500).json({ error: 'Error' });
  }
});
