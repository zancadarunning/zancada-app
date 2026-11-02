// api/_lib/safe-convert.js
//
// Convertir lo que manda un proveedor (Strava, Polar, Wahoo, Suunto, COROS) en una carrera puede tirar un error si UN dato viene roto (una fecha inválida, por ejemplo).
// Sin esto ese error cortaba la sincronización entera de la persona, y como el dato roto vuelve en cada pasada del cron, no volvía a sincronizar nunca más.
// Con esto la actividad rota se salta (queda en el log) y las demás siguen. Los errores de red o de base de datos NO pasan por acá: esos siguen tirando como siempre.

function safeConvertSync(fn, label) {
  try { return fn(); } catch (e) { console.error('safe-convert: ' + (label || 'actividad') + ' con datos rotos, se salta:', e && e.message); return null; }
}

async function safeConvert(fn, label) {
  try { return await fn(); } catch (e) { console.error('safe-convert: ' + (label || 'actividad') + ' con datos rotos, se salta:', e && e.message); return null; }
}

module.exports = { safeConvert, safeConvertSync };
