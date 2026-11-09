// sw.js — corre en segundo plano, incluso con la app cerrada, para poder mostrar notificaciones.
self.addEventListener('push', (event) => {
  let data = { title: 'Zancada', body: '' };
  try {
    // event.data.json() no tira si el payload es JSON válido pero no un objeto (el caso real:
    // el literal "null", que un bug de plantilla del lado del backend puede mandar) -- antes
    // "data = event.data.json()" pisaba el default con null directamente, y la siguiente línea
    // (data.body) reventaba el handler entero ANTES de llamar a showNotification, así que la
    // notificación no se mostraba ni con el título/cuerpo default de acá arriba.
    const parsed = event.data ? event.data.json() : null;
    if (parsed && typeof parsed === 'object') data = parsed;
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png'
  };
  if(data.tag) options.tag = data.tag;   // misma etiqueta = la notificación nueva reemplaza a la anterior
  event.waitUntil(self.registration.showNotification(data.title || 'Zancada', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

/* ---- app sin conexión ----
   Salir a correr es justo cuando más falla la señal, y en el iPhone el sistema puede cerrar la app en segundo plano: al volver a abrirla sin red quedaba la pantalla en blanco y no se podía ni recuperar la carrera.
   Estrategia conservadora, RED PRIMERO: con señal se pide siempre la versión nueva (así no choca con el chequeo de versión de la app, que pide /app.js con Range o ?_v= y NO pasa por acá), y cada
   respuesta buena se guarda. Sin red, o si la red tarda más de 4 s, se usa la última copia guardada. Solo archivos propios del sitio (GET, mismo origen, nunca /api/): sin datos de nadie. */
const SHELL_CACHE = 'zancada-shell-v1';
const SHELL_FILES = [
  '/', '/app.js', '/manifest.json', '/icon-192.png',
  '/js/boot-theme.js', '/js/boot-session.js', '/js/boot-styles.js', '/js/boot-splash.js', '/js/boot-locale.js', '/js/ui-events.js',
  '/locales/es.js', '/locales/en.js', '/locales/pt.js', '/locales/fr.js', '/locales/it.js', '/locales/de.js',
  '/vendor/fonts/fonts.css', '/vendor/leaflet/leaflet.min.css', '/vendor/leaflet/leaflet.min.js', '/vendor/supabase-js.js'
];
const NETWORK_WAIT_MS = 4000;

self.addEventListener('install', (event) => {
  // se guarda lo que se pueda: si un archivo falla, los demás igual quedan (y se completan con el uso normal)
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => Promise.all(SHELL_FILES.map(f => cache.add(new Request(f, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('zancada-shell-') && k !== SHELL_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// La clave de la copia ignora los parámetros (?source=pwa, ?_r=...): "/?source=pwa" y "/" son la misma pantalla.
function shellKey(url) { return new Request(url.origin + url.pathname); }
async function networkFirst(request, key) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(key);
  const net = fetch(request).then(res => {
    if (res && res.status === 200 && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
    else if (res && res.status >= 500 && cached) return cached;
    return res;
  });
  if (!cached) return net;
  return Promise.race([net, new Promise(resolve => setTimeout(() => resolve(cached), NETWORK_WAIT_MS))]).catch(() => cached);
}
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;            // el chequeo de versión (Range) y todo lo que no sea GET va directo a la red
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                          // Supabase, Mapbox, etc.: nunca
  if (url.pathname.startsWith('/api/') || url.searchParams.has('_v')) return;
  event.respondWith(networkFirst(req, shellKey(url)).catch(() => fetch(req)));
});
