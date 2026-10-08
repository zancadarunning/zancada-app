// api/_lib/push-endpoint.js
//
// La suscripción push de cada usuario (push_subscriptions.subscription) la escribe el propio navegador/app, así que el campo
// "endpoint" es dato del cliente: sin validarlo, un usuario podía poner ahí una URL cualquiera y hacer que el servidor le
// mandara un POST (SSRF a ciegas). Web Push solo tiene un puñado de servicios reales: se acepta únicamente https hacia ellos.

const TRUSTED_SUFFIXES = [
  'fcm.googleapis.com',            // Chrome / Android / Edge (FCM)
  'android.googleapis.com',        // FCM antiguo
  'updates.push.services.mozilla.com', // Firefox
  '.push.services.mozilla.com',
  'web.push.apple.com',            // Safari / iPhone (PWA)
  '.push.apple.com',
  '.notify.windows.com'            // Edge heredado / Windows
];

function isTrustedPushEndpoint(endpoint) {
  let u;
  try { u = new URL(String(endpoint)); } catch (e) { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  if (u.port && u.port !== '443') return false;
  const host = u.hostname.toLowerCase();
  return TRUSTED_SUFFIXES.some(s => (s.startsWith('.') ? host.endsWith(s) : host === s));
}

module.exports = { isTrustedPushEndpoint };
