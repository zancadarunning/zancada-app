// api/_lib/plan-dedupe.js
//
// Evita mandar a la API de un reloj (Wahoo, Suunto) el MISMO plan dos veces seguidas. La cuota de esas APIs es de la app entera, compartida por todos los
// usuarios (Suunto: 200 llamadas por semana). La app ya recuerda qué envió en este teléfono, pero con dos teléfonos (o tras reinstalar) cada uno vuelve a mandar todo.
//
// Guarda UNA fila por usuario y tipo en sent_notifications (ver sql/sent_notifications.sql): period = huella del último envío que salió bien. Si llega un pedido con la
// misma huella dentro de la ventana, se responde "sin cambios" sin tocar la API de la marca. La ventana (6 h) hace que, si alguien borró el entrenamiento a mano en
// la marca, igual se repare solo; el botón manual de la app manda force:true y se salta este control.
//
// Si la tabla no existe o la base no responde, nada de esto estorba: isDuplicate devuelve false y el envío sigue como siempre.

const crypto = require('crypto');
const { claim } = require('./sent-registry');

const WINDOW_MS = 6 * 60 * 60 * 1000;

// Huella estable (las claves se ordenan) de lo que se va a enviar; no incluye ids que cambian de un dispositivo a otro.
function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
function payloadHash(payload) {
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex').slice(0, 32);
}

// true si el último envío exitoso de este usuario y tipo tuvo esta misma huella hace menos de `windowMs`.
async function isDuplicate(base, headers, userId, kind, hash, windowMs = WINDOW_MS) {
  try {
    const res = await fetch(`${base}/rest/v1/sent_notifications?user_id=eq.${encodeURIComponent(userId)}&kind=eq.${encodeURIComponent(kind)}&period=eq.${encodeURIComponent(hash)}&select=sent_at&limit=1`, { headers });
    if (!res.ok) return false;
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return false;
    const at = Date.parse(rows[0].sent_at);
    return Number.isFinite(at) && Date.now() - at < windowMs;
  } catch (e) { return false; }
}

// Recuerda este envío como el último exitoso (reemplaza el anterior del mismo usuario y tipo).
async function remember(base, headers, userId, kind, hash) {
  try {
    await fetch(`${base}/rest/v1/sent_notifications?user_id=eq.${encodeURIComponent(userId)}&kind=eq.${encodeURIComponent(kind)}`, { method: 'DELETE', headers });
    await claim(base, headers, userId, kind, hash);
  } catch (e) { /* no es crítico: el próximo envío simplemente no se podrá saltear */ }
}

module.exports = { payloadHash, isDuplicate, remember, WINDOW_MS };
