// api/send-feedback.js — función serverless de Vercel.
//
// Recibe el mensaje del formulario "Ayudanos a mejorar" (ver Perfil en index.html) y lo
// manda por email -- fetch directo a la REST API de Resend, sin SDK de más (mismo estilo
// que el resto de estos endpoints, ver el comentario de delete-account.js). Necesita dos
// variables de entorno nuevas en Vercel, ninguna de las cuales existía antes en este
// proyecto (nunca se mandó un email desde el backend hasta ahora):
//   RESEND_API_KEY     -- cuenta gratis en resend.com, sin tarjeta.
//   FEEDBACK_TO_EMAIL  -- la casilla real que tiene que recibir los mensajes.
// "from" usa el remitente de pruebas de Resend (onboarding@resend.dev), que funciona sin
// verificar ningún dominio propio -- si más adelante se verifica zancada.org en Resend,
// conviene cambiarlo a algo como "Zancada <feedback@zancada.org>".

const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');
const { withSentry, reportError } = require('./_lib/sentry');
const { checkSyncCooldown } = require('./_lib/sync-cooldown');
const { withinDailyCap } = require('./_lib/daily-cap');

// Un mensaje por minuto y por usuario: cada uno manda un email real.
const FEEDBACK_COOLDOWN_MS = 30 * 60 * 1000;   // 48 por dia como maximo por cuenta (antes 1 por minuto = 1.440): una sola cuenta no puede agotar los mails de la app

// Tope generoso para un mensaje de feedback -- bastante más que cualquier queja o idea
// real, pero corta un abuso deliberado (igual que MAX_INPUT_CHARS en chat.js).
const MAX_MESSAGE_CHARS = 4000;

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  // Igual que en los demás endpoints: nunca confiamos en un email que venga suelto del
  // cliente -- lo sacamos del token de sesión ya verificado, así el remitente real
  // siempre es quien dice ser.
  const auth = await verifyUser(req);
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
  // Una cuenta con el mail sin confirmar no puede mandar emails reales a nuestra casilla (mismo criterio que chat.js): reply_to llevaría un mail ajeno sin verificar.
  if (!auth.emailConfirmed) { res.status(403).json({ error: 'Email not confirmed' }); return; }

  const message = ((req.body && req.body.message) || '').toString().trim().slice(0, MAX_MESSAGE_CHARS);
  if (!message) { res.status(400).json({ error: 'Empty message' }); return; }

  const sbBase = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  const sbHeaders = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' };
  if (!(await checkSyncCooldown(sbBase, sbHeaders, auth.userId, 'feedback', FEEDBACK_COOLDOWN_MS, { failClosed: true }))) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }
  // tope global del dia: varias cuentas confirmadas no pueden agotar entre todas la cuota de mails de la app (se comparte con los mails de registro)
  if (!(await withinDailyCap(sbBase, sbHeaders, 'feedback-global', null, 20, { failClosed: true }))) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  const toEmail = process.env.FEEDBACK_TO_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  if (!toEmail || !apiKey) {
    console.error('send-feedback: falta configurar RESEND_API_KEY o FEEDBACK_TO_EMAIL en Vercel');
    res.status(500).json({ error: 'Feedback not configured' });
    return;
  }

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Zancada <onboarding@resend.dev>',
        to: [toEmail],
        // reply_to: así quien lee el mensaje puede simplemente tocar "Responder" en su
        // cliente de mail y que le llegue directo al corredor, sin copiar el email a mano.
        reply_to: auth.email || undefined,
        subject: 'Nuevo mensaje de "Ayudanos a mejorar" (Zancada)',
        text: `${message}\n\n---\nDe: ${auth.email || auth.userId}`
      })
    });
    if (!resendRes.ok) {
      console.error('send-feedback: Resend respondió con error', resendRes.status, await resendRes.text().catch(() => ''));
      res.status(502).json({ error: 'Could not send feedback' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-feedback error', err);
    await reportError(err, { endpoint: 'send-feedback' });
    res.status(500).json({ error: 'Internal error' });
  }
});
