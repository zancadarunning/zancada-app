// api/health.js
//
// Dirección pública y mínima para que un servicio de monitoreo (UptimeRobot, etc.) sepa si el servidor responde. Las apps de Android e iPhone usan este
// mismo backend, así que si esto no contesta 200, la app del celular tampoco funciona. No devuelve datos de nadie ni toca la base.
module.exports = (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.status(405).json({ error: 'Method not allowed' }); return; }
  // la red de Vercel la guarda unos segundos: un monitor que pregunta cada minuto no gasta una ejecución cada vez
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=30');
  res.status(200).json({ status: 'ok' });
};
