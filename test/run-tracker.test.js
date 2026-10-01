// test/run-tracker.test.js
//
// Bug reportado (encontrado en una auditoría, no por un usuario todavía): al recuperar una
// carrera trackeada después de que la app se cerrara sola a mitad de un entrenamiento (poca
// batería, el sistema mata la pestaña, etc. -- ver actuallyStartRun/startRun), elapsedSec se
// recalculaba como Date.now()-startedAt, es decir el reloj de pared COMPLETO desde que arrancó
// la carrera. Eso contaba cualquier rato con la app cerrada (justo el caso que esta
// recuperación existe para cubrir) como si hubiera sido tiempo corriendo -- cerrar la app 2
// horas a mitad de una carrera y recuperarla después inflaba la duración guardada en 2 horas,
// arruinando el ritmo/las calorías de esa carrera para siempre. distanceKm/points/hrLog ya se
// restauraban tal cual quedaron guardados (sin extrapolar nada, porque no se grabó ningún punto
// de GPS durante el cierre) -- la solución hace que elapsedSec se comporte igual: se guarda en
// cada saveRunProgress() y se restaura tal cual en actuallyStartRun, sin depender del reloj.
//
// actuallyStartRun en sí no es fácil de probar acá (necesita geolocalización real, un mapa de
// Leaflet, etc. -- nada de eso existe en este sandbox mínimo), así que este test cubre el lado
// que sí es lógica pura: que el progreso guardado en localStorage efectivamente incluya
// elapsedSec, que es la pieza de datos que faltaba.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load-app');

test('saveRunProgress guarda elapsedSec (no solo distanceKm/points/hrLog)', () => {
  const app = loadApp();
  app.setCurrentUserId('user-de-prueba'); // runProgressKey() incluye el user_id, ver app.js
  app.setTracker({
    startedAt: Date.now() - 20 * 60 * 1000, // arrancó hace 20 minutos de reloj
    points: [{ lat: 0, lon: 0, t: 0, alt: null }],
    distanceKm: 3.2,
    hrLog: [],
    lastAnnouncedKm: 3,
    elapsedSec: 754, // tiempo activo real -- bastante menos que los 20 minutos de reloj, porque hubo una pausa
  });

  app.saveRunProgress();
  const saved = app.readRunProgress();

  assert.equal(saved.elapsedSec, 754, 'el progreso guardado tiene que llevar elapsedSec tal cual, para no tener que recalcularlo con el reloj de pared al recuperar la carrera');
  assert.equal(saved.distanceKm, 3.2);
  assert.equal(saved.lastAnnouncedKm, 3);
});

test('saveRunProgress guarda running (para no reanudar corriendo una carrera que se pausó a mano)', () => {
  // Bug hermano del de elapsedSec (ver el comentario de arriba del archivo): togglePause()
  // llama a saveRunProgress() justo al pausar a mano, para poder recuperar el progreso lo más
  // cerca posible del momento real de la pausa -- pero sin este campo, actuallyStartRun() no
  // tenía forma de saber que la carrera estaba pausada al cerrarse la app (batería, el sistema
  // mata la app, etc.) y la recuperaba SIEMPRE como si estuviera corriendo, retomando GPS y
  // distancia sin que el corredor tocara nada.
  const app = loadApp();
  app.setCurrentUserId('user-de-prueba');
  app.setTracker({
    startedAt: Date.now() - 10 * 60 * 1000,
    points: [],
    distanceKm: 2,
    hrLog: [],
    lastAnnouncedKm: 2,
    elapsedSec: 500,
    running: false, // pausada a mano justo antes de guardar
  });

  app.saveRunProgress();
  const saved = app.readRunProgress();

  assert.equal(saved.running, false, 'el progreso guardado tiene que reflejar que la carrera estaba pausada, no asumir que sigue corriendo');
});

test('saveRunProgress no guarda nada si no hay una carrera en curso (sin startedAt)', () => {
  const app = loadApp();
  app.setTracker({ startedAt: null, points: [], distanceKm: 0, hrLog: [], lastAnnouncedKm: 0, elapsedSec: 0 });

  app.saveRunProgress();

  assert.equal(app.readRunProgress(), null);
});

test('clearRunProgress borra el progreso guardado', () => {
  const app = loadApp();
  app.setCurrentUserId('user-de-prueba');
  app.setTracker({ startedAt: Date.now(), points: [], distanceKm: 1, hrLog: [], lastAnnouncedKm: 1, elapsedSec: 300 });

  app.saveRunProgress();
  assert.ok(app.readRunProgress());

  app.clearRunProgress();
  assert.equal(app.readRunProgress(), null);
});

test('la carrera en progreso queda por usuario, no en un mismo cajón para todos', () => {
  // Reportado en una auditoría: RUN_PROGRESS_KEY era una sola clave global de
  // localStorage -- en un dispositivo compartido, la Cuenta B podía "recuperar" y seguir
  // grabando GPS/FC sobre la carrera sin terminar de la Cuenta A, si esta nunca cerró
  // sesión explícitamente después de que la app se cerrara a la fuerza a mitad de la
  // carrera. runProgressKey() ahora incluye el user_id, igual que pendingBackupKey().
  const app = loadApp();

  app.setCurrentUserId('cuenta-a');
  app.setTracker({ startedAt: Date.now(), points: [], distanceKm: 5, hrLog: [], lastAnnouncedKm: 5, elapsedSec: 1500 });
  app.saveRunProgress();

  app.setCurrentUserId('cuenta-b');
  assert.equal(app.readRunProgress(), null, 'la Cuenta B no debería ver la carrera sin terminar de la Cuenta A');

  app.setCurrentUserId('cuenta-a');
  assert.ok(app.readRunProgress(), 'la Cuenta A sí debería poder recuperar su propia carrera');
});

test('getDisplaySplits: en modo imperial recalcula los tramos por milla real, no por km relabeleado', () => {
  // r.splits siempre viene armado en tramos de 1KM (se calcula del lado del servidor al
  // sincronizar, sin importar la unidad del corredor). renderRDSegmentos/renderRDRitmo
  // mostraban esos mismos tramos de 1km con la distancia/ritmo ya CONVERTIDOS a millas --
  // un tramo entero de 1km terminaba mostrando "0.62 mi", describiendo mal el tramo real (no
  // es solo una etiqueta rara: la fila entera describe una distancia que no es la del tramo).
  // getDisplaySplits() recalcula los tramos de cero por milla real a partir del recorrido
  // (r.points), usando el tiempo real por punto GPS cuando está disponible.
  const app = loadApp();
  app.state.profile = { units: 'imperial' };
  const R = 6371; // mismo radio que usa haversine() en app.js
  const totalKm = 5;
  const paceMinPerKm = 5; // ritmo constante real: 5:00/km
  const totalSec = totalKm * paceMinPerKm * 60;
  const numPoints = 500;
  const points = [];
  for(let i=0;i<numPoints;i++){
    const fracDist = i/(numPoints-1);
    const distKm = fracDist*totalKm;
    points.push({lat:0, lon:(distKm/R)*(180/Math.PI), t: Math.round(fracDist*totalSec), alt:null});
  }
  const run = { points, durationSec: totalSec, distanceKm: totalKm };

  const splits = app.getDisplaySplits(run);

  // 5km = ~3.11 millas -> 3 tramos completos de 1 milla + un resto de ~0.11 milla.
  assert.equal(splits.length, 4, `debería dar 3 millas completas + 1 resto, dio ${splits.length} tramos`);
  assert.deepEqual(Array.from(splits.slice(0,3).map(s=>s.km)), [1,2,3], 'los primeros 3 tramos deberían estar numerados como millas enteras');
  splits.slice(0,3).forEach(s=>{
    assert.ok(Math.abs(s.paceMin - 5) < 0.05, `cada tramo de 1 milla real, a ritmo constante de 5:00/km, debería seguir dando ~5:00/km, dio ${s.paceMin}`);
  });
  assert.ok(splits[3].km > 0 && splits[3].km < 1, 'el resto debería ser una fracción de milla, no de km');
});

test('getDisplaySplits: en modo métrico, o sin puntos de recorrido, usa r.splits tal cual (sin recalcular)', () => {
  const app = loadApp();
  const rSplits = [{km:1, paceMin:5, avgHr:null, avgCadence:null}, {km:2, paceMin:5.2, avgHr:null, avgCadence:null}];

  app.state.profile = { units: 'metric' };
  assert.equal(app.getDisplaySplits({ splits: rSplits, points: [] }), rSplits, 'en métrico no debería tocar r.splits');

  app.state.profile = { units: 'imperial' };
  assert.equal(app.getDisplaySplits({ splits: rSplits, points: [] }), rSplits, 'sin puntos de recorrido (carrera manual, Health Connect) debería caer de vuelta a r.splits');
});

test('renderRDSegmentos/renderRDRitmo: una carrera SIN ruta (Polar/Wahoo, ver exerciseToRun en polar-activity-helpers.js -- points siempre []) muestra sus splits reales en KM aunque el corredor esté en modo imperial, en vez de repetir el bug de "0.62 mi" ya arreglado para el caso con ruta real', () => {
  // getDisplaySplits ya cae de vuelta a r.splits (tramos de 1km reales, calculados del lado
  // del servidor a partir del FIT -- ver buildSplitsAndSeriesFromFitRecords) cuando no hay
  // puntos GPS para recalcular por milla (test de arriba). Pero renderRDSegmentos/
  // renderRDRitmo (los que arman la tabla/las barras que ve el corredor) usaban ciegamente
  // distUnit()/isImperial() para el rótulo y la conversión de distancia de esa tabla, sin
  // fijarse si getDisplaySplits había logrado recalcular de verdad o si había caído de
  // vuelta a los tramos de 1km -- mostrando "0.62 mi" para lo que en realidad es un tramo
  // entero de 1km, exactamente el bug que el comentario de rebucketSplitsByDistance dice
  // haber arreglado, pero solo para carreras CON ruta.
  const app = loadApp();
  const cache = new Map();
  const origGetById = app.document.getElementById.bind(app.document);
  app.document.getElementById = (id) => {
    if (!cache.has(id)) cache.set(id, origGetById(id));
    return cache.get(id);
  };

  app.state.profile = { name: 'Test', units: 'imperial', weight: 70 };
  app.state.runs = [{
    id: 'r1',
    date: new Date().toISOString(),
    distanceKm: 3.4,
    durationSec: 1200,
    points: [], // Polar/Wahoo nunca guardan la ruta, solo splits (ver exerciseToRun)
    splits: [
      { km: 1, paceMin: 5.5, avgHr: null, avgCadence: null },
      { km: 2, paceMin: 5.6, avgHr: null, avgCadence: null },
      { km: 3, paceMin: 5.4, avgHr: null, avgCadence: null },
      { km: 0.4, paceMin: 5.7, avgHr: null, avgCadence: null },
    ],
  }];

  app.openRunDetail('r1');

  app.switchRDTab('segmentos');
  const segHtml = cache.get('rd-panel-segmentos').innerHTML;
  assert.match(segHtml, /<th>KM<\/th>/, 'el encabezado de la tabla de segmentos debería decir KM, no MI, sin ruta real para recalcular por milla');
  assert.doesNotMatch(segHtml, />0\.62</, 'un tramo entero de 1km no debería mostrarse como "0.62" (su conversión a millas) en la columna de distancia');
  assert.match(segHtml, /<td>1\.00<\/td>/, 'un tramo entero debería seguir mostrando 1.00 (km reales), no la conversión a millas');
  assert.match(segHtml, /<td>3\.40<\/td>/, 'la fila de total debería mostrar la distancia real en km (3.40), coherente con el resto de la tabla, no 2.11mi');

  app.switchRDTab('ritmo');
  const ritmoHtml = cache.get('rd-panel-ritmo').innerHTML;
  assert.match(ritmoHtml, /<span>km<\/span>/, 'el rótulo de la columna de tramos en Ritmo debería decir km, no mi, sin ruta real');
});

test('isLikelyDuplicateOfExistingRun: no confunde una entrada en calor corta con la sesión fuerte que sigue, aunque tengan distancia parecida', () => {
  // El chequeo de duplicados entre fuentes (Health Connect vs. Strava/Polar/Wahoo, ver el
  // comentario junto a la función) solo miraba hora de inicio (10 min) y distancia (10%) --
  // una entrada en calor corta seguida, unos minutos después, de una serie/tiempo fuerte con
  // distancia parecida (3km trotando + 3.2km fuerte) caía en esa misma ventana y las dos
  // actividades reales y distintas se trataban como una sola, perdiendo una para siempre.
  // La MISMA actividad sincronizada dos veces (el caso real que esto existe para atajar)
  // siempre tiene una duración prácticamente idéntica además de la distancia -- por eso
  // ahora también exige duración parecida.
  const app = loadApp();
  const start = new Date('2026-09-20T08:00:00Z');
  const warmup = { date: start.toISOString(), distanceKm: 3, durationSec: 20 * 60 }; // trote suave, 15min/km
  const existingRuns = [warmup];

  const mainSetStart = new Date(start.getTime() + 7 * 60 * 1000); // 7 min después
  const isDup = app.isLikelyDuplicateOfExistingRun(mainSetStart.toISOString(), 3.2, existingRuns, 14 * 60); // fuerte, ~4:22/km

  assert.equal(isDup, false, 'dos actividades reales con distancia parecida pero ritmos muy distintos no deberían tratarse como duplicadas');
});

test('isLikelyDuplicateOfExistingRun: sigue detectando la misma actividad real sincronizada desde dos fuentes', () => {
  const app = loadApp();
  const start = new Date('2026-09-20T08:00:00Z');
  const fromStrava = { date: start.toISOString(), distanceKm: 5.02, durationSec: 1500 };
  const existingRuns = [fromStrava];

  // La misma carrera, sincronizada un rato después desde Health Connect -- pequeñas
  // diferencias de GPS/reloj entre fuentes, pero esencialmente la misma actividad.
  const fromHealthConnectStart = new Date(start.getTime() + 30 * 1000);
  const isDup = app.isLikelyDuplicateOfExistingRun(fromHealthConnectStart.toISOString(), 4.98, existingRuns, 1510);

  assert.equal(isDup, true, 'la misma actividad real sincronizada desde otra fuente sigue debiendo detectarse como duplicada');
});

test('maybeAnnounceKm: un salto de más de 1km en un solo fix de GPS no se salta el anuncio de los km intermedios', () => {
  // onPosition() descarta entero cualquier fix con accuracy>50 (típico después de un túnel,
  // un bosque denso, o edificios altos) -- el siguiente fix bueno mide la distancia contra el
  // último punto ACEPTADO, así que un solo fix puede sumarle a distanceKm bastante más de 1km
  // de una vez. Antes, maybeAnnounceKm() solo anunciaba el número final y saltaba
  // lastAnnouncedKm directo a ese valor -- si la distancia pasaba de 2.94km a 4.15km en un
  // fix, el corredor escuchaba "kilómetro 4" y el "kilómetro 3" desaparecía para siempre.
  const app = loadApp();
  app.state.profile = { units: 'metric', voiceEnabled: true };
  app.setTracker({ distanceKm: 4.15, elapsedSec: 1200, lastAnnouncedKm: 2, points: [], hrLog: [] });

  const announced = [];
  const originalSpeak = app.speak;
  app.speak = (text) => announced.push(text);
  try{
    app.maybeAnnounceKm();
  } finally {
    app.speak = originalSpeak;
  }

  assert.equal(app.getTracker().lastAnnouncedKm, 4, 'debería quedar al día con el km real');
  assert.equal(announced.length, 2, `debería haber anunciado los 2 km salteados (3 y 4), anunció ${announced.length}: ${JSON.stringify(announced)}`);
});

test('tickRunTimer: suma el delta real de reloj, no un "+1" ciego (bug confirmado en dispositivo real con tracking en segundo plano)', () => {
  // Ver el comentario grande junto a tickRunTimer() en app.js: en segundo plano Android frena
  // el setInterval que la dispara, así que puede tardar minutos en volver a disparar -- si
  // solo sumara +1 cada disparo, un salto de 80s reales solo sumaría 1s a elapsedSec.
  const app = loadApp();
  app.setCurrentUserId('user-de-prueba');
  app.setTracker({
    startedAt: Date.now() - 100 * 1000,
    points: [], distanceKm: 0, hrLog: [], lastAnnouncedKm: 0,
    elapsedSec: 50,
    lastSavedSec: 50,
    running: true, autoPaused: false,
    lastTickAt: Date.now() - 80 * 1000, // el timer no disparó en los últimos 80s reales (app en 2do plano)
  });

  app.tickRunTimer();

  assert.equal(app.getTracker().elapsedSec, 130, 'debería sumar los ~80s reales transcurridos de una, no +1');
});

test('tickRunTimer: no suma nada mientras la carrera está en auto-pausa (quietud) o pausada a mano', () => {
  const app = loadApp();
  app.setCurrentUserId('user-de-prueba');
  app.setTracker({
    startedAt: Date.now() - 100 * 1000,
    points: [], distanceKm: 0, hrLog: [], lastAnnouncedKm: 0,
    elapsedSec: 50, lastSavedSec: 50,
    running: true, autoPaused: true, // quieto en un semáforo
    lastTickAt: Date.now() - 10 * 1000,
  });

  app.tickRunTimer();

  assert.equal(app.getTracker().elapsedSec, 50, 'en auto-pausa no debería avanzar elapsedSec aunque haya pasado tiempo real');
});

test('tickRunTimer: dispara saveRunProgress al cruzar el umbral de 15s incluso con un salto grande de una sola vez', () => {
  // saveRunProgress() antes se disparaba con elapsedSec % 15 === 0, que un salto grande de
  // reloj (ver test de arriba) podía saltarse por completo -- ahora compara contra
  // lastSavedSec para no perderse el guardado periódico.
  const app = loadApp();
  app.setCurrentUserId('user-de-prueba');
  app.setTracker({
    startedAt: Date.now() - 100 * 1000,
    points: [], distanceKm: 0, hrLog: [], lastAnnouncedKm: 0,
    elapsedSec: 50, lastSavedSec: 50,
    running: true, autoPaused: false,
    lastTickAt: Date.now() - 80 * 1000,
  });

  app.tickRunTimer();

  assert.equal(app.getTracker().lastSavedSec, 130, 'lastSavedSec debería ponerse al día con el nuevo elapsedSec');
  const saved = app.readRunProgress();
  assert.equal(saved.elapsedSec, 130, 'el progreso guardado debería reflejar el salto grande, no quedarse atrás esperando un múltiplo de 15');
});

test('smoothRouteForDisplay: con muy pocos puntos no toca nada (nada que suavizar)', () => {
  const app = loadApp();
  const points = [{lat:0,lon:0},{lat:0.001,lon:0.001},{lat:0.002,lon:0.002}];
  assert.equal(app.smoothRouteForDisplay(points), points, 'con menos de 5 puntos debería devolver el mismo array, sin copiar ni promediar');
});

test('smoothRouteForDisplay: el primer y el último punto quedan exactos (el trazado sigue arrancando/terminando donde la carrera de verdad arrancó/terminó)', () => {
  const app = loadApp();
  const points = [
    {lat:10, lon:20}, {lat:10.001, lon:20.001}, {lat:10.002, lon:20.0005},
    {lat:10.003, lon:20.0015}, {lat:10.004, lon:20.002}, {lat:10.005, lon:20.0025},
    {lat:10.006, lon:20.003},
  ];
  const smoothed = app.smoothRouteForDisplay(points);
  // .lat/.lon sueltos, no deepEqual del objeto entero -- smoothRouteForDisplay corre adentro
  // del sandbox vm de loadApp(), un realm de JS distinto al de este test: un objeto literal
  // creado ahí tiene un Object.prototype distinto al de acá afuera, y deepEqual (estricto)
  // lo marca como no-igual aunque los valores sean idénticos. Comparar los números sueltos
  // evita ese falso negativo del todo.
  assert.equal(smoothed[0].lat, points[0].lat);
  assert.equal(smoothed[0].lon, points[0].lon);
  assert.equal(smoothed[smoothed.length-1].lat, points[points.length-1].lat);
  assert.equal(smoothed[smoothed.length-1].lon, points[points.length-1].lon);
});

test('smoothRouteForDisplay: reportado por el usuario como "trazado pixelado" -- un quiebre brusco de un solo fix de GPS ruidoso se pareja contra sus vecinos', () => {
  // Simula el caso real: una recta de puntos (una calle derecha) con UN fix fuera de línea
  // en el medio (multipath típico entre edificios altos) -- antes esto se dibujaba como un
  // pico/quiebre recto bien marcado en el mapa; después de suavizar, el pico se reduce
  // bastante (promedio con sus 4 vecinos a cada lado) sin desaparecer la forma general.
  const app = loadApp();
  const points = [];
  for(let i=0;i<9;i++) points.push({lat:10, lon:20+i*0.001}); // calle derecha (misma lat)
  points[4] = {lat:10.01, lon:20.004}; // UN fix ruidoso, bien lejos de la línea recta
  const smoothed = app.smoothRouteForDisplay(points);
  const noisyPointDeviation = Math.abs(points[4].lat - 10);
  const smoothedDeviation = Math.abs(smoothed[4].lat - 10);
  assert.ok(smoothedDeviation < noisyPointDeviation * 0.5, `el pico ruidoso debería reducirse a menos de la mitad al promediar con los vecinos (desvío original ${noisyPointDeviation}, suavizado ${smoothedDeviation})`);
  // Los puntos lejos del ruido (los extremos) casi no deberían moverse -- el promedio móvil
  // es local (radius chico), no aplana la calle derecha entera.
  assert.ok(Math.abs(smoothed[0].lat - 10) < 0.0001, 'el inicio de la calle derecha no debería moverse por un ruido lejano');
});

test('catmullRomCurve: con menos de 3 puntos no hay nada que curvar, devuelve tal cual', () => {
  const app = loadApp();
  const points = [{lat:0,lon:0},{lat:1,lon:1}];
  assert.equal(app.catmullRomCurve(points), points);
});

test('catmullRomCurve: pedido por el usuario ("que se vea como los de Strava") -- pasa EXACTO por cada punto real e inserta puntos intermedios entre cada par', () => {
  // La curva tiene que pasar por los puntos reales tal cual (a diferencia de una Bézier,
  // que solo se acerca) -- si no, el trazado se "despegaría" de donde el GPS dijo que
  // estuvo el corredor, mintiendo el recorrido real para verse más lindo.
  const app = loadApp();
  const points = [{lat:0,lon:0},{lat:1,lon:0},{lat:1,lon:1},{lat:0,lon:1}];
  const curved = app.catmullRomCurve(points, 4);
  // Con segmentsPerPoint=4: 4 puntos originales -> 3 tramos de 4 sub-segmentos cada uno
  // (4 puntos insertados, incluido el real al principio) + el último punto real al final.
  assert.equal(curved.length, (points.length-1)*4 + 1, `con 4 puntos y 4 segmentos por tramo debería dar ${(points.length-1)*4 + 1} puntos, dio ${curved.length}`);
  // Los puntos reales originales tienen que seguir apareciendo, exactos, en la curva --
  // en los índices 0, 4, 8, 12 (cada segmentsPerPoint pasos).
  points.forEach((p, i) => {
    const c = curved[i*4];
    assert.equal(c.lat, p.lat, `el punto real #${i} debería seguir exacto en la curva`);
    assert.equal(c.lon, p.lon, `el punto real #${i} debería seguir exacto en la curva`);
  });
});

test('isImplausibleRunSpeed: descarta un salto de posición que implicaría correr a velocidad imposible', () => {
  // onPosition() solo filtraba fixes por accuracy (>50m se descarta entero) -- un fix con
  // accuracy aceptable (ej. 45m) pero un error de multipath típico entre edificios altos podía
  // implicar una posición ~80m corrida en 1-2s (30-80 m/s), que se sumaba entero a
  // distanceKm sin que nada lo cuestionara. Reportado en una auditoría: un corredor parado
  // podía acumular decenas/cientos de metros fantasma de un puñado de fixes así.
  const app = loadApp();
  assert.equal(app.isImplausibleRunSpeed(45), true, '45 m/s (~162km/h) no es una velocidad humana real corriendo');
  assert.equal(app.isImplausibleRunSpeed(3.5), false, '3.5 m/s (~12.6km/h, trote normal) tiene que seguir aceptándose');
  assert.equal(app.isImplausibleRunSpeed(11.9), false, 'justo por debajo del techo tiene que aceptarse (no cortar sprints reales)');
  assert.equal(app.isImplausibleRunSpeed(null), false, 'sin referencia de velocidad (primer fix) no hay forma de juzgar -- no se rechaza');
});
