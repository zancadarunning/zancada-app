// api/_lib/oauth-link.js
//
// Vinculación de un reloj/app (Strava, Polar, Wahoo, Suunto, COROS) en DOS pasos, para que una persona no pueda hacer que
// la cuenta de OTRA quede conectada a la suya.
//
// El problema (hallazgo del escaneo de seguridad, CWE-352): el callback de OAuth (GET /api/<marca>-auth) decidía a qué usuario
// de Zancada vincular mirando SOLO el "state" firmado que /api/<marca>-init le da a cualquiera que tenga sesión. Un atacante
// podía pedir su propio state, armar el link de autorización de la marca con ese state y mandárselo a una víctima: cuando la
// víctima aprobaba, sus datos del reloj quedaban conectados a la cuenta del atacante.
//
// Ahora:
//  1) GET  /api/<marca>-auth?code&state  (lo abre la marca al volver): solo verifica la firma del state y manda a la persona
//     de vuelta a la APP (o a la web) en /conectar?p=<marca>&code&state. No vincula nada.
//  2) POST /api/<marca>-auth {code,state} con la sesión (Bearer) de quien está en la app: verifica que el usuario del state
//     SEA el de la sesión. Recién ahí corre la vinculación de siempre (intercambio del code, guardar tokens, traer carreras).
// El atacante puede fabricar el link, pero la víctima nunca tiene la sesión del atacante: el paso 2 falla y no se guarda nada.
//
// En Android el callback abre el navegador del sistema (no la app), así que el paso 1 responde una página que abre la app con
// un intent (y un botón por si el navegador bloquea la apertura automática). En la web / iPhone sigue directo a /conectar.

const verifyUser = require('./verify-user');
const { applyCors, isPreflight } = require('./cors');

const ERROR_RE = /[?&](link_error|suunto_connect=error)/;
const PACKAGE = 'org.zancada.app';
const HOST = 'www.zancada.org';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function interstitial(webPath, ua) {
  const android = /Android/i.test(ua || '');
  const intent = `intent://${HOST}${webPath}#Intent;scheme=https;package=${PACKAGE};S.browser_fallback_url=${encodeURIComponent('https://' + HOST + webPath)};end`;
  const web = webPath;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Zancada</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#edefef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:24px}
a.btn{display:block;margin:14px auto 0;max-width:320px;padding:15px 22px;border-radius:999px;background:#d6ff3f;color:#121415;font-weight:600;text-decoration:none}
a.sub{display:block;margin-top:18px;color:#8b9296;font-size:14px}</style></head><body><div>
<h1 style="font-size:22px;margin:0 0 8px">Terminando de conectar…</h1>
<p style="color:#8b9296;margin:0 0 6px">Volvé a Zancada para completar la conexión.</p>
${android ? `<a class="btn" href="${esc(intent)}">Abrir Zancada</a><a class="sub" href="${esc(web)}">Continuar en la web</a>` : `<a class="btn" href="${esc(web)}">Continuar</a>`}
</div><script>(function(){var a=${android ? 'true' : 'false'};var u=${JSON.stringify(android ? intent : web)};try{if(a){window.location.href=u;}else{window.location.replace(u);}}catch(e){}})();</script></body></html>`;
}

// legacyHandler(req, res): el callback de siempre (verifica el state, intercambia el code, guarda los tokens y responde con un
// redirect). verifyState(state) devuelve el userId (o un objeto con userId, caso COROS) o null.
function withOAuthLink(legacyHandler, { provider, verifyState }) {
  const userIdOf = v => (v && typeof v === 'object' ? v.userId : v) || null;

  return async (req, res) => {
    // ---- Paso 2: confirmación desde la app, con sesión ----
    if (req.method === 'POST' || req.method === 'OPTIONS') {
      applyCors(req, res);
      if (isPreflight(req, res)) return;
      const auth = await verifyUser(req);
      if (!auth.ok) { res.status(auth.status).json({ ok: false, error: auth.error }); return; }
      const { code, state } = req.body || {};
      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') { res.status(400).json({ ok: false, error: 'missing_params' }); return; }
      const stateUser = userIdOf(verifyState(state));
      if (!stateUser) { res.status(400).json({ ok: false, error: 'bad_state' }); return; }
      if (stateUser !== auth.userId) { res.status(403).json({ ok: false, error: 'state_mismatch' }); return; }

      // Se corre el callback de siempre con un "res" que solo captura a dónde habría redirigido.
      let loc = null;
      const cap = { headersSent: false, writeHead(_code, headers) { loc = headers && headers.Location; }, end() { this.headersSent = true; }, status() { return this; }, json() { return this; }, send() { return this; }, setHeader() {} };
      await legacyHandler({ method: 'GET', headers: req.headers, query: { code, state } }, cap);
      if (loc && ERROR_RE.test(loc)) {
        const q = new URLSearchParams(loc.split('?')[1] || '');
        res.status(502).json({ ok: false, error: 'link_failed', why: q.get('why') || null, dx: q.get('dx') || null });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    // ---- Paso 1: la marca nos devuelve a la persona ----
    const { code, state, error } = req.query || {};
    if (error || !code || !state) { res.writeHead(302, { Location: '/' }); res.end(); return; } // canceló el consentimiento
    if (!userIdOf(verifyState(String(state)))) { res.writeHead(302, { Location: '/?link_error=1' }); res.end(); return; }
    const webPath = `/conectar?p=${encodeURIComponent(provider)}&code=${encodeURIComponent(String(code))}&state=${encodeURIComponent(String(state))}`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.end(interstitial(webPath, req.headers && req.headers['user-agent']));
  };
}

module.exports = { withOAuthLink, interstitial };
