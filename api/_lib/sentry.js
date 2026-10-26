// api/_lib/sentry.js
//
// Conexión a Sentry para el backend (api/*.js). Cada función serverless de
// Vercel es su propio proceso que arranca en frío y puede congelarse apenas
// termina de responder -- por eso Sentry.init() acá está guardado para no
// re-inicializar en cada require (Node cachea el módulo, así que en la
// práctica corre una sola vez por instancia fría), y por eso withSentry()
// espera explícitamente a Sentry.flush() antes de dejar que la función
// termine: sin ese flush, el evento puede quedar en el aire si Vercel mata
// el proceso antes de que el request HTTP a Sentry termine de salir.
//
// Variable de entorno nueva que hay que agregar en Vercel:
//   SENTRY_DSN

const Sentry = require('@sentry/node');

// Los pedidos salientes (a Supabase, Strava, etc.) llevan secretos en la query string: el token del calendario de una persona, access_token de Strava,
// filtros con datos. El SDK los agregaba como breadcrumbs a cualquier error reportado. Acá se sacan antes de enviar nada a Sentry.
const stripQuery = u => (typeof u === 'string' ? u.split('?')[0] : u);
function scrubBreadcrumb(b) {
  if (b && b.data) {
    for (const k of ['http.query', 'url.query', 'query', 'http.fragment']) delete b.data[k];
    for (const k of ['url', 'http.url', 'to', 'from']) if (typeof b.data[k] === 'string') b.data[k] = stripQuery(b.data[k]);
  }
  return b;
}
function scrubEvent(e) {
  if (e && e.request) {
    delete e.request.query_string;
    delete e.request.cookies;
    delete e.request.data;
    if (e.request.url) e.request.url = stripQuery(e.request.url);
    if (e.request.headers) { delete e.request.headers.authorization; delete e.request.headers.Authorization; delete e.request.headers.cookie; delete e.request.headers.Cookie; }
  }
  if (e && Array.isArray(e.breadcrumbs)) e.breadcrumbs.forEach(scrubBreadcrumb);
  return e;
}

let initialized = false;
function ensureInit() {
  if (initialized) return;
  initialized = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.error('sentry: falta configurar SENTRY_DSN -- los errores no se van a reportar.');
    return;
  }
  Sentry.init({ dsn, tracesSampleRate: 0, sendDefaultPii: false, beforeBreadcrumb: scrubBreadcrumb, beforeSend: scrubEvent });
}

// Envuelve un endpoint (module.exports = async (req,res) => {...}) para que
// cualquier excepción no atrapada por el propio endpoint se reporte a Sentry
// antes de responder 500. Los endpoints que ya atrapan sus propios errores
// (la mayoría, siguiendo el estilo del resto de api/*.js) tienen que seguir
// llamando a reportError() ellos mismos en cada catch -- este wrapper es
// solo la red de seguridad para lo que se escape sin atrapar.
function withSentry(handler) {
  return async (req, res) => {
    ensureInit();
    try {
      return await handler(req, res);
    } catch (err) {
      Sentry.captureException(err);
      await Sentry.flush(2000).catch(() => {});
      if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
      else throw err;
    }
  };
}

// Para usar dentro de un catch ya existente, junto al console.error que ya
// está ahí -- no lo reemplaza, se agrega. Hace falta el await antes de
// responder/terminar para que el evento realmente salga (ver comentario de
// arriba sobre por qué Vercel puede congelar el proceso apenas se responde).
async function reportError(err, context) {
  ensureInit();
  Sentry.captureException(err, context ? { extra: context } : undefined);
  await Sentry.flush(2000).catch(() => {});
}

// Para eventos que no son una excepción pero sí valen una alerta -- un intento
// de forjar el webhook de Strava, un CRON_SECRET incorrecto -- señales de que
// alguien está probando los endpoints, no un bug nuestro. Antes esto solo
// quedaba en console.error (Vercel Logs, sin retención ni alerta), así que un
// intento real de ataque podía pasar desapercibido salvo que alguien fuera a
// mirar los logs a mano justo ese día. captureMessage (no captureException,
// no hay ningún Error acá) con level 'warning' para no mezclarlo con los 500
// de verdad que ya capta withSentry/reportError.
// Como mucho UN evento por mensaje por minuto: sin esto cualquiera, sin autenticarse, podía mandar miles de pedidos rechazados y agotar la cuota de Sentry (tapando alertas reales).
const lastSecurityEventAt = new Map();
async function reportSecurityEvent(message, context) {
  const key = String(message).slice(0, 120);
  const now = Date.now();
  if (now - (lastSecurityEventAt.get(key) || 0) < 60000) return;
  lastSecurityEventAt.set(key, now);
  if (lastSecurityEventAt.size > 200) lastSecurityEventAt.clear();
  ensureInit();
  Sentry.captureMessage(message, { level: 'warning', extra: context });
  await Sentry.flush(2000).catch(() => {});
}

// Diagnóstico puntual (nivel info, no es un error): para ver qué está llegando desde un proveedor
// cuando algo no aparece como debería (TEMPORAL mientras se verifica la recepción de carreras de Suunto).
async function reportDiagnostic(message, context) {
  // Apagado por defecto: mandaba metadatos de entrenamientos (distancia, fecha, actividad) a Sentry aunque no hubiera ningún error. Solo con SENTRY_DIAGNOSTICS=1.
  if (process.env.SENTRY_DIAGNOSTICS !== '1') return;
  ensureInit();
  Sentry.captureMessage(message, { level: 'info', extra: context });
  await Sentry.flush(2000).catch(() => {});
}

module.exports = { Sentry, withSentry, reportError, reportSecurityEvent, reportDiagnostic, scrubBreadcrumb, scrubEvent };
