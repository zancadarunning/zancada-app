// api/_lib/safe-id.js
//
// Los ids de carreras que vienen de afuera (COROS, Suunto, Polar, Strava, Wahoo) terminan en el cliente dentro de atributos HTML
// (por ejemplo onclick="startDynamicVideo('<id>')"). Un id con comillas o signos rompería el atributo: solo se dejan caracteres seguros.
// Un id normal (números, letras, guiones) queda exactamente igual.
function safeId(value) {
  return String(value == null ? '' : value).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80);
}
module.exports = { safeId };
