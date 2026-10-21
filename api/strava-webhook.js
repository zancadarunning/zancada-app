const { decToken, encToken } = require('./_lib/token-crypto');
const crypto = require('crypto');
const { activityToRun, mergeStravaRuns, purgeStravaRunsForUser, deleteStravaRun } = require('./_lib/strava-activity-helpers');

// Comparación en tiempo constante (se hashea para que el largo no se filtre).
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Strava no firma los webhooks, así que antes de ACTUAR sobre un evento destructivo lo confirmamos contra Strava mismo:
//  - "el usuario revocó el acceso": solo es cierto si Strava ya no deja refrescar su token (refresh -> 400/401).
//    Si el refresh funciona, el acceso sigue vigente y el evento era falso: se ignora (y de paso se guardan los tokens nuevos).
//  - "se borró la actividad": solo es cierto si Strava responde 404 para esa actividad.
// Ante cualquier duda (error de red, 5xx, rate limit) no se borra nada: el cron de sincronización corrige después.
async function stravaRefresh(conn) {
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: decToken(conn.refresh_token) })
  });
  let data = null;
  try { data = await r.json(); } catch (e) { data = null; }
  return { status: r.status, ok: r.ok && data && data.access_token, data };
}

// Mensajes cortos por idioma para el aviso que le queda al usuario en el chat del coach
// cuando revocó el acceso desde la propia Strava (ver deauthorizeAthlete más abajo) -- no
// tiene acceso al diccionario completo de la app (eso vive en app.js, del lado del
// cliente), así que van hardcodeados acá, mismo estilo que MSGS en send-reminders.js.
const REVOKED_MSGS = {
  es: n => `Vi que revocaste el acceso a Strava desde su propia web o app. Por sus políticas, tuve que borrar de tu Historial ${n} carrera${n===1?'':'s'} que habían llegado por ahí — no de Strava, solo de acá. Si fue sin querer, la podés volver a conectar desde Perfil → Relojes.`,
  en: n => `I saw you revoked Strava's access from their own site or app. Because of their policy, I had to remove ${n} run${n===1?'':'s'} that came from there from your History — not from Strava, just from here. If that was by mistake, you can reconnect it from Profile → Watches.`,
  pt: n => `Vi que você revogou o acesso ao Strava pelo próprio site ou app deles. Pelas políticas deles, tive que remover ${n} corrida${n===1?'':'s'} que tinham vindo de lá do seu Histórico — não do Strava, só daqui. Se foi sem querer, dá pra reconectar em Perfil → Relógios.`,
  fr: n => `J'ai vu que tu as révoqué l'accès à Strava depuis leur propre site ou appli. À cause de leur politique, j'ai dû retirer ${n} course${n===1?'':'s'} venue${n===1?'':'s'} de là de ton historique — pas de Strava, juste d'ici. Si c'était involontaire, tu peux le reconnecter depuis Profil → Montres.`,
  it: n => `Ho visto che hai revocato l'accesso a Strava dal loro sito o app. Per le loro politiche, ho dovuto rimuovere dalla tua Cronologia ${n} cors${n===1?'a':'e'} arrivat${n===1?'a':'e'} da lì — non da Strava, solo da qui. Se è stato involontario, puoi ricollegarlo da Profilo → Orologi.`,
  de: n => `Ich habe gesehen, dass du den Zugriff auf Strava über deren eigene Website oder App widerrufen hast. Wegen deren Richtlinien musste ich ${n} Lauf${n===1?'':' läufe'}, die von dort kamen, aus deinem Verlauf entfernen — nicht von Strava, nur von hier. Falls das aus Versehen war, kannst du es unter Profil → Uhren wieder verbinden.`
};

// Un valor que viene del evento (lo controla quien llama) se escribe en los registros recortado y sin saltos de línea: así no puede falsificar líneas.
const logSafe = v => Array.from(String(typeof v === 'object' ? JSON.stringify(v) : v), ch => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 0x2028 || ch.charCodeAt(0) === 0x2029) ? ' ' : ch).join('').slice(0, 80);

async function syncActivity(athleteId, activityId) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  if (!Number.isInteger(athleteId) || !Number.isInteger(activityId)) return; // se interpolan en un filtro PostgREST y en la URL de Strava: solo enteros (segunda capa, ver el chequeo de owner_id/object_id abajo)
  const connRes = await fetch(`${base}/rest/v1/strava_connections?athlete_id=eq.${athleteId}&select=*`, { headers });
  const conns = await connRes.json();
  if (!conns || !conns.length) return;
  let conn = conns[0];

  if (conn.expires_at < Math.floor(Date.now() / 1000)) {
    const refreshRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: decToken(conn.refresh_token) })
    });
    const refreshed = await refreshRes.json();
    if (refreshed.access_token) {
      conn.access_token = refreshed.access_token;
      await fetch(`${base}/rest/v1/strava_connections?user_id=eq.${conn.user_id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ access_token: encToken(refreshed.access_token), refresh_token: encToken(refreshed.refresh_token), expires_at: refreshed.expires_at })
      });
    }
  }

  const actRes = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${decToken(conn.access_token)}` }
  });
  const act = await actRes.json();
  // act.errors (o directamente !act): la request a Strava falló -- token todavía
  // inválido pese al refresh de arriba, actividad puesta en privado, rate limit,
  // Strava caído, lo que sea (mismo chequeo que ya usa strava-resync.js). NO
  // tratamos esto como "no es una carrera" -- si lo hiciéramos, un simple error de
  // red o un token que tardó en refrescar borraría (ver más abajo) una carrera que
  // en realidad sigue siendo válida del lado de Strava. Nos vamos sin tocar nada;
  // si de verdad cambió de tipo o se borró, el próximo evento (o el aspect_type
  // 'delete', manejado aparte en deleteActivity) lo va a volver a intentar.
  if (!act || act.errors) return;
  if (!((act.sport_type || act.type || '').includes('Run'))) {
    // Ya tenemos la actividad de verdad (no un error) y confirmamos que NO es una
    // carrera. Esto cubre el evento 'update' donde el usuario editó en Strava el
    // tipo de una actividad YA sincronizada (por ejemplo, la tenía mal etiquetada
    // como Run y la corrigió a Ride) -- antes acá se cortaba en seco sin tocar nada
    // más, así que esa actividad se quedaba en el Historial de Zancada como
    // carrera para siempre, aunque en Strava ya no lo sea. deleteStravaRun no hace
    // nada si esta activityId nunca se había guardado (el caso normal: un evento
    // de una actividad que nunca fue un Run), así que este llamado es seguro.
    await deleteStravaRun(base, headers, conn.user_id, activityId);
    return;
  }

  const newRun = await activityToRun(act, decToken(conn.access_token));
  // 'upsert': Strava manda este mismo evento tanto para actividades nuevas
  // como para ediciones de una actividad ya sincronizada (aspect_type
  // 'create' o 'update'), así que si ya la teníamos hay que reemplazarla
  // con los datos nuevos, no saltearla. merge_strava_runs preserva el
  // shoeId que el usuario haya asignado a mano en la app.
  // mergeAndNotify avisa solo si la carrera todavía no estaba guardada (un evento 'update' de una ya sincronizada no avisa)
  await mergeAndNotify(mergeStravaRuns, base, headers, conn.user_id, [newRun], 'upsert', 'strava', 1500);
}

// Strava manda este evento cuando el usuario borra una actividad puntual
// (aspect_type 'delete', object_type 'activity') -- antes esto no se
// manejaba para nada, así que una carrera borrada del lado de Strava se
// quedaba en el Historial de Zancada para siempre. A diferencia de
// deauthorizeAthlete() (que borra TODAS las carreras de Strava porque el
// usuario revocó el acceso a la app entera), acá se borra solo la carrera
// puntual que Strava avisa, por su activityId.
async function deleteActivity(athleteId, activityId) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  if (!Number.isInteger(athleteId)) return; // se interpola en un filtro PostgREST: solo enteros (segunda capa, ver el chequeo de owner_id/object_id abajo)
  const connRes = await fetch(`${base}/rest/v1/strava_connections?athlete_id=eq.${athleteId}&select=user_id,access_token,refresh_token,expires_at`, { headers });
  const conns = await connRes.json();
  if (!Array.isArray(conns) || !conns.length) return;
  const conn = conns[0];

  // Confirmar con Strava que la actividad de verdad ya no existe (404). Si el token venció, se renueva primero.
  let token = decToken(conn.access_token);
  if (conn.expires_at < Math.floor(Date.now() / 1000)) {
    const rf = await stravaRefresh(conn);
    if (!rf.ok) return;
    token = rf.data.access_token;
  }
  const check = await fetch(`https://www.strava.com/api/v3/activities/${encodeURIComponent(activityId)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (check.status !== 404) return;   // sigue existiendo (o no se pudo comprobar): no se borra

  await deleteStravaRun(base, headers, conn.user_id, activityId);
}

// Strava manda este evento cuando el usuario revoca el acceso de la app
// desde SU PROPIA cuenta de Strava (Configuración → Mis apps), sin pasar
// por el botón "Desconectar" de Zancada -- antes este caso no se manejaba
// para nada, así que la conexión (con un token que Strava ya invalidó) y
// las carreras importadas se quedaban en la base para siempre, y el cron de
// sincronización seguía intentando (y fallando) contra ese token muerto.
// El acuerdo de desarrollador de Strava exige borrar los datos obtenidos
// por su API en cuanto el usuario revoca el acceso, así que hacemos lo
// mismo que strava-disconnect.js: borrar la conexión y purgar las carreras.
async function deauthorizeAthlete(athleteId) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  if (!Number.isInteger(athleteId)) return; // se interpola en un filtro PostgREST: solo enteros (segunda capa, ver el chequeo de owner_id/object_id abajo)
  const connRes = await fetch(`${base}/rest/v1/strava_connections?athlete_id=eq.${athleteId}&select=user_id,refresh_token`, { headers });
  const conns = await connRes.json();
  if (!Array.isArray(conns) || !conns.length) return;
  const userId = conns[0].user_id;

  // Confirmar la revocación: si Strava todavía deja refrescar el token, el acceso sigue vigente y el evento era falso.
  const rf = await stravaRefresh(conns[0]);
  if (rf.ok) {
    await fetch(`${base}/rest/v1/strava_connections?user_id=eq.${userId}`, { method: 'PATCH', headers, body: JSON.stringify({ access_token: encToken(rf.data.access_token), refresh_token: encToken(rf.data.refresh_token), expires_at: rf.data.expires_at }) }).catch(() => {});
    console.error('strava-webhook: evento de revocación ignorado, el acceso sigue vigente (posible evento falso)');
    return;
  }
  if (rf.status !== 400 && rf.status !== 401) return;   // error de red / 5xx / rate limit: no se borra nada

  await fetch(`${base}/rest/v1/strava_connections?athlete_id=eq.${athleteId}`, { method: 'DELETE', headers });
  await purgeStravaRunsForUser(base, headers, userId, (count, lang) => (REVOKED_MSGS[lang] || REVOKED_MSGS.es)(count));
}

const { withSentry, reportError, reportSecurityEvent } = require('./_lib/sentry');
const { mergeAndNotify } = require('./_lib/notify-new-run');

module.exports = withSentry(async (req, res) => {
  if (req.method === 'GET') {
    // Strava arma esta consulta agregando hub.mode / hub.verify_token / hub.challenge a la dirección del callback. Si la dirección ya tiene un
    // "?" propio (el secreto ?k=...), algunos clientes pegan los parámetros con otro "?" en vez de "&", y req.query deja de verlos: por eso
    // se leen también directo de la URL cruda.
    const rawUrl = String(req.url || '');
    const param = name => {
      if (req.query && req.query[name] !== undefined) return req.query[name];
      const m = rawUrl.match(new RegExp('[?&]' + name.replace('.', '\.') + '=([^&?#]*)'));
      return m ? decodeURIComponent(m[1]) : undefined;
    };
    const mode = param('hub.mode');
    const token = param('hub.verify_token');
    const challenge = param('hub.challenge');
    // Strava puede omitir hub.verify_token en la verificación: se acepta igual si la dirección trae el secreto largo (?k=...) que solo conoce quien registró la suscripción.
    const tokenOk = !!process.env.STRAVA_VERIFY_TOKEN && token !== undefined && safeEqual(String(token), process.env.STRAVA_VERIFY_TOKEN);
    const kOk = !!process.env.STRAVA_WEBHOOK_SECRET && token === undefined && safeEqual(String(param('k') || ''), process.env.STRAVA_WEBHOOK_SECRET);
    if (mode === 'subscribe' && (tokenOk || kOk)) {
      res.status(200).json({ 'hub.challenge': challenge });
      // TEMPORAL (mientras se registra la suscripción nueva): deja constancia de que la verificación llegó y se aceptó. Se responde ANTES de avisar.
      await reportSecurityEvent('Verificación GET del webhook de Strava ACEPTADA', { urlShape: rawUrl.replace(/=[^&?#]*/g, '=*').slice(0, 160) }).catch(() => {});
      return;
    }
    // Sin valores: solo qué parámetros llegaron y si coincidían (para entender un rechazo del registro de la suscripción)
    await reportSecurityEvent('Verificación GET del webhook de Strava rechazada', {
      mode: mode === undefined ? null : String(mode).slice(0, 20), hasToken: token !== undefined, hasChallenge: challenge !== undefined,
      verifyTokenConfigured: !!process.env.STRAVA_VERIFY_TOKEN, hasQueryKeys: Object.keys(req.query || {}).slice(0, 8),
      urlShape: rawUrl.replace(/=[^&?#]*/g, '=*').slice(0, 160)
    }).catch(() => {});
    res.status(403).send('Forbidden');
    return;
  }

  if (req.method === 'POST') {
    res.status(200).send('EVENT_RECEIVED');
    try {
      const event = req.body;
      // Strava, a diferencia de Stripe/GitHub, NO firma sus webhooks -- no hay ningún
      // secreto ni header para confirmar que un POST acá vino de verdad de ellos. Sin
      // este chequeo, cualquiera en internet podía forjar un POST tipo
      // {"object_type":"athlete","object_id":<athlete_id>,"updates":{"authorized":"false"}}
      // con el athlete_id (público, un entero chico y adivinable) de otra persona y
      // disparar deauthorizeAthlete() sin ningún acceso -- le borraba la conexión de
      // Strava y purgaba las carreras sincronizadas a la víctima. La mitigación que
      // Strava mismo documenta para esto es validar el subscription_id que trae cada
      // evento contra el de TU suscripción (uno solo, fijo) -- ver STRAVA_SUBSCRIPTION_ID
      // en las variables de entorno (lo devuelve GET /api/strava-check-subscription).
      // Segunda barrera: un secreto largo en la URL del callback (se registra en strava-setup-webhook.js). Si STRAVA_WEBHOOK_SECRET
      // está configurado, un POST sin el secreto correcto se ignora. Sin la variable queda el comportamiento anterior.
      const webhookSecret = process.env.STRAVA_WEBHOOK_SECRET;
      if (webhookSecret && !safeEqual((req.query && req.query.k) || '', webhookSecret)) {
        console.error('strava-webhook: falta o no coincide el secreto del callback, se ignora el evento');
        await reportSecurityEvent('Webhook de Strava sin el secreto correcto', {}).catch(() => {});
        return;
      }
      const expectedSubId = process.env.STRAVA_SUBSCRIPTION_ID;
      if (!expectedSubId || String(event && event.subscription_id) !== String(expectedSubId)) {
        console.error('strava-webhook: subscription_id no coincide, se ignora el evento', logSafe(event && event.subscription_id));
        await reportSecurityEvent('Posible webhook de Strava forjado: subscription_id no coincide', { received: event && event.subscription_id }).catch(() => {});
        return;
      }
      // owner_id/object_id se interpolan sin comillas en un filtro PostgREST
      // (athlete_id=eq.${athleteId}, ver syncActivity/deleteActivity/deauthorizeAthlete)
      // -- si el subscription_id de arriba alguna vez se filtra (es un valor fijo, no
      // rotativo, y lo devuelve el endpoint de debug), un event.owner_id/object_id con
      // un "&" o similar podría agregar filtros PostgREST no previstos a esa consulta.
      // El chequeo de subscription_id es la defensa principal; esto es una segunda capa
      // barata, no confiar en enteros que en teoría "ya vienen bien" de Strava.
      if (event) {
        if (event.owner_id !== undefined && !Number.isInteger(event.owner_id)) {
          console.error('strava-webhook: owner_id no numérico, se ignora', logSafe(event.owner_id));
          await reportSecurityEvent('Posible intento de inyección en webhook de Strava: owner_id no numérico', { owner_id: event.owner_id, event }).catch(() => {});
          return;
        }
        if (event.object_id !== undefined && !Number.isInteger(event.object_id)) {
          console.error('strava-webhook: object_id no numérico, se ignora', logSafe(event.object_id));
          await reportSecurityEvent('Posible intento de inyección en webhook de Strava: object_id no numérico', { object_id: event.object_id, event }).catch(() => {});
          return;
        }
      }
      if (event && event.object_type === 'activity' && (event.aspect_type === 'create' || event.aspect_type === 'update')) {
        await syncActivity(event.owner_id, event.object_id);
      } else if (event && event.object_type === 'activity' && event.aspect_type === 'delete') {
        await deleteActivity(event.owner_id, event.object_id);
      } else if (event && event.object_type === 'athlete' && event.updates && event.updates.authorized === 'false') {
        await deauthorizeAthlete(event.object_id);
      }
    } catch (e) { console.error(e); await reportError(e, { endpoint: 'strava-webhook' }); }
    return;
  }

  res.status(405).send('Method not allowed');
});
