// api/_lib/test-fit.js
//
// TEMPORAL -- genera un archivo FIT de una carrera de prueba (unos 3 km en 20 minutos, con pulso,
// cadencia y GPS) para probar de punta a punta la recepción de carreras de Suunto: se sube a la
// cuenta del usuario con la Upload API de Suunto (api/suunto-test-upload.js), Suunto lo procesa,
// crea el entrenamiento y avisa por webhook a api/suunto-webhook.js. Se borra junto con ese endpoint
// cuando termine la prueba.
//
// La ruta es una vuelta al reservorio de Central Park (Nueva York) a propósito: está lejos de
// cualquier lugar real del usuario y se nota que es de prueba. @garmin/fitsdk es ESM puro: se carga
// con import() (ver el comentario de fit-activity-helpers.js).

const SEMICIRCLES = 2 ** 31 / 180;

async function buildTestRunFit(startDate) {
  const { Encoder, Profile } = await import('@garmin/fitsdk');
  const enc = new Encoder();
  const start = new Date(startDate);
  const durationSec = 20 * 60;
  const stepSec = 5;
  const records = durationSec / stepSec;

  // Elipse de ~3 km alrededor del reservorio (centro 40.7850, -73.9630).
  const center = { lat: 40.7850, lon: -73.9630 };
  const rLat = 0.0040, rLon = 0.0053;
  const perim = 2 * Math.PI * Math.sqrt((Math.pow(rLat * 111320, 2) + Math.pow(rLon * 111320 * Math.cos(center.lat * Math.PI / 180), 2)) / 2);
  const totalDistance = Math.round(perim); // una vuelta
  const speed = totalDistance / durationSec;

  enc.onMesg(Profile.MesgNum.FILE_ID, { type: 'activity', manufacturer: 'development', product: 0, serialNumber: 1234567, timeCreated: start });
  enc.onMesg(Profile.MesgNum.EVENT, { timestamp: start, event: 'timer', eventType: 'start' });

  let lastPos = null;
  for (let i = 0; i <= records; i++) {
    const t = new Date(start.getTime() + i * stepSec * 1000);
    const ang = (i / records) * 2 * Math.PI;
    const lat = center.lat + rLat * Math.sin(ang);
    const lon = center.lon + rLon * Math.cos(ang);
    lastPos = { lat, lon };
    enc.onMesg(Profile.MesgNum.RECORD, {
      timestamp: t,
      positionLat: Math.round(lat * SEMICIRCLES),
      positionLong: Math.round(lon * SEMICIRCLES),
      distance: Math.round((i / records) * totalDistance * 100) / 100,
      speed: Math.round(speed * 1000) / 1000,
      heartRate: Math.round(148 + 6 * Math.sin(i / 9)),
      cadence: 81,
      altitude: 40 + 2 * Math.sin(i / 20)
    });
  }
  const end = new Date(start.getTime() + durationSec * 1000);
  enc.onMesg(Profile.MesgNum.EVENT, { timestamp: end, event: 'timer', eventType: 'stopAll' });
  enc.onMesg(Profile.MesgNum.LAP, {
    timestamp: end, startTime: start, totalElapsedTime: durationSec, totalTimerTime: durationSec,
    totalDistance, sport: 'running', avgHeartRate: 148, maxHeartRate: 156
  });
  enc.onMesg(Profile.MesgNum.SESSION, {
    timestamp: end, startTime: start, totalElapsedTime: durationSec, totalTimerTime: durationSec,
    totalDistance, sport: 'running', subSport: 'generic', firstLapIndex: 0, numLaps: 1,
    avgSpeed: speed, maxSpeed: speed * 1.1, avgHeartRate: 148, maxHeartRate: 156, avgCadence: 81, totalCalories: 230
  });
  enc.onMesg(Profile.MesgNum.ACTIVITY, { timestamp: end, numSessions: 1, type: 'manual', event: 'activity', eventType: 'stop' });
  return { bytes: Buffer.from(enc.close()), totalDistance, durationSec, lastPos };
}

module.exports = { buildTestRunFit };
