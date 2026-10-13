// api/_lib/own.js
//
// Búsqueda segura en objetos-diccionario con claves que pueden venir de datos del usuario (por ejemplo `row.lang` de app_state,
// que cada cuenta escribe con su propio JWT). `MSGS[row.lang]` con lang = 'constructor' o '__proto__' devuelve propiedades heredadas
// de Object (una función, no un diccionario) y rompía el cron de recordatorios para TODOS. Acá solo cuentan las claves propias.

function pick(dict, key, fallbackKey) {
  if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
  return dict[fallbackKey];
}

// Devuelve la clave si es propia del diccionario, o `fallbackKey`.
function ownKey(dict, key, fallbackKey) {
  return (typeof key === 'string' && Object.prototype.hasOwnProperty.call(dict, key)) ? key : fallbackKey;
}

module.exports = { pick, ownKey };
