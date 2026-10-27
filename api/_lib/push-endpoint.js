// api/_lib/push-endpoint.js
//
// La suscripción push de cada usuario (push_subscriptions.subscription) la escribe el propio navegador/app, así que el campo
// "endpoint" es dato del cliente: sin validarlo, un usuario podía poner ahí una URL cualquiera y hacer que el servidor le
// mandara un POST (SSRF a ciegas). Web Push solo tiene un puñado de servicios reales: se acepta únicamente https hacia ellos.
//
// OJO con dos analizadores de URL: acá se valida con el estándar WHATWG (new URL), pero la librería web-push lo vuelve a leer con
// url.parse() (el viejo de Node). WHATWG acepta caracteres como { } " ` dentro del host y url.parse() corta el host en el primero:
// "https://evil.example{.push.services.mozilla.com/x" pasaba la validación (termina en un sufijo de confianza) pero web-push se
// conectaba a "evil.example". Por eso, además, el host tiene que ser solo letras, números, puntos y guiones, y el resto de la URL
// no puede traer nada que los dos analizadores lean distinto.

const url = require('url');

const TRUSTED_SUFFIXES = [
  'fcm.googleapis.com',            // Chrome / Android / Edge (FCM)
  'android.googleapis.com',        // FCM antiguo
  'updates.push.services.mozilla.com', // Firefox
  '.push.services.mozilla.com',
  'web.push.apple.com',            // Safari / iPhone (PWA)
  '.push.apple.com',
  '.notify.windows.com'            // Edge heredado / Windows
];

const HOST_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

function isTrustedPushEndpoint(endpoint) {
  const raw = String(endpoint);
  let u;
  try { u = new URL(raw); } catch (e) { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  if (u.port && u.port !== '443') return false;
  const host = u.hostname.toLowerCase();
  if (!HOST_RE.test(host) || host.includes('..')) return false;
  // Segunda lectura con el analizador que usa web-push: tiene que dar el mismo host.
  try {
    const legacy = url.parse(raw);
    if (String(legacy.hostname || '').toLowerCase() !== host) return false;
  } catch (e) { return false; }
  return TRUSTED_SUFFIXES.some(s => (s.startsWith('.') ? host.endsWith(s) : host === s));
}

module.exports = { isTrustedPushEndpoint };
