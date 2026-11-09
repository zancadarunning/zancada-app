// api/_lib/strava-sunset.js
//
// Interruptor para SACAR Strava al lanzar la app (decisión del dueño, 2026-11-09): con STRAVA_SUNSET=1 en Vercel, Strava deja de conectarse y de traer carreras.
// No toca la desconexión (strava-disconnect) ni el borrado de cuenta: siguen funcionando para revocar el permiso del lado de Strava.
// Paso a paso del lanzamiento: docs/strava-sunset.md.

function stravaSunset() { return process.env.STRAVA_SUNSET === '1'; }

// mode 'gone': el cliente recibe 410 (conectar, sincronizar). mode 'ok': lo llama Strava o un cron, que no deben reintentar: 200 sin hacer nada.
function guardStravaSunset(handler, mode) {
  return function (req, res) {
    if (stravaSunset()) {
      if (mode === 'ok') { res.status(200).json({ ok: true, skipped: 'strava_sunset' }); return; }
      res.status(410).json({ error: 'strava_sunset' });
      return;
    }
    return handler(req, res);
  };
}

module.exports = { stravaSunset, guardStravaSunset };
