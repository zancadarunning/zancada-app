// GPS y series fuera de app_state (tabla run_tracks, sql/run_tracks.sql): lo que hace el cliente.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load-app');

const pts = n => Array.from({ length: n }, (_, i) => ({ lat: -34.6 + i * 1e-4, lon: -58.4 + i * 1e-4, t: i * 4 }));
const series = () => ({ t: [1, 2, 3], hr: [120, 130, 140], paceMin: [6, 6, 6] });
const iso = daysAgo => new Date(Date.now() - daysAgo * 864e5).toISOString();

async function appWith({ enabled, onTrack, onUpsert }) {
  const uploads = [];
  const app = loadApp({
    onRpc: (name) => (name === 'tracks_enabled' ? { data: enabled, error: null } : { data: null, error: { message: 'x' } }),
    onTrack,
    onUpsert: (payload) => { uploads.push(payload); return Promise.resolve({ data: [{ user_id: 'u1' }], error: null }); },
  });
  app.setCurrentUserId('u1');
  app.state.onboarded = true;
  await app.detectTracksEnabled();
  return { app, uploads };
}

test('runNeedsTrack: liviana si el servidor guarda más puntos o series que faltan acá', () => {
  const a = loadApp();
  assert.equal(a.runNeedsTrack({ points: pts(60), trkN: 300 }), true);
  assert.equal(a.runNeedsTrack({ points: pts(300), trkN: 300 }), false, 'ya completa');
  assert.equal(a.runNeedsTrack({ points: pts(40), trkS: true }), true, 'faltan las series');
  assert.equal(a.runNeedsTrack({ points: pts(40), trkS: true, series: series() }), false);
  assert.equal(a.runNeedsTrack({ points: pts(300) }), false, 'sin marcas (carrera nueva o base sin separar): nada para bajar');
  assert.equal(a.runNeedsTrack(null), false);
});

test('sin la confirmación de la base (tracks_enabled) todo se sube completo, como siempre: nunca una versión liviana a una base que no la entiende', async () => {
  const { app, uploads } = await appWith({ enabled: false });
  app.state.runs = [{ id: 'a', date: iso(1), distanceKm: 5, durationSec: 1800, points: pts(300), series: series(), trkN: 300, trkS: true }];
  await app.persist();
  const run = uploads[0].data.runs[0];
  assert.equal(run.points.length, 300);
  assert.ok(run.series);
});

test('con la separación activa: lo ya separado sube liviano; lo nuevo sube completo y después se marca (y la siguiente vez ya sube liviano)', async () => {
  const { app, uploads } = await appWith({ enabled: true });
  app.state.runs = [
    { id: 'viejo', date: iso(3), distanceKm: 5, durationSec: 1800, points: pts(300), series: series(), trkN: 300, trkS: true },   // bajada completa al abrir el detalle
    { id: 'nuevo', date: iso(0), distanceKm: 6, durationSec: 2000, points: pts(250), series: series() },                            // recién grabada
    { id: 'corta', date: iso(1), distanceKm: 1, durationSec: 400, points: pts(30) },                                                // pocos puntos: no se separa
  ];
  await app.persist();
  const [viejo, nuevo, corta] = uploads[0].data.runs;
  assert.ok(viejo.points.length <= 60 && viejo.points.length > 2, 'liviana: ' + viejo.points.length);
  assert.equal(viejo.series, undefined);
  assert.equal(viejo.trkN, 300, 'conserva las marcas');
  assert.equal(nuevo.points.length, 250, 'la nueva sube completa para que el servidor la separe');
  assert.ok(nuevo.series);
  assert.equal(corta.points.length, 30);
  // en memoria la carrera vieja sigue completa (el detalle la usa) y no se mutó
  assert.equal(app.state.runs[0].points.length, 300);
  assert.ok(app.state.runs[0].series);
  // la nueva quedó marcada como separada
  assert.equal(app.state.runs[1].trkN, 250);
  assert.equal(app.state.runs[1].trkS, true);
  assert.equal(app.state.runs[2].trkN, undefined);
  await app.persist();
  const nuevo2 = uploads[1].data.runs[1];
  assert.ok(nuevo2.points.length <= 60 && nuevo2.series === undefined, 'la segunda vez ya sube liviana');
});

test('ensureRunTrack baja el recorrido y las series una sola vez (queda en memoria) y nunca tira si falla', async () => {
  let consultas = 0;
  const { app } = await appWith({
    enabled: true,
    onTrack: ({ eq }) => { consultas++; return { data: { points: pts(300), series: series() }, error: null }; },
  });
  const r = { id: 'x', date: iso(2), distanceKm: 5, durationSec: 1800, points: pts(60), trkN: 300, trkS: true };
  app.state.runs = [r];
  await app.ensureRunTrack(r);
  assert.equal(r.points.length, 300);
  assert.ok(r.series && r.series.hr.length === 3);
  assert.equal(consultas, 1);
  const r2 = { id: 'x', date: iso(2), distanceKm: 5, durationSec: 1800, points: pts(60), trkN: 300, trkS: true };   // otro objeto (el estado se volvió a leer del servidor)
  await app.ensureRunTrack(r2);
  assert.equal(r2.points.length, 300);
  assert.equal(consultas, 1, 'la segunda vez sale de la memoria');

  const { app: app2 } = await appWith({ enabled: true, onTrack: () => { throw new Error('sin red'); } });
  const r3 = { id: 'y', date: iso(1), distanceKm: 5, durationSec: 1800, points: pts(60), trkN: 300 };
  await assert.doesNotReject(() => app2.ensureRunTrack(r3));
  assert.equal(r3.points.length, 60, 'queda la versión liviana');
});

test('hydrateRecentTracks: un solo pedido con las carreras recientes que lo necesitan (las viejas y las ya completas no)', async () => {
  const pedidos = [];
  const { app } = await appWith({
    enabled: true,
    onTrack: ({ kind, in: inn }) => { pedidos.push({ kind, ids: inn.run_id }); return { data: inn.run_id.map(id => ({ run_id: id, points: pts(200), series: series() })), error: null }; },
  });
  app.state.runs = [
    { id: 'reciente1', date: iso(2), points: pts(60), trkN: 200 },
    { id: 'reciente2', date: iso(10), points: pts(60), trkN: 200 },
    { id: 'vieja', date: iso(120), points: pts(60), trkN: 200 },
    { id: 'completa', date: iso(1), points: pts(200), trkN: 200, series: series() },
  ];
  const n = await app.hydrateRecentTracks();
  assert.equal(n, 2);
  assert.equal(pedidos.length, 1);
  assert.deepEqual([...pedidos[0].ids].sort(), ['reciente1', 'reciente2']);
  assert.equal(app.state.runs[0].points.length, 200);
  assert.equal(app.state.runs[2].points.length, 60, 'la vieja queda liviana hasta que se abra');
});

test('una carrera en versión liviana no se evalúa contra el plan (con ~60 puntos y sin pulso daría tramos equivocados)', () => {
  const a = loadApp();
  const plan = a.planStepsFromPayload({ distKm: 5, typeKey: 'easy', zone: 2, warmupMin: 5, cooldownMin: 5 });
  const run = { id: 'r', distanceKm: 5, durationSec: 1800, points: pts(60), trkN: 300 };
  assert.equal(a.evaluateRunSteps(run, plan, null), null);
});

test('al recuperar un respaldo reducido se copian las marcas trkN/trkS del servidor (sin ellas la carrera perdería el aviso de su recorrido guardado)', () => {
  const a = loadApp();
  a.state.runs = [{ id: 'r1', date: iso(5), distanceKm: 5, durationSec: 1800, points: pts(60), trkN: 300, trkS: true }];
  const backup = { onboarded: true, profile: {}, plan: [], runs: [{ id: 'r1', date: iso(5), distanceKm: 5, durationSec: 1800 }], shoes: [], chat: [] };
  const hay = a.applyPendingBackup({ ts: Date.now() + 1000, reduced: true, data: backup }, Date.now() - 100000);
  assert.equal(hay, true);
  const r = a.getState().runs[0];
  assert.equal(r.trkN, 300);
  assert.equal(r.trkS, true);
  assert.equal(r.points.length, 60);
});

test('el servidor: sql/run_tracks.sql separa por trigger, con RLS de solo lectura propia, borrado de recorridos y tracks_enabled() condicionada al trigger', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'run_tracks.sql'), 'utf8');
  assert.match(sql, /alter table public\.run_tracks enable row level security/i);
  assert.match(sql, /create policy run_tracks_select_own on public\.run_tracks for select to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.ok(!/create policy [^;]*for (insert|update|delete|all)/i.test(sql), 'ningún cliente escribe en run_tracks');
  assert.match(sql, /references auth\.users\(id\) on delete cascade/i);
  assert.match(sql, /before insert or update of data on public\.app_state/i);
  assert.match(sql, /after delete on public\.app_state/i);
  assert.match(sql, /security definer set search_path = public, pg_temp/i);
  assert.match(sql, /revoke all on function public\.app_state_split_tracks\(\) from public, anon, authenticated/i);
  assert.match(sql, /tgname = 'app_state_split_tracks_trg'/);   // tracks_enabled() solo es true si el trigger existe y está activo
  assert.match(sql, /nunca se reemplaza algo mas largo por algo mas corto/i);
});
