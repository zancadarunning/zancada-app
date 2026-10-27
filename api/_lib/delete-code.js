// api/_lib/delete-code.js
//
// Código de confirmación por mail para borrar la cuenta o los datos de quien entra con Google o Apple. Las cuentas con contraseña la escriben de nuevo; estas no tienen
// contraseña, y antes bastaba un token de sesión (robado o viejo) para borrar todo sin vuelta atrás. Ahora, si el ingreso no es reciente, el servidor manda un código de 6 dígitos
// al mail verificado de la cuenta y lo exige al borrar. Se guarda solo su hash (sent_notifications, kind 'delete_code', period "vencimiento|hash"), vence a los 10 minutos y sirve una sola vez.
// Intentos: tope diario por cuenta (el espacio es de un millón de códigos).

const crypto = require('crypto');
const { withinDailyCap } = require('./daily-cap');
const { fetchWithTimeout } = require('./fetch-with-timeout');

const KIND = 'delete_code';
const TTL_MS = 10 * 60 * 1000;
const MAX_TRIES_PER_DAY = 10;

const LANGS = ['es', 'en', 'pt', 'fr', 'it', 'de'];
const pickLang = l => (LANGS.includes(l) ? l : 'es');

const MAIL = {
  es: { subject: 'Tu código de Zancada: {code}', text: 'Tu código para confirmar el borrado en Zancada es {code}. Vence en 10 minutos.\n\nSi no lo pediste vos, ignorá este mensaje y no compartas el código: alguien podría estar usando tu sesión.' },
  en: { subject: 'Your Zancada code: {code}', text: 'Your code to confirm the deletion in Zancada is {code}. It expires in 10 minutes.\n\nIf you did not ask for it, ignore this message and do not share the code: someone may be using your session.' },
  pt: { subject: 'Seu código do Zancada: {code}', text: 'Seu código para confirmar a exclusão no Zancada é {code}. Expira em 10 minutos.\n\nSe você não pediu, ignore esta mensagem e não compartilhe o código: alguém pode estar usando sua sessão.' },
  fr: { subject: 'Votre code Zancada : {code}', text: 'Votre code pour confirmer la suppression dans Zancada est {code}. Il expire dans 10 minutes.\n\nSi vous ne l’avez pas demandé, ignorez ce message et ne partagez pas le code : quelqu’un utilise peut-être votre session.' },
  it: { subject: 'Il tuo codice Zancada: {code}', text: 'Il tuo codice per confermare l’eliminazione in Zancada è {code}. Scade tra 10 minuti.\n\nSe non l’hai richiesto, ignora questo messaggio e non condividere il codice: qualcuno potrebbe usare la tua sessione.' },
  de: { subject: 'Dein Zancada-Code: {code}', text: 'Dein Code zum Bestätigen des Löschens in Zancada lautet {code}. Er läuft in 10 Minuten ab.\n\nWenn du ihn nicht angefordert hast, ignoriere diese Nachricht und gib den Code nicht weiter: Jemand könnte deine Sitzung nutzen.' }
};

function hashCode(userId, code) {
  return crypto.createHmac('sha256', String(process.env.SUPABASE_SERVICE_KEY || '')).update(userId + ':' + code).digest('hex');
}

// Genera y guarda un código nuevo (reemplaza el anterior) y lo manda por mail. Devuelve true si el mail salió.
async function issueDeleteCode(base, headers, userId, email, lang) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !email) return false;
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const del = await fetch(`${base}/rest/v1/sent_notifications?user_id=eq.${userId}&kind=eq.delete_code`, { method: 'DELETE', headers });
  if (!del.ok) return false;
  const ins = await fetch(`${base}/rest/v1/sent_notifications`, {
    method: 'POST', headers,
    body: JSON.stringify({ user_id: userId, kind: KIND, period: (Date.now() + TTL_MS) + '|' + hashCode(userId, code) })
  });
  if (!ins.ok) return false;
  const m = MAIL[pickLang(lang)];
  try {
    const r = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Zancada <no-reply@zancada.org>', reply_to: 'info@zancada.org', to: [email], subject: m.subject.replace('{code}', code), text: m.text.replace('{code}', code) })
    }, 8000);
    return r.ok;
  } catch (e) { return false; }
}

// ¿El código es el vigente de esta cuenta? Si lo es, se gasta (no se puede reutilizar).
async function consumeDeleteCode(base, headers, userId, code) {
  const given = String(code == null ? '' : code).trim();
  if (!/^[0-9]{6}$/.test(given)) return false;
  if (!(await withinDailyCap(base, headers, 'delete-code-try', userId, MAX_TRIES_PER_DAY, { failClosed: true }))) return false;
  const res = await fetch(`${base}/rest/v1/sent_notifications?user_id=eq.${userId}&kind=eq.delete_code&select=period&limit=1`, { headers });
  if (!res.ok) return false;
  const rows = await res.json().catch(() => null);
  const period = Array.isArray(rows) && rows[0] && String(rows[0].period || '');
  if (!period) return false;
  const [exp, hash] = period.split('|');
  if (!(Number(exp) > Date.now()) || !hash) return false;
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(hashCode(userId, given), 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  await fetch(`${base}/rest/v1/sent_notifications?user_id=eq.${userId}&kind=eq.delete_code`, { method: 'DELETE', headers }).catch(() => {});
  return true;
}

module.exports = { issueDeleteCode, consumeDeleteCode, hashCode };
