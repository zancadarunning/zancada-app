// api/_lib/server-login-check.js
//
// Aviso por mail de "inicio de sesión desde un dispositivo nuevo" visto DESDE EL SERVIDOR. El aviso de api/login-alert.js lo dispara la app al abrirse; quien entra con una
// contraseña robada directo contra la API de autenticación no pasa por ahí. Acá, cada vez que corre el cron de recordatorios (cada 30 min), se miran los inicios de sesión
// de los últimos ~50 minutos (función SQL recent_auth_sessions, sql/recent_auth_sessions.sql) y se avisa de los que vienen de un tipo de dispositivo que la cuenta nunca usó.
//
// Criterio: igual que el aviso de la app (la cuenta ya tiene historia, no es un alta de hace minutos, mail confirmado) pero comparando el TIPO de dispositivo
// ("Android · app", "Windows · navegador", "dispositivo desconocido" para un script con otro user-agent) contra los dispositivos ya conocidos de la cuenta (known_devices.label).
// Un teléfono nuevo del mismo tipo que otro conocido lo sigue avisando la app, no esto. Solo se miran sesiones de más de 5 minutos: así la app ya tuvo tiempo de registrar su
// dispositivo y no salen dos mails por el mismo ingreso. No se lee ni se guarda la dirección IP. Una sesión que se cerró antes de que corra el cron no se ve (límite aceptado).
//
// Comparte con el aviso de la app el tope entre avisos de la cuenta (30 min), el tope diario por cuenta (3) y el global (40). Cada sesión avisa una sola vez (sent_notifications,
// kind 'login_srv', period = id de la sesión). Nunca lanza: si falta la función SQL, la tabla o el mail, no hace nada.

const { claim, release, fetchSent } = require('./sent-registry');
const { checkSyncCooldown } = require('./sync-cooldown');
const { withinDailyCap } = require('./daily-cap');
const { fetchWithTimeout } = require('./fetch-with-timeout');
const { pickLang, deviceLabel, buildAlertEmail } = require('./login-alert');

const WINDOW_MS = 50 * 60 * 1000;      // un poco más que el cron (30 min): un cron que se atrasó no deja sesiones sin mirar; el reclamo por sesión evita repetir
const SETTLE_MS = 5 * 60 * 1000;       // la app tiene este tiempo para registrar su dispositivo antes de que el servidor opine
const NEW_ACCOUNT_MS = 10 * 60 * 1000;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_ALERTS_PER_RUN = 10;
const MAX_SESSIONS_PER_RUN = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadSessions(base, headers, now) {
  const res = await fetchWithTimeout(`${base}/rest/v1/rpc/recent_auth_sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_since: new Date(now - WINDOW_MS).toISOString(), p_until: new Date(now - SETTLE_MS).toISOString() })
  }, 8000);
  if (!res.ok) return null;   // la función todavía no existe en Supabase: no se hace nada
  const rows = await res.json();
  return Array.isArray(rows) ? rows.filter(r => r && UUID_RE.test(String(r.session_id)) && UUID_RE.test(String(r.user_id))).slice(0, MAX_SESSIONS_PER_RUN) : null;
}

async function loadAccount(base, headers, userId) {
  const res = await fetchWithTimeout(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers }, 8000);
  if (!res.ok) return null;
  const u = await res.json();
  return { email: u && u.email, confirmed: !!(u && u.email_confirmed_at), createdAt: u && u.created_at };
}

async function loadKnownLabels(base, headers, userId) {
  const res = await fetch(`${base}/rest/v1/known_devices?user_id=eq.${encodeURIComponent(userId)}&select=label&limit=25`, { headers });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows.map(r => String(r && r.label || '')) : null;
}

async function loadLangAndTz(base, headers, userId) {
  try {
    const res = await fetch(`${base}/rest/v1/app_state?user_id=eq.${encodeURIComponent(userId)}&select=lang:data->>lang,tz:data->profile->>tz&limit=1`, { headers });
    if (!res.ok) return { lang: 'es', tz: 'UTC' };
    const rows = await res.json();
    const r = Array.isArray(rows) && rows[0] ? rows[0] : {};
    return { lang: pickLang(r.lang), tz: typeof r.tz === 'string' && r.tz ? r.tz.slice(0, 64) : 'UTC' };
  } catch (e) { return { lang: 'es', tz: 'UTC' }; }
}

// Devuelve cuántos avisos mandó (para los registros del cron). Nunca lanza.
async function checkNewLogins(opts) {
  const o = opts || {};
  const base = o.base || process.env.SUPABASE_URL;
  const key = o.key || process.env.SUPABASE_SERVICE_KEY;
  const apiKey = o.resendKey !== undefined ? o.resendKey : process.env.RESEND_API_KEY;
  const now = o.now !== undefined ? o.now : Date.now();
  if (!base || !key || !apiKey) return 0;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  let sent = 0;
  try {
    const sessions = await loadSessions(base, headers, now);
    if (!sessions || !sessions.length) return 0;
    const accounts = new Map();
    const labelsByUser = new Map();
    for (const s of sessions) {
      if (sent >= MAX_ALERTS_PER_RUN) break;
      const userId = String(s.user_id);
      try {
        if (!accounts.has(userId)) accounts.set(userId, await loadAccount(base, headers, userId));
        const acc = accounts.get(userId);
        if (!acc || !acc.email || !acc.confirmed) continue;
        const ageMs = acc.createdAt ? Date.parse(acc.createdAt) : NaN;
        if (!Number.isFinite(ageMs) || Date.parse(s.created_at) - ageMs < NEW_ACCOUNT_MS) continue;   // un alta: su primer ingreso no es "nuevo"

        if (!labelsByUser.has(userId)) labelsByUser.set(userId, await loadKnownLabels(base, headers, userId));
        const labels = labelsByUser.get(userId);
        if (!labels || !labels.length) continue;                       // sin historial (o sin la tabla): no hay con qué comparar
        const label = deviceLabel(s.user_agent, 'en');
        if (labels.includes(label)) continue;                          // el mismo tipo de dispositivo que ya usó: lo cubre el aviso de la app

        // una sesión ya avisada en una corrida anterior (la ventana se solapa con la del cron anterior) no debe gastar el enfriamiento ni los topes: se mira ANTES, solo lectura
        const already = await fetchSent(base, headers, 'login_srv', String(s.session_id), [userId]);
        if (already === null || already.has(userId)) continue;

        if (!(await checkSyncCooldown(base, headers, userId, 'login-alert', ALERT_COOLDOWN_MS, { failClosed: true }))) continue;
        if (!(await withinDailyCap(base, headers, 'login-alert-user', userId, 3, { failClosed: true }))) continue;
        if (!(await withinDailyCap(base, headers, 'login-alert-global', null, 40, { failClosed: true }))) continue;

        const claimed = await claim(base, headers, userId, 'login_srv', String(s.session_id));
        if (claimed !== true) continue;                                // ya avisado (otra corrida) o el registro no responde: no se arriesga a repetir

        const { lang, tz } = await loadLangAndTz(base, headers, userId);
        const mail = buildAlertEmail({ lang, ua: s.user_agent, countryHeader: null, tz, now: Date.parse(s.created_at) });
        let ok = false;
        try {
          const r = await fetchWithTimeout('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'Zancada <no-reply@zancada.org>', reply_to: 'info@zancada.org', to: [acc.email], subject: mail.subject, text: mail.text })
          }, 8000);
          ok = r.ok;
          if (!r.ok) console.error('server-login-check: Resend respondió con error', r.status);
        } catch (e) { console.error('server-login-check: no se pudo mandar el mail', e && e.message); }
        if (ok) sent++;
        else await release(base, headers, userId, 'login_srv', String(s.session_id));   // pasajero: la próxima corrida lo reintenta (mientras la sesión siga en la ventana)
      } catch (e) {
        console.error('server-login-check: falló una sesión', e && e.message);
      }
    }
  } catch (e) {
    console.error('server-login-check error', e && e.message);
  }
  return sent;
}

module.exports = { checkNewLogins, WINDOW_MS, SETTLE_MS };
