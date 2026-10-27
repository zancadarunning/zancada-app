// api/login-alert.js — función serverless de Vercel.
//
// Aviso por mail de "inicio de sesión desde un dispositivo nuevo". La app llama acá cada vez que se abre con una sesión iniciada, mandando el
// identificador al azar de esa instalación (lo genera la app una vez). Se compara su hash con los dispositivos conocidos de la cuenta (tabla
// known_devices, sql/known_devices.sql):
//   - ya conocido            -> solo se actualiza "última vez"; no pasa nada más.
//   - la cuenta no tiene ninguno, o se creó hace menos de 10 minutos (el alta) -> se registra en silencio.
//   - nuevo en una cuenta con historia -> se registra y se manda UN mail desde zancada.org (Resend) con fecha, tipo de dispositivo y país aproximado.
// No se guarda la dirección IP. Si el mail no sale, el dispositivo se des-registra para que el próximo ingreso lo vuelva a intentar.
// Anti-inundación: un atacante con la contraseña podría probar con muchos identificadores falsos; entre dos avisos de la misma cuenta tienen que pasar
// 5 minutos (mientras tanto el dispositivo nuevo NO se registra, así que el aviso llega después, no se pierde).

const crypto = require('crypto');
const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { withSentry, reportError } = require('./_lib/sentry');
const { checkSyncCooldown } = require('./_lib/sync-cooldown');
const { withinDailyCap } = require('./_lib/daily-cap');
const { fetchWithTimeout } = require('./_lib/fetch-with-timeout');
const { pickLang, deviceLabel, countryCode, buildAlertEmail } = require('./_lib/login-alert');

const DEVICE_ID_RE = /^[a-f0-9]{32}$/;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;   // antes 5 min (288 mails por dia por cuenta con ids de dispositivo falsos)
const NEW_ACCOUNT_MS = 10 * 60 * 1000;
const MAX_DEVICES = 20;   // (la consulta de abajo lee hasta 25: un margen sobre este tope)

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  const userId = auth.userId;

  const body = req.body || {};
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  if (!DEVICE_ID_RE.test(deviceId)) { res.status(400).json({ error: 'Bad device id' }); return; }
  const lang = pickLang(body.lang);
  const tz = typeof body.tz === 'string' ? body.tz.slice(0, 64) : 'UTC';
  const ua = String(req.headers['user-agent'] || '');
  const country = countryCode(req.headers['x-vercel-ip-country']);

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const hash = crypto.createHash('sha256').update(userId + ':' + deviceId).digest('hex');

  try {
    // dispositivos que ya tiene la cuenta (como mucho unos pocos: se limita a MAX_DEVICES)
    const listRes = await fetch(`${base}/rest/v1/known_devices?user_id=eq.${userId}&select=device_hash&order=last_seen.asc&limit=25`, { headers });
    if (!listRes.ok) { console.error('login-alert: no se pudo leer known_devices', listRes.status); res.status(200).json({ ok: true, new: false }); return; }   // sin la tabla: no avisa, no rompe
    const known = await listRes.json();
    const rows = Array.isArray(known) ? known : [];

    if (rows.some(r => r.device_hash === hash)) {
      await fetch(`${base}/rest/v1/known_devices?user_id=eq.${userId}&device_hash=eq.${encodeURIComponent(hash)}`, { method: 'PATCH', headers, body: JSON.stringify({ last_seen: new Date().toISOString() }) }).catch(() => {});
      res.status(200).json({ ok: true, new: false });
      return;
    }

    const firstEver = rows.length === 0;
    const ageMs = auth.createdAt ? Date.now() - new Date(auth.createdAt).getTime() : Infinity;
    const silent = firstEver || ageMs < NEW_ACCOUNT_MS || !auth.email || !auth.emailConfirmed;

    // tope entre avisos de la misma cuenta; si se pasa, NO se registra (el aviso llega en un ingreso posterior)
    if (!silent && !(await checkSyncCooldown(base, headers, userId, 'login-alert', ALERT_COOLDOWN_MS, { failClosed: true }))) {
      res.status(200).json({ ok: true, new: true, notified: false, reason: 'cooldown' });
      return;
    }
    // tope diario POR CUENTA, antes del global: una sola cuenta (con ids de dispositivo al azar cada 30 min) no puede agotar el tope compartido y silenciar los avisos de todas las demás
    if (!silent && !(await withinDailyCap(base, headers, 'login-alert-user', userId, 3, { failClosed: true }))) {
      res.status(200).json({ ok: true, new: true, notified: false, reason: 'daily_cap_user' });
      return;
    }
    // tope global del dia de avisos por mail (cuota de Resend compartida con los mails de registro); si se pasa, NO se registra y el aviso llega en un ingreso posterior
    if (!silent && !(await withinDailyCap(base, headers, 'login-alert-global', null, 40, { failClosed: true }))) {
      res.status(200).json({ ok: true, new: true, notified: false, reason: 'daily_cap' });
      return;
    }

    // registrar; si otro pedido lo registró un instante antes, el insert no devuelve fila y no se manda un segundo mail
    const insRes = await fetch(`${base}/rest/v1/known_devices`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ user_id: userId, device_hash: hash, label: deviceLabel(ua, 'en'), country })
    });
    if (!insRes.ok) { console.error('login-alert: no se pudo registrar el dispositivo', insRes.status); res.status(200).json({ ok: true, new: false }); return; }
    const inserted = await insRes.json().catch(() => []);
    if (!Array.isArray(inserted) || !inserted.length) { res.status(200).json({ ok: true, new: false }); return; }

    // máximo de dispositivos por cuenta: se descarta el que hace más tiempo que no se usa
    if (rows.length >= MAX_DEVICES) {
      await fetch(`${base}/rest/v1/known_devices?user_id=eq.${userId}&device_hash=eq.${encodeURIComponent(rows[0].device_hash)}`, { method: 'DELETE', headers }).catch(() => {});
    }

    if (silent) { res.status(200).json({ ok: true, new: true, notified: false }); return; }

    const apiKey = process.env.RESEND_API_KEY;
    let sent = false;
    if (apiKey) {
      const mail = buildAlertEmail({ lang, ua, countryHeader: req.headers['x-vercel-ip-country'], tz, now: Date.now() });
      try {
        const r = await fetchWithTimeout('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'Zancada <no-reply@zancada.org>', reply_to: 'info@zancada.org', to: [auth.email], subject: mail.subject, text: mail.text })
        }, 8000);
        sent = r.ok;
        if (!r.ok) console.error('login-alert: Resend respondió con error', r.status);
      } catch (e) { console.error('login-alert: no se pudo mandar el mail', e && e.message); }
    } else {
      console.error('login-alert: falta RESEND_API_KEY');
    }

    if (!sent) {
      // el aviso no salió: se des-registra para que el próximo ingreso desde este dispositivo lo vuelva a intentar
      await fetch(`${base}/rest/v1/known_devices?user_id=eq.${userId}&device_hash=eq.${encodeURIComponent(hash)}`, { method: 'DELETE', headers }).catch(() => {});
      await reportError(new Error('login-alert: no se pudo mandar el aviso de dispositivo nuevo'), { endpoint: 'login-alert' }).catch(() => {});
    }
    res.status(200).json({ ok: true, new: true, notified: sent });
  } catch (err) {
    console.error('login-alert error', err);
    await reportError(err, { endpoint: 'login-alert' });
    res.status(500).json({ error: 'Internal error' });
  }
});
