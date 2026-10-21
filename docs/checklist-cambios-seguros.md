# Seguridad en cada cambio: qué revisan solas las pruebas y qué es manual

La idea: **no volver a revisar todo de nuevo**. Lo que se pudo convertir en una prueba automática ya lo es (corre en `npm test` y en el CI; si falla, el cambio no se junta). Lo demás está en las listas de abajo.

## Lo que ya revisa solo (si falla, es a propósito)

| Qué se vigila | Dónde |
| --- | --- |
| Ningún secreto escrito en el código ni en TODO el historial de git (claves de Supabase/Anthropic/Resend/GitHub/AWS, llaves privadas, valores largos asignados a "secret/password/token") | `scripts/scan-secrets.js`, `test/secret-scan.test.js`, trabajo `secrets` del CI (cada subida, cada pull request y una vez por semana) |
| Todo endpoint de `api/` exige sesión, secreto de cron, firma de webhook o `state` firmado | `test/api-auth-guard.test.js` |
| Ningún endpoint devuelve el texto interno de un error | `test/security-errors.test.js` |
| Endpoints que cuestan plata o mandan emails tienen tope por usuario | `test/perf/secrets-and-env.test.js` |
| Toda variable de entorno que usa el servidor (también las que se leen por nombre dinámico) está en `.env.example`, sin valores | `test/perf/secrets-and-env.test.js` |
| Toda tabla que se crea en `sql/` activa RLS; toda función `SECURITY DEFINER` se revoca a `anon`/`public`; ninguna política abierta con `using (true)` | `test/sql-guards.test.js` |
| Toda tabla con datos de personas se borra en "Borrar mis datos" y al borrar la cuenta; las claves a `auth.users` sin cascada se vacían antes | `test/sql-guards.test.js`, `test/delete-account.test.js` |
| El navegador solo consulta tablas conocidas y cada una tiene la política del segundo paso (`mfa_required`) | `test/sql-guards.test.js` |
| Cabeceras de seguridad y CSP estricta (sin scripts en línea), sin recursos de terceros | `test/security-headers.test.js`, `test/self-hosted-assets.test.js`, `test/ui-events.test.js` |
| Nada de lo que escribe una persona se dibuja sin escapar | `test/xss-render.test.js` |
| Segundo paso (2FA): la API rechaza sesiones de nivel 1, la app lo pide al entrar y al borrar datos/cuenta | `test/mfa.test.js` |
| Tokens de relojes cifrados, nunca leídos ni guardados sin pasar por `token-crypto` | `test/token-crypto.test.js` |
| Variables de seguridad de Vercel presentes (clave de cifrado de tokens válida, secretos de cron/Strava, base): si falta una, Sentry avisa por mail como máximo cada 12 h | `api/_lib/config-check.js` (lo llama el cron de recordatorios), `test/config-check.test.js` |
| Dependencias sin vulnerabilidades graves | trabajo `audit` del CI, Dependabot, `dependency-review` |
| Análisis de código (inyecciones, rutas, etc.) | CodeQL (`.github/workflows/codeql.yml`) |

## Al agregar algo nuevo (lo que ningún test puede decidir por vos)

- **Endpoint nuevo en `api/`**: usar `verifyUser` (nunca confiar en un `user_id` que venga del cliente), `requireCronSecret` o una firma. Validar y acotar todo lo que venga en `req.body`/`req.query`. Si llama a un servicio que cuesta plata o manda mensajes, ponerle tope por usuario (`checkSyncCooldown`). Responder errores genéricos.
- **Tabla nueva**: `enable row level security` + política `auth.uid() = user_id`; si el navegador la consulta, sumar la política `mfa_required` (`sql/mfa_rls.sql`) y agregarla a `CLIENT_TABLES` en `test/sql-guards.test.js`; si guarda datos de personas, sumarla a `delete-account.js` y poner `on delete cascade` hacia `auth.users`. Los datos sensibles de integraciones nunca se leen desde el navegador.
- **Función SQL nueva con `SECURITY DEFINER`**: `set search_path`, y `revoke all ... from public, anon, authenticated` (el test lo exige). Sin SQL dinámico.
- **Variable de entorno nueva**: agregar el nombre a `.env.example`; el valor solo en Vercel.
- **Cambio en login, 2FA, borrado de cuenta o cierre de sesión**: probar los tres casos (cuenta con contraseña sin 2FA, con 2FA, con Google/Apple). El error de 2026-10-21 (no se podía borrar la cuenta con 2FA activado) vino de probar solo uno.
- **Botón o pantalla nueva**: `data-on-click="..."`, nunca `onclick="..."` ni `<script>` en línea.
- **Integración con un tercero**: ver la sección de acuerdos de datos en `docs/dpa-proveedores.md` y actualizar `docs/privacidad-inventario-de-datos.md`.
- **Dependencia nueva**: revisar que sea necesaria, mantenida y sin scripts de instalación raros.

## Lo que solo se puede revisar a mano

Semanal (5 minutos): correo de UptimeRobot y de Sentry ("avisos de seguridad"), pestaña Security de GitHub, que el respaldo del domingo haya corrido (`~/Backups/zancada/respaldo.log`).

Cada vez que se agregan archivos a la carpeta del proyecto en la PC: `npm run scan:local` (avisa de archivos con claves que git no ve pero que viajan a OneDrive).

Cada trimestre: probar restaurar un respaldo (`scripts/restaurar-respaldo.ps1`), revisar quién tiene acceso a Vercel, Supabase, GitHub, Cloudflare, Sentry y Play Console (todos con verificación en dos pasos), renovar `.well-known/security.txt` (vence 2027-10-19).

Antes de publicar en las tiendas: pentest externo (`docs/pentest-alcance.md`), acuerdos de datos aceptados (`docs/dpa-proveedores.md`), textos legales con abogado, Play Integrity (`docs/lanzamiento-seguridad-checklist.md`).
