// api/remux-video.js — función serverless de Vercel.
//
// Arregla el contenedor de los videos que graba el celular con MediaRecorder
// (la animación del recorrido en la pestaña Ruta). En iPhone, Safari/WKWebView
// solo sabe grabar en MP4, pero como MediaRecorder va escribiendo el archivo
// "sobre la marcha" (no sabe la duración total hasta que termina), el MP4 que
// arma queda en formato fragmentado (moov vacío + fragmentos moof/mdat) en vez
// del formato clásico (un moov completo con todas las muestras, seguido de un
// solo mdat). Ese archivo es 100% válido y por eso se ve bien en el <video>
// de la propia app -- pero el importador de Fotos de iOS y el validador de
// adjuntos de WhatsApp son más estrictos y lo rechazan silenciosamente (el
// panel de compartir se abre bien, pero falla al elegir destino -- justo lo
// que reportó el usuario).
//
// El arreglo es un remux sin recodificar (mismo video, más rápido y sin
// perder calidad): "ffmpeg -c copy -movflags +faststart" reordena el archivo
// a la estructura clásica. Usamos el binario que trae el paquete
// ffmpeg-static (ver package.json) porque el runtime de Vercel no tiene
// ffmpeg instalado.
//
// Requiere sesión (verifyUser) para que no sea un endpoint abierto que
// cualquiera pueda usar para hacerle procesar video gratis a nuestro server.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ffmpegPath = require('ffmpeg-static');
const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');

// Vercel ya rechaza pedidos de más de ~4.5MB antes de que lleguen acá (límite
// de la plataforma para Serverless Functions, no configurable) -- este chequeo
// es solo una segunda barrera explícita, con un mensaje más claro que el error
// genérico de la plataforma.
const MAX_BYTES = 4.5 * 1024 * 1024;

function readRawBody(req){
  // En algunos runtimes de Vercel, req.body ya viene como Buffer para
  // content-types que no son json/urlencoded/text (como video/mp4). Si no
  // vino así, lo juntamos nosotros mismos del stream crudo.
  if(Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if(req.body && typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body, 'binary'));
  return new Promise((resolve, reject)=>{
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function runFfmpeg(args){
  return new Promise((resolve, reject)=>{
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', code => {
      if(code === 0) resolve();
      else reject(new Error('ffmpeg exited with code ' + code + ': ' + stderr.slice(-800)));
    });
  });
}

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if(isPreflight(req, res)) return;
  if(req.method !== 'POST'){ res.status(405).json({error:'Method not allowed'}); return; }

  const auth = await verifyUser(req);
  if(!auth.ok){ res.status(auth.status).json({error: auth.error}); return; }

  let inPath, outPath;
  try{
    const input = await readRawBody(req);
    if(!input || !input.length){ res.status(400).json({error:'Empty body'}); return; }
    if(input.length > MAX_BYTES){ res.status(413).json({error:'Video too large'}); return; }

    const id = crypto.randomBytes(8).toString('hex');
    inPath = path.join(os.tmpdir(), `zancada-in-${id}.mp4`);
    outPath = path.join(os.tmpdir(), `zancada-out-${id}.mp4`);
    fs.writeFileSync(inPath, input);

    await runFfmpeg(['-y', '-i', inPath, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', outPath]);

    const output = fs.readFileSync(outPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', String(output.length));
    res.status(200).send(output);
  }catch(err){
    console.error('remux-video: fallo al reprocesar el video —', err);
    await reportError(err, { endpoint: 'remux-video' });
    res.status(500).json({error:'Remux failed'});
  }finally{
    try{ if(inPath && fs.existsSync(inPath)) fs.unlinkSync(inPath); }catch(e){}
    try{ if(outPath && fs.existsSync(outPath)) fs.unlinkSync(outPath); }catch(e){}
  }
});
