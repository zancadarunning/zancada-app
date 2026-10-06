// api/_lib/suunto-guides-sync.js
//
// Lógica compartida para dejar las guías SuuntoPlus de Zancada de una cuenta de Suunto en el
// estado correcto: la usan el endpoint que llama la app (suunto-push-plan.js, cuando el
// usuario cambia algo) y el cron de los lunes (suunto-guides-cron.js, que sube la semana
// nueva aunque nadie abra la app). Ver el comentario de suunto-push-plan.js para el contrato.

const { fetchWithTimeout } = require('./fetch-with-timeout');
const { SUUNTO_API_BASE, suuntoApiHeaders } = require('./suunto-activity-helpers');
const { buildGuide, buildGuideZip } = require('./suunto-guide-builder');

const GUIDES = `${SUUNTO_API_BASE}/v2/guides`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function guidesRequest(path, accessToken, init) {
  const headers = Object.assign(suuntoApiHeaders(accessToken), init && init.headers);
  return fetchWithTimeout(`${GUIDES}${path}`, Object.assign({}, init, { headers }), 10000);
}

// Lista las guías de la cuenta que pertenecen a Zancada. Devuelve { ok, forbidden, mine }.
async function listZancadaGuides(accessToken) {
  const r = await guidesRequest('/items', accessToken, { method: 'GET' });
  if (r.status === 403) return { ok: false, forbidden: true, mine: [] };
  if (!r.ok) return { ok: false, forbidden: false, mine: [] };
  const data = await r.json().catch(() => null);
  const items = (data && Array.isArray(data.payload)) ? data.payload : [];
  const mine = items.filter(g => g && g.owner === 'Zancada' && typeof g.externalId === 'string' && g.externalId.startsWith('zancada-'));
  return { ok: true, forbidden: false, mine };
}

// days: sesiones (ya validadas) a subir/actualizar. keepDates: Set de fechas que tienen que
// existir al terminar (null = modo manual: solo se borran las anteriores a `today`).
// Sube de la fecha MÁS LEJANA a la más cercana: Suunto borra solo las guías más viejas cuando
// el reloj se queda sin espacio, así las de hoy/mañana son las últimas en llegar.
async function syncGuides(accessToken, { days, zones, labels, keepDates, today, existing }) {
  const found = existing || await listZancadaGuides(accessToken);
  if (!found.ok) return { listFailed: true, forbidden: found.forbidden, pushed: 0, failed: 0, removed: 0, pushedDates: [] };
  const mine = found.mine;

  const ordered = days.slice().sort((a, b) => b.date.localeCompare(a.date));
  let pushed = 0, failed = 0, firstError = null;
  const pushedDates = [];

  const send = (method, id, zip) => guidesRequest(method === 'POST' ? '/files' : `/files/${encodeURIComponent(id)}`, accessToken, {
    method, headers: { 'Content-Type': 'application/zip' }, body: zip
  });

  for (const day of ordered) {
    const guide = buildGuide(day, zones, labels);
    const zip = buildGuideZip(guide);
    const prior = mine.find(g => g.externalId === guide.externalId);
    let method = prior ? 'PUT' : 'POST';
    let r = await send(method, prior && prior.id, zip);

    // Dos dispositivos (o el cron y la app) pueden sincronizar a la vez, o el usuario puede borrar
    // una guía a mano: la lista que leímos puede estar desactualizada. Se corrige en el momento:
    //   - PUT 404 = la guía ya no existe -> se crea de nuevo.
    //   - POST 409 = ya existe una con ese externalId -> se vuelve a listar y se actualiza.
    if (!r.ok && method === 'PUT' && r.status === 404) {
      method = 'POST';
      r = await send('POST', null, zip);
    }
    if (!r.ok && method === 'POST' && r.status === 409) {
      const again = await listZancadaGuides(accessToken);
      const existingNow = again.ok && again.mine.find(g => g.externalId === guide.externalId);
      if (existingNow) { method = 'PUT'; r = await send('PUT', existingNow.id, zip); }
    }

    if (r.ok) { pushed++; pushedDates.push(day.date); continue; }
    failed++;
    if (!firstError) firstError = { status: r.status, method, externalId: guide.externalId, body: (await r.text().catch(() => '')).slice(0, 300) };
    console.error('suunto-guides-sync: guide upload failed', method, guide.externalId, r.status);
  }

  let removed = 0;
  for (const g of mine) {
    const ext = String(g.externalId).slice('zancada-'.length);
    if (!DATE_RE.test(ext)) continue;
    const stale = keepDates ? !keepDates.has(ext) : (today && ext < today);
    if (!stale) continue;
    const dr = await guidesRequest(`/files/${encodeURIComponent(g.id)}`, accessToken, { method: 'DELETE' }).catch(() => null);
    if (dr && dr.ok) removed++;
  }
  return { listFailed: false, forbidden: false, pushed, failed, removed, pushedDates, firstError };
}

// ---------- fechas (sin zona horaria del servidor) ----------

// Fecha local (YYYY-MM-DD) y hora (0-23) de un instante en una zona horaria IANA.
function localDateParts(tz, nowMs) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(nowMs));
  } catch (e) {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(nowMs));
  }
  const get = (t) => (parts.find(p => p.type === t) || {}).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function addDaysIso(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function mondayOfIso(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

module.exports = { guidesRequest, listZancadaGuides, syncGuides, localDateParts, addDaysIso, mondayOfIso, DATE_RE };
