// api/_lib/cron-rotation.js
//
// Los crons de sincronización recorren TODAS las cuentas conectadas en orden y cortan a los 8 s (tope de la función). Sin
// rotación, el corte siempre cae en el mismo punto: las primeras cuentas de la lista se sincronizan en cada corrida y las
// últimas NUNCA (cada corrida arranca de cero y se queda sin tiempo antes de llegar). Con 10 usuarios no se nota; con 40 la
// mitad queda sin sincronizar para siempre.
//
// rotateForFairness() ordena por user_id (orden estable entre corridas) y arranca cada corrida en una posición distinta, sin
// guardar nada: la posición sale del reloj. `cadenceMs` es cada cuánto corre el cron (15 min, 1 h, 1 día) y `step` cuántas
// posiciones avanza por corrida; tiene que ser menor que lo que el cron alcanza a procesar en 8 s (~3 cuentas es muy
// conservador) para que ninguna cuenta quede sin visitar.
function rotateForFairness(list, cadenceMs, step, nowMs) {
  if (!Array.isArray(list) || list.length < 2) return Array.isArray(list) ? list : [];
  const sorted = list.slice().sort((a, b) => String(a && a.user_id).localeCompare(String(b && b.user_id)));
  const slot = Math.floor((nowMs == null ? Date.now() : nowMs) / (cadenceMs || 900000));
  const offset = (slot * (step || 3)) % sorted.length;
  return sorted.slice(offset).concat(sorted.slice(0, offset));
}

module.exports = { rotateForFairness };
