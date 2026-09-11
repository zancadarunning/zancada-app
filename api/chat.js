// api/chat.js — función serverless de Vercel.
const verifyUser = require('./_lib/verify-user');
const { applyCors, isPreflight } = require('./_lib/cors');

// Mensajes que sí le mostramos al corredor tal cual, en su idioma. Antes, cualquier error
// que no fuera "muy solicitado" (token de sesión faltante/vencido, un error interno de la
// API de Gemini, una excepción de red, la falta de configuración de GEMINI_API_KEY) se le
// mandaba al chat como texto plano y en inglés/técnico -- un amigo probando la app llegó a
// ver literalmente "Missing token" como si fuera la respuesta del coach. El detalle técnico
// real ahora se loguea acá (console.error, visible en los logs de Vercel) para que lo
// podamos diagnosticar nosotros, pero el corredor solo ve uno de estos mensajes.
const BUSY_MSG = {
  es: 'El coach está muy solicitado ahora mismo. Probá de nuevo en un minuto.',
  en: 'The coach is very busy right now. Try again in a minute.',
  pt: 'O coach está muito solicitado agora. Tente de novo em um minuto.',
  fr: 'Le coach est très sollicité en ce moment. Réessaie dans une minute.',
  it: 'Il coach è molto richiesto in questo momento. Riprova tra un minuto.',
  de: 'Der Coach ist gerade sehr gefragt. Versuch es in einer Minute noch mal.'
};
const AUTH_ERROR_MSG = {
  es: 'Tu sesión expiró. Cerrá sesión y volvé a entrar para seguir usando el coach.',
  en: 'Your session expired. Log out and back in to keep using the coach.',
  pt: 'Sua sessão expirou. Saia e entre de novo para continuar usando o coach.',
  fr: 'Ta session a expiré. Déconnecte-toi et reconnecte-toi pour continuer à utiliser le coach.',
  it: 'La tua sessione è scaduta. Esci e accedi di nuovo per continuare a usare il coach.',
  de: 'Deine Sitzung ist abgelaufen. Melde dich ab und wieder an, um den Coach weiter zu nutzen.'
};
const GENERIC_ERROR_MSG = {
  es: 'No me pude conectar ahora mismo. Probá de nuevo en un momento.',
  en: "I couldn't connect right now. Try again in a moment.",
  pt: 'Não consegui me conectar agora. Tente de novo em instantes.',
  fr: "Je n'ai pas pu me connecter là. Réessaie dans un instant.",
  it: 'Non sono riuscito a connettermi ora. Riprova tra un momento.',
  de: 'Ich konnte mich gerade nicht verbinden. Versuch es gleich noch mal.'
};
// Tope de mensajes por día por usuario -- ver sql/chat_usage.sql para el
// porqué. 60 es generoso para una conversación normal con el coach (varias
// idas y vueltas por sesión, todos los días) pero corta un uso en loop o
// una cuenta comprometida antes de que la cuota de Gemini se dispare.
// Ajustable sin tocar código con la variable de entorno CHAT_DAILY_LIMIT.
const CHAT_DAILY_LIMIT = parseInt(process.env.CHAT_DAILY_LIMIT, 10) || 60;
const LIMIT_MSG = {
  es: 'Llegaste al límite de mensajes al coach por hoy. Probá de nuevo mañana.',
  en: "You've reached today's limit of messages to the coach. Try again tomorrow.",
  pt: 'Você atingiu o limite de mensagens ao coach por hoje. Tente de novo amanhã.',
  fr: "Tu as atteint la limite de messages au coach pour aujourd'hui. Réessaie demain.",
  it: 'Hai raggiunto il limite di messaggi al coach per oggi. Riprova domani.',
  de: 'Du hast das heutige Limit an Nachrichten an den Coach erreicht. Versuch es morgen noch mal.'
};

const { withSentry, reportError } = require('./_lib/sentry');

module.exports = withSentry(async (req, res) => {
  applyCors(req, res);
  if (isPreflight(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method Not Allowed' } });
    return;
  }

  const { lang } = req.body || {};

  // Verificamos que quien llama esté realmente logueado en la app, antes de
  // gastar la cuota de Gemini en el pedido. Sin esto, cualquiera en internet
  // podía pegarle directo a esta URL (sin pasar por la app ni tener cuenta)
  // con su propio "system" y "messages", y la respuesta la pagábamos
  // nosotros — un uso gratis e ilimitado de la API a costa nuestra.
  const auth = await verifyUser(req);
  if (!auth.ok) {
    console.error('chat: auth failed —', auth.error);
    res.status(auth.status).json({ error: { message: AUTH_ERROR_MSG[lang] || AUTH_ERROR_MSG.es } });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('chat: falta configurar GEMINI_API_KEY en las variables de entorno de Vercel.');
    res.status(500).json({ error: { message: GENERIC_ERROR_MSG[lang] || GENERIC_ERROR_MSG.es } });
    return;
  }

  // Cortamos ACÁ, antes de gastar nada en Gemini, si el usuario ya mandó
  // demasiados mensajes hoy (ver sql/chat_usage.sql). Si por lo que sea la
  // función de Supabase falla (tabla no creada todavía, RPC caída, etc.), lo
  // logueamos pero dejamos pasar el mensaje -- preferimos arriesgarnos a
  // algún costo de más antes que romper el chat para todo el mundo por un
  // problema de infraestructura del rate limit en sí.
  try {
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    const rpcRes = await fetch(`${base}/rest/v1/rpc/increment_chat_usage`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: auth.userId, p_limit: CHAT_DAILY_LIMIT })
    });
    if (rpcRes.ok) {
      const withinLimit = await rpcRes.json();
      if (withinLimit === false) {
        res.status(200).json({ error: { message: LIMIT_MSG[lang] || LIMIT_MSG.es } });
        return;
      }
    } else {
      console.error('chat: increment_chat_usage rpc failed', rpcRes.status, await rpcRes.text().catch(() => ''));
    }
  } catch (e) {
    console.error('chat: rate limit check failed', e);
  }

  try {
    const { system, tools, messages } = req.body || {};
    const busyMessage = BUSY_MSG[lang] || BUSY_MSG.es;

    const idToName = {};
    (messages || []).forEach(m => {
      if (Array.isArray(m.content)) {
        m.content.forEach(b => { if (b.type === 'tool_use') idToName[b.id] = b.name; });
      }
    });

    const contents = (messages || []).map(m => {
      const role = m.role === 'assistant' ? 'model' : 'user';
      if (typeof m.content === 'string') return { role, parts: [{ text: m.content }] };
      const parts = (m.content || []).map(b => {
        if (b.type === 'text') {
          const part = { text: b.text };
          if (b._ts) part.thoughtSignature = b._ts;
          return part;
        }
        if (b.type === 'tool_use') {
          const part = { functionCall: { name: b.name, args: b.input || {} } };
          if (b._ts) part.thoughtSignature = b._ts;
          return part;
        }
        if (b.type === 'tool_result') {
          const name = idToName[b.tool_use_id] || 'resultado';
          return { functionResponse: { name, response: { content: String(b.content) } } };
        }
        return { text: '' };
      });
      return { role, parts };
    });

    const functionDeclarations = (tools || []).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema
    }));

    const model = 'gemini-3.6-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents,
      tools: functionDeclarations.length ? [{ functionDeclarations }] : undefined
    });

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let data, lastError;
    const delays = [4000, 8000]; // reintenta a los 4s y a los 8s si está saturado

    const isRetryable = (err) => {
      if (!err) return false;
      const text = `${err.status || ''} ${err.message || ''}`;
      return err.code === 429 || err.code === 503 || /quota|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|high demand/i.test(text);
    };

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      const geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });
      data = await geminiRes.json();

      if (!isRetryable(data.error)) break;

      lastError = data.error;
      if (attempt < delays.length) await sleep(delays[attempt]);
    }

    if (data.error) {
      const retryable = isRetryable(lastError || data.error);
      if (!retryable) console.error('chat: error no reintentable de Gemini —', data.error);
      const friendlyMessage = retryable ? busyMessage : (GENERIC_ERROR_MSG[lang] || GENERIC_ERROR_MSG.es);
      res.status(200).json({ error: { message: friendlyMessage } });
      return;
    }

    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    let fcCounter = 0;
    const content = parts.map(p => {
      if (p.functionCall) {
        fcCounter++;
        const block = { type: 'tool_use', id: 'call_' + Date.now() + '_' + fcCounter, name: p.functionCall.name, input: p.functionCall.args || {} };
        if (p.thoughtSignature) block._ts = p.thoughtSignature;
        return block;
      }
      if (p.text) {
        const block = { type: 'text', text: p.text };
        if (p.thoughtSignature) block._ts = p.thoughtSignature;
        return block;
      }
      return null;
    }).filter(Boolean);

    res.status(200).json({ content });
  } catch (err) {
    console.error('chat: excepción no manejada —', err);
    await reportError(err, { endpoint: 'chat' });
    res.status(500).json({ error: { message: GENERIC_ERROR_MSG[lang] || GENERIC_ERROR_MSG.es } });
  }
});
