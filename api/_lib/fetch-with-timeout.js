// api/_lib/fetch-with-timeout.js
//
// Ninguna llamada fetch() del backend tenía timeout -- si Strava, Polar, Wahoo,
// COROS o Anthropic se cuelgan (no responden, ni error ni éxito), la función
// serverless se queda viva esperando hasta que Vercel la mate por su propio
// límite de duración, pagando ese tiempo entero. Un timeout explícito y corto
// corta esa espera mucho antes: mismo resultado final (la llamada de todas
// formas iba a fallar), pero mucho más barato. No cambia el comportamiento en
// el caso normal (una API que responde en <10s nunca toca este límite).
//
// Uso: en vez de fetch(url, opts), usar fetchWithTimeout(url, opts, ms).

async function fetchWithTimeout(url, options, ms = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { fetchWithTimeout };
