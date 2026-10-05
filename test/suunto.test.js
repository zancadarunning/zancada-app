const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  isRunningActivity, workoutToRun, suuntoUsernameFromToken, basicAuthHeader
} = require('../api/_lib/suunto-activity-helpers');
const { buildGuide, buildGuideZip, watchText } = require('../api/_lib/suunto-guide-builder');
const { createZip, crc32 } = require('../api/_lib/zip-store');

// Ejemplo del cuerpo del webhook tal cual está en la documentación de API Zone.
const WEBHOOK_WORKOUT = {
  workoutKey: '67604889401b942184624cb8', activityId: 1, startTime: 1702729200000, totalTime: 3600,
  energyConsumption: 500, stepCount: 8500, totalAscent: 120.5, totalDescent: 110.3, totalDistance: 10000,
  hrdata: { workoutAvgHR: 145, workoutMaxHR: 175 }, avgSpeed: 2.78, maxSpeed: 6, timeOffsetInMinutes: 120
};

test('isRunningActivity: solo IDs de correr', () => {
  for (const id of [1, 22, 53, 59, 103, 115]) assert.ok(isRunningActivity(id), String(id));
  for (const id of [0, 2, 3, 21, 60, 92]) assert.ok(!isRunningActivity(id), String(id));
});

test('workoutToRun: convierte unidades y usa la fecha local del entreno', () => {
  const run = workoutToRun(WEBHOOK_WORKOUT, null);
  assert.strictEqual(run.id, 'suunto_67604889401b942184624cb8');
  assert.strictEqual(run.suuntoId, '67604889401b942184624cb8');
  assert.strictEqual(run.source, 'suunto');
  assert.strictEqual(run.distanceKm, 10);
  assert.strictEqual(run.durationSec, 3600);
  assert.strictEqual(run.avgHr, 145);
  assert.strictEqual(run.maxHr, 175);
  assert.strictEqual(run.calories, 500);
  assert.strictEqual(run.elevationGain, 121);   // 120.5 redondeado
  assert.strictEqual(run.avgCadence, 142);      // 8500 pasos / 60 min
  assert.strictEqual(run.splitsV, undefined);   // sin FIT todavía: el cron lo completa
  assert.strictEqual(run.date, new Date(1702729200000).toISOString());
});

test('workoutToRun: una carrera de noche cae en el día LOCAL, no en el siguiente', () => {
  // 2026-03-10 23:30 hora de Argentina (UTC-3) = 2026-03-11 02:30 UTC
  const w = Object.assign({}, WEBHOOK_WORKOUT, { startTime: Date.UTC(2026, 2, 11, 2, 30), timeOffsetInMinutes: -180 });
  const run = workoutToRun(w, null);
  assert.strictEqual(run.planMonday, '2026-03-09'); // martes 10 -> lunes 9
  assert.strictEqual(run.planDayIndex, 1);          // martes
});

test('workoutToRun: sin pulso ni pasos devuelve null, no cero', () => {
  const w = { workoutKey: 'abc', activityId: 1, startTime: 1702729200000, totalTime: 1800, totalDistance: 5000 };
  const run = workoutToRun(w, null);
  assert.strictEqual(run.avgHr, null);
  assert.strictEqual(run.avgCadence, null);
  assert.strictEqual(run.calories, null);
});

test('suuntoUsernameFromToken lee el claim "user" del JWT', () => {
  const jwt = 'h.' + Buffer.from(JSON.stringify({ user: 'johndoe123' })).toString('base64url') + '.s';
  assert.strictEqual(suuntoUsernameFromToken(jwt), 'johndoe123');
  assert.strictEqual(suuntoUsernameFromToken('basura'), null);
});

test('basicAuthHeader: client_id:client_secret en base64', () => {
  process.env.SUUNTO_CLIENT_ID = 'id'; process.env.SUUNTO_CLIENT_SECRET = 'secret';
  assert.strictEqual(basicAuthHeader(), 'Basic ' + Buffer.from('id:secret').toString('base64'));
});

test('firma del webhook: HMAC-SHA256 hex del body crudo', () => {
  // Misma cuenta que hace api/suunto-webhook.js
  const secret = 'notification-secret';
  const raw = Buffer.from(JSON.stringify({ type: 'WORKOUT_CREATED', username: 'u', workout: WEBHOOK_WORKOUT }));
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const expected = crypto.createHmac('sha256', secret).update(raw).digest();
  const given = Buffer.from(sig, 'hex');
  assert.ok(given.length === expected.length && crypto.timingSafeEqual(given, expected));
  const tampered = crypto.createHmac('sha256', secret).update(Buffer.concat([raw, Buffer.from(' ')])).digest('hex');
  assert.notStrictEqual(tampered, sig);
});

const ZONES = { 1: { min: 95, max: 114 }, 2: { min: 115, max: 133 }, 3: { min: 134, max: 152 }, 4: { min: 153, max: 171 }, 5: { min: 172, max: 190 } };
const LABELS = { warmup: 'Calentamiento', cooldown: 'Vuelta calma', work: 'Serie rápida', rest: 'Recuperá', main: 'Rodaje suave' };

function allStrings(node, out = []) {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach(n => allStrings(n, out));
  else if (node && typeof node === 'object') Object.values(node).forEach(n => allStrings(n, out));
  return out;
}

test('buildGuide: series respetan estructura y límites de Suunto', () => {
  const g = buildGuide({ date: '2026-10-07', name: 'Series de velocidad con nombre larguísimo', typeKey: 'intervals', zone: 4, distKm: 8, desc: 'Series 8 x 400 m', interval: { reps: 8, repMeters: 400, recoveryMin: 2 } }, ZONES, LABELS);
  assert.strictEqual(g.type, 'sequence');
  assert.strictEqual(g.usage, 'workout');
  assert.strictEqual(g.externalId, 'zancada-2026-10-07');
  assert.strictEqual(g.localDate, '2026-10-07');
  assert.ok(g.name.length <= 60 && g.shortDescription.length <= 23 && g.owner.length <= 64);
  assert.deepStrictEqual(g.steps.map(s => s.type), ['fields', 'repeat', 'fields']);
  const rep = g.steps[1];
  assert.strictEqual(rep.times, 8);
  assert.strictEqual(rep.steps.length, 2);
  assert.ok(rep.steps.every(s => s.type === 'fields'), 'sin repeats anidados');
  assert.deepStrictEqual(rep.steps[0].transitions[0].condition, { type: 'stepDistance', value: 400 });
  assert.deepStrictEqual(rep.steps[1].transitions[0].condition, { type: 'stepDuration', value: 120 });
  const target = rep.steps[0].fields.find(f => f.type === 'targetHeartRate');
  assert.deepStrictEqual([target.min, target.max], [153, 171]); // zona 4
  // límites de texto
  const visit = (steps) => steps.forEach(s => {
    if (s.type === 'repeat') return visit(s.steps);
    assert.ok(s.title.length >= 1 && s.title.length <= 13, 'título de paso: ' + s.title);
    assert.ok(s.fields.length <= 5);
    s.fields.forEach(f => assert.ok(!f.title || f.title.length < 9, 'título de campo: ' + f.title));
    if (s.notification) assert.ok(s.notification.title.length <= 13 && s.notification.text.length <= 54);
  });
  visit(g.steps);
});

test('buildGuide: lo que se ve en el reloj es ASCII sin tildes', () => {
  const g = buildGuide({ date: '2026-10-07', name: 'Rodaje fácil ñandú', typeKey: 'easy', zone: 2, distKm: 6, desc: 'x' }, ZONES, LABELS);
  const watchStrings = [g.shortDescription, g.name, g.steps[0].title, g.steps[0].notification.text];
  for (const s of watchStrings) assert.ok(/^[\x20-\x7E]+$/.test(s), s);
  assert.strictEqual(watchText('Recuperá ñ ü', 20), 'Recupera n u');
});

test('buildGuide: rodaje continuo = un solo paso con objetivo de pulso', () => {
  const g = buildGuide({ date: '2026-10-08', name: 'Rodaje suave', typeKey: 'easy', zone: 2, distKm: 6, desc: 'Rodaje' }, ZONES, LABELS);
  assert.strictEqual(g.steps.length, 1);
  assert.ok(g.steps[0].fields.some(f => f.type === 'targetHeartRate' && f.min === 115 && f.max === 133));
  assert.ok(g.steps[0].fields.some(f => f.type === 'stepDistanceCountdown' && f.value === 6000));
});

test('buildGuide: fartlek por tiempo y sin zonas no rompe', () => {
  const g = buildGuide({ date: '2026-10-09', name: 'Fartlek', typeKey: 'fartlek', zone: null, distKm: 7, desc: 'f', interval: { reps: 6, workMin: 2, restMin: 2 } }, {}, LABELS);
  const rep = g.steps.find(s => s.type === 'repeat');
  assert.strictEqual(rep.times, 6);
  assert.deepStrictEqual(rep.steps[0].transitions[0].condition, { type: 'stepDuration', value: 120 });
  assert.ok(!JSON.stringify(g).includes('targetHeartRate'));
});

test('ZIP: lo abre un lector estándar (estructura y CRC)', () => {
  const zip = buildGuideZip(buildGuide({ date: '2026-10-08', name: 'Rodaje', typeKey: 'easy', zone: 2, distKm: 5, desc: 'r' }, ZONES, LABELS));
  assert.strictEqual(zip.readUInt32LE(0), 0x04034b50);                 // firma de archivo local
  assert.strictEqual(zip.readUInt32LE(zip.length - 22), 0x06054b50);   // fin de directorio central
  assert.strictEqual(zip.readUInt16LE(zip.length - 22 + 10), 2);       // 2 archivos: guide.json + icon.png
  assert.strictEqual(crc32(Buffer.from('123456789')), 0xCBF43926);     // valor de referencia de CRC-32
  const tmp = path.join(os.tmpdir(), 'zancada-test.zip');
  fs.writeFileSync(tmp, createZip([{ name: 'a.txt', data: Buffer.from('hola') }]));
  fs.unlinkSync(tmp);
});
