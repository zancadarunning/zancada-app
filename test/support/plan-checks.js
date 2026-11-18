// Reglas que el plan semanal NO puede romper, sea cual sea el perfil. Las usan las pruebas de combinaciones completas.
const assert = require('node:assert/strict');

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TYPES = new Set(['rest', 'test', 'race', 'easy', 'long', 'intervals', 'tempo', 'fartlek', 'hills', 'progression']);
const HARD = ['intervals', 'tempo', 'fartlek', 'hills', 'progression'];
const MONDAY = '2026-09-07';
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const subsets = []; for (let m = 1; m < 128; m++) subsets.push(DAY_KEYS.filter((_, i) => m & (1 << i)));

const sizeOf = (d, p) => ((p.trainBy === 'time' ? d.durMin : d.dist) || 0);

// Revisa UNA semana ya armada. opts.noRace: el perfil no tiene carrera objetivo (reglas más estrictas).
function checkWeek(a, p, plan, w, label) {
  assert.equal(plan.length, 7, label + ': 7 días');
  const used = new Set();
  plan.forEach((d, i) => {
    assert.equal(d.day, DAY_KEYS[i], label + ': día ' + i);
    assert.ok(TYPES.has(d.typeKey), `${label}: tipo desconocido ${d.typeKey}`);
    (function walk(v, path) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${label}: ${path} no es un número válido (${v})`);
      else if (Array.isArray(v)) v.forEach((x, k) => walk(x, path + '[' + k + ']'));
      else if (v && typeof v === 'object') Object.keys(v).forEach(k => { assert.notEqual(v[k], undefined, `${label}: ${path}.${k} undefined`); walk(v[k], path + '.' + k); });
    })(d, 'dia' + i);
    if (d.typeKey === 'rest') return;
    used.add(d.day);
    if (d.typeKey === 'test' || d.typeKey === 'race') return;
    assert.ok(Number.isInteger(d.zone) && d.zone >= 1 && d.zone <= 5, `${label}: zona ${d.zone}`);
    assert.ok(d.dist >= 0 && d.dist <= 75, `${label}: distancia ${d.dist}`);
    assert.ok(sizeOf(d, p) > 0, `${label}: sesión sin tamaño (${d.typeKey})`);
    if (p.trainBy === 'time') assert.ok(d.durMin > 0 && d.durMin <= 400, `${label}: duración ${d.durMin}`);
    if (d.typeKey === 'easy') assert.ok(d.zone <= 2, `${label}: rodaje en zona ${d.zone}`);
    if (d.typeKey === 'long') assert.ok(d.zone <= 2, `${label}: tirada en zona ${d.zone}`);
    if (d.typeKey === 'intervals' || d.typeKey === 'hills') assert.ok(d.zone >= 4, `${label}: ${d.typeKey} en zona ${d.zone}`);
    if (a.avoidsHills(p)) assert.notEqual(d.typeKey, 'hills', label + ': sin cuestas');
    if (p.trainBy !== 'time' && d.typeKey === 'intervals' && d.interval && d.interval.repMeters) assert.ok(Math.abs(d.interval.reps * d.interval.repMeters / 1000 - d.dist) <= 0.6, `${label}: series ${d.interval.reps}x${d.interval.repMeters} vs ${d.dist} km`);
  });
  const sess = plan.filter(d => d.typeKey !== 'rest' && d.typeKey !== 'test' && d.typeKey !== 'race');
  assert.ok(used.size <= p.trainingDays.length || p.raceDate, `${label}: más sesiones (${used.size}) que días elegidos (${p.trainingDays.length})`);
  if (!p.raceDate) {
    assert.ok(used.size >= 1, label + ': al menos una sesión');
    used.forEach(d => assert.ok(p.trainingDays.includes(d), `${label}: sesión en un día no elegido (${d})`));
    // la tirada es la más larga
    const longs = sess.filter(d => d.typeKey === 'long');
    if (longs.length && sess.length > 1) assert.ok(Math.max(...longs.map(d => sizeOf(d, p))) >= Math.max(...sess.map(d => sizeOf(d, p))) - 1e-9, `${label}: la tirada no es la más larga (${sess.map(d => d.typeKey[0] + sizeOf(d, p)).join(' ')})`);
    // nunca dos días fuertes seguidos
    // El test de nivel (12 min) se pone en un rodaje y, si el plan de 6-7 días no deja otro, queda pegado a un día fuerte: por eso no entra en la regla de adyacencia (sí en el conteo).
    const isHard = d => HARD.includes(d.typeKey);
    for (let i = 0; i < 6; i++) assert.ok(!(isHard(plan[i]) && isHard(plan[i + 1])), `${label}: dos días fuertes seguidos (${plan[i].day} ${plan[i].typeKey} + ${plan[i + 1].typeKey})`);
    // no más de la mitad de las sesiones (mínimo 1) pueden ser fuertes
    const hards = plan.filter(d => isHard(d) || d.typeKey === 'test').length;
    assert.ok(hards <= Math.max(1, Math.floor(used.size / 2)), `${label}: demasiados días fuertes (${hards} de ${used.size})`);
  }
  // reglas del principiante
  if (a.isBeginnerProfile(p)) {
    const base = a.hasRunningImpactBase(p);
    sess.forEach(d => {
      assert.ok(!['intervals', 'hills'].includes(d.typeKey), `${label}: un principiante no hace ${d.typeKey}`);
      if (w <= 2 && !base && !p.raceDate && d.typeKey === 'easy') assert.equal(d.zone, 1, `${label}: semanas 1-2 en zona 1`);
      if (w >= 3 && d.typeKey === 'easy' && !(p.raceDate && d.dist <= 3)) assert.equal(d.zone, 2, `${label}: desde la semana 3 los rodajes son zona 2`);
    });
  }
  return sess.reduce((s, d) => s + sizeOf(d, p), 0);
}

module.exports = { DAY_KEYS, TYPES, HARD, MONDAY, addDays, subsets, sizeOf, checkWeek };
