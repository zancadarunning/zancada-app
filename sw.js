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
