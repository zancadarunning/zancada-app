// api/_lib/fcm.js
//
// Manda notificaciones push a la app nativa (Android/iOS empaquetados con Capacitor) usando
// Firebase Cloud Messaging -- el camino paralelo a Web Push (VAPID, ver web-push en
// send-reminders.js), que solo sirve para el service worker de la PWA y está desactivado a
// propósito dentro del wrapper nativo (ver el comentario en app.js, junto al registro del
// SW). Sin esto, activar el toggle de notificaciones desde la app instalada no tenía ningún
// efecto real: la fila en push_subscriptions se guardaba (con un token de FCM, no una
// suscripción Web Push), pero send-reminders.js solo sabía mandar por webpush.sendNotification,
// que falla silenciosamente contra un token que no es una suscripción Web Push.
//
// FIREBASE_SERVICE_ACCOUNT_JSON: el contenido COMPLETO del JSON que Firebase entrega al crear
// una cuenta de servicio (Configuración del proyecto -> Cuentas de servicio -> Generar nueva
// clave privada), pegado tal cual como valor de la variable de entorno en Vercel -- no un path
// a un archivo, porque en serverless no hay filesystem persistente donde dejarlo entre
// invocaciones. Ver mobile/push-setup/INSTRUCCIONES.md para cómo conseguirlo.

let firebaseApp = null;
function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const admin = require('firebase-admin');
  if (admin.apps.length) {
    firebaseApp = admin.apps[0];
    return firebaseApp;
  }
  const credentials = JSON.parse(raw);
  firebaseApp = admin.initializeApp({ credential: admin.credential.cert(credentials) });
  return firebaseApp;
}

// Códigos de error de FCM que significan "este token ya no sirve, no tiene sentido
// reintentarlo" -- mismo criterio que el 404/410 de Web Push en send-reminders.js (ahí
// también se borra la fila apenas pasa esto). El resto de los errores (red, cuota, etc.) se
// dejan pasar para el próximo intento del cron.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

// Devuelve true si el token quedó muerto (para que el que llama borre la fila), false si
// mandó bien, y relanza cualquier otro error (falla transitoria, no hay que borrar nada).
async function sendFcmPush(token, title, body) {
  const app = getFirebaseApp();
  if (!app) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no está configurada');
  const admin = require('firebase-admin');
  try {
    await admin.messaging(app).send({ token, notification: { title, body } });
    return false;
  } catch (err) {
    if (DEAD_TOKEN_CODES.has(err && err.code)) return true;
    throw err;
  }
}

module.exports = { sendFcmPush };
