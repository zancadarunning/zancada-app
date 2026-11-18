// api/usage-alert.js — proceso automático (cron de Vercel, una vez por día).
//
// Avisa por correo cuando un límite de uso que Zancada SÍ puede medir desde su propia base (ver api/_lib/usage-limits.js) cambia de nivel hacia
// arriba: 70 % (se acerca), 90 % (urgente) o 100 % (llegó). Solo avisa cuando el nivel SUBE, no todos los días mientras siga alto: el último
// nivel avisado de cada límite queda en la tabla usage_alert_state (sql/usage_alert_state.sql). Si el uso vuelve a bajar del 60 %, se reinicia.
//
// Los números salen de la función SQL admin_stats() (la misma del panel de administración). Variables de entorno:
//   CRON_SECRET (ya existe), RESEND_API_KEY (ya existe), SUPABASE_URL / SUPABASE_SERVICE_KEY (ya existen)
//   ALERT_EMAIL  (opcional: a quién avisar; si falta se usa el primer mail de ADMIN_EMAILS)

const requireCronSecret = require('./_lib/require-cron-secret');
const { withSentry, reportError } = require('./_lib/sentry');
const { fetchWithTimeout } = require('./_lib/fetch-with-timeout');
const { buildLimits, alertLevel, buildAlertEmail } = require('./_lib/usage-limits');

function recipient() {
  const own = String(process.env.ALERT_EMAIL || '').trim();
  if (own) return own;
  return String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '').split(',').map(s => s.trim()).filter(Boolean)[0] || '';
}

module.exports = withSentry(async (req, res) => {
  if (!(await requireCronSecret(req))) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    const r = await fetchWithTimeout(`${base}/rest/v1/rpc/admin_stats`, { method: 'POST', headers, body: '{}' }, 20000);
    if (!r.ok) { console.error('usage-alert: admin_stats falló', r.status); res.status(502).json({ error: 'admin_stats' }); return; }
    const stats = await r.json();
    const limits = buildLimits(stats);

    const sr = await fetchWithTimeout(`${base}/rest/v1/usage_alert_state?select=key,level`, { headers }, 10000);
    const prevRows = sr.ok ? await sr.json() : [];
    const prev = {};
    for (const row of Array.isArray(prevRows) ? prevRows : []) prev[row.key] = Number(row.level) || 0;

    const changed = [], updates = [];
    for (const l of limits) {
      const level = alertLevel(l.pct);
      const before = prev[l.key] || 0;
      if (level > before) changed.push(Object.assign({}, l, { level }));
      // sube de nivel: se guarda el nuevo. Baja: solo se reinicia a 0 cuando cae por debajo del 60 % (para no avisar de nuevo por una oscilación)
      if (level > before) updates.push({ key: l.key, level });
      else if (l.pct < 60 && before > 0) updates.push({ key: l.key, level: 0 });
    }

    let mailed = false;
    if (changed.length) {
      const to = recipient();
      const apiKey = process.env.RESEND_API_KEY;
      if (!to || !apiKey) {
        console.error('usage-alert: falta ALERT_EMAIL/ADMIN_EMAILS o RESEND_API_KEY, no se pudo avisar');
        await reportError(new Error('usage-alert: hay límites que cambiaron de nivel pero no hay a quién avisar'), { endpoint: 'usage-alert' }).catch(() => {});
      } else {
        const mail = buildAlertEmail(changed, limits);
        const mr = await fetchWithTimeout('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'Zancada <no-reply@zancada.org>', reply_to: 'info@zancada.org', to: [to], subject: mail.subject, text: mail.text })
        }, 10000);
        mailed = mr.ok;
        if (!mr.ok) console.error('usage-alert: Resend respondió con error', mr.status);
      }
      // si el correo no salió, NO se guarda el nivel nuevo: mañana se vuelve a intentar
      if (!mailed) updates.splice(0, updates.length, ...updates.filter(u => !changed.some(c => c.key === u.key)));
    }

    if (updates.length) {
      await fetchWithTimeout(`${base}/rest/v1/usage_alert_state`, {
        method: 'POST',
        headers: Object.assign({}, headers, { Prefer: 'resolution=merge-duplicates' }),
        body: JSON.stringify(updates.map(u => ({ key: u.key, level: u.level, updated_at: new Date().toISOString() })))
      }, 10000);
    }

    res.status(200).json({ ok: true, changed: changed.map(c => c.key), mailed });
  } catch (e) {
    console.error('usage-alert error', e);
    await reportError(e, { endpoint: 'usage-alert' });
    res.status(500).json({ error: 'Internal error' });
  }
});
