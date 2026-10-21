# Cifrado de los tokens de relojes en la base

Los tokens de acceso de Strava, Suunto, Wahoo, Polar y COROS se guardan **cifrados** (AES-256-GCM) en las tablas `*_connections`. La clave vive solo en Vercel (`TOKEN_ENCRYPTION_KEY`), nunca en la base ni en el repositorio. Si se filtrara un volcado de la base, los tokens serían ilegibles sin esa clave.

Código: `api/_lib/token-crypto.js` (`encToken` al guardar, `decToken` al usar). Una prueba (`test/token-crypto.test.js`) falla si algún lugar del servidor lee o guarda un token sin pasar por ellos.

## Puesta en marcha (en este orden: si se altera el orden, las sincronizaciones fallan)

1. **Generar la clave** en tu computadora (no la pegues en ningún chat ni archivo del repositorio):
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   Guardala en tu gestor de contraseñas (si se pierde, los tokens cifrados no se pueden recuperar: cada persona tendría que volver a conectar su reloj).
2. **Cargarla en Vercel** → Settings → Environment Variables → `TOKEN_ENCRYPTION_KEY` (solo Production).
3. **Publicar el código** (mergear el pull request) y esperar a que Vercel termine de desplegar. Con la clave cargada, los tokens *nuevos* y los que se renuevan ya se guardan cifrados; los viejos siguen funcionando porque se aceptan sin cifrar.
4. **Cifrar los que ya estaban**: en un archivo `.env` en la raíz del repositorio (no se sube a git) poner `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` y `TOKEN_ENCRYPTION_KEY`, y correr
   `node scripts/encrypt-existing-tokens.js --dry-run` (solo cuenta) y después `node scripts/encrypt-existing-tokens.js`.
   Al terminar, borrar el `.env`.
5. **Comprobar** que las sincronizaciones siguen andando: en Strava/Suunto/Wahoo/Polar/COROS, el botón "Sincronizar ahora" y el aviso de errores de Sentry.

**Nunca** correr el paso 4 antes de que el paso 3 esté desplegado con la clave: el código viejo no sabe leer tokens cifrados.

## Rotar la clave

1. Generar una clave nueva. En Vercel: la actual pasa a `TOKEN_ENCRYPTION_KEY_PREVIOUS` y la nueva a `TOKEN_ENCRYPTION_KEY`. Desplegar.
2. En `.env`: las dos variables igual que en Vercel; correr `node scripts/encrypt-existing-tokens.js --rotate`.
3. Cuando no queden tokens con la clave vieja, borrar `TOKEN_ENCRYPTION_KEY_PREVIOUS`.

## Si se pierde la clave

No hay forma de recuperar los tokens. Se borran las filas de las tablas `*_connections` y cada persona vuelve a conectar su reloj.
