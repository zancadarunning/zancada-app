# Plan de incidentes de seguridad

Qué hacer si algo sale mal. Es corto a propósito: en un incidente no se lee un manual largo. Este archivo es público: **nunca** pongas claves, contraseñas ni datos de usuarios acá.

## 1. Cómo nos enteramos

| Aviso | De dónde viene |
|---|---|
| Errores y eventos de seguridad (secreto de cron incorrecto, webhook falso, tope global del chat) | Sentry |
| Alertas de dependencias vulnerables y de secretos subidos por error | GitHub (Dependabot, secret scanning) y el job semanal `audit` del CI |
| Uso raro o picos (datos salientes, usuarios, correos) | Panel de uso de Supabase / Vercel |
| Un aviso de un tercero | `info@zancada.org` (ver `.well-known/security.txt`) |

## 2. Primeros 30 minutos (siempre igual)

1. **Anotá la hora y qué se ve.** Una nota, no hace falta más.
2. **Contené antes de investigar.** Si hay una clave filtrada, se rota (sección 3). Si hay una cuenta comprometida, se cierran sus sesiones. Si es el sitio, se desactiva lo afectado.
3. **No borres nada** (registros, usuarios, filas) hasta entender qué pasó.
4. **Avisá a quien corresponda** (sección 5) si hay datos de usuarios involucrados.

## 3. Rotar una clave filtrada

Todas las claves viven como variables de entorno en Vercel (Settings → Environment Variables) y, las de las marcas, también en el panel de cada marca. Después de cambiar una variable hay que volver a desplegar.

| Clave | Dónde se cambia |
|---|---|
| Clave de servicio de Supabase | Supabase → Project Settings → API |
| `CRON_SECRET` | Vercel (inventar uno largo nuevo) |
| `TOKEN_ENCRYPTION_KEY` (cifrado de tokens de relojes) | Ver `docs/cifrado-de-tokens.md`: se rota con la anterior en `TOKEN_ENCRYPTION_KEY_PREVIOUS`; **perderla** obliga a que cada persona reconecte su reloj |
| Clave de Anthropic | Consola de Anthropic (crear nueva, borrar la vieja) |
| Clave de Resend | Resend → API Keys (y la contraseña SMTP que usa Supabase para los correos de login) |
| Claves VAPID (notificaciones web) | Generar un par nuevo y actualizar Vercel y `app.js`; las suscripciones viejas dejan de servir |
| Secretos de Strava, Suunto, Wahoo, Polar, COROS | Panel de desarrolladores de cada marca |
| Cuenta de servicio de Firebase | Google Cloud → IAM → Cuentas de servicio |
| Clave de firma de Android | **No se puede rotar sin Google Play**: guardar siempre una copia fuera de la computadora |
| Clave pública de Turnstile / secreta | Cloudflare → Turnstile; la secreta también en Supabase → Authentication → Attack Protection |

Después de rotar: probar el login, una sincronización de reloj y el chat.

## 4. Escenarios

**Cuenta comprometida (un usuario).** Pedirle que use "Cerrar sesión en todos los dispositivos" y cambie la contraseña. Si no puede, desde Supabase → Authentication → Users se puede cerrar sus sesiones y forzar el cambio.

**Ataque de bots al registro o al login.** Verificar que el captcha esté activo (Supabase → Authentication → Attack Protection). Bajar temporalmente los límites de Rate Limits. Revisar el uso de correos de Resend.

**Abuso del chat con la IA.** Revisar el aviso de Sentry "tope global diario". Bajar `CHAT_DAILY_LIMIT` o `CHAT_GLOBAL_DAILY_LIMIT` en Vercel y volver a desplegar. Si hace falta, desactivar el chat devolviendo el mensaje de "ocupado".

**Datos expuestos o accesos indebidos a la base.** Rotar la clave de servicio, revisar políticas RLS (`sql/`), revisar los registros de Supabase. Pasar a la sección 5.

**Sitio comprometido o publicación indebida.** En Vercel → Deployments, volver a una versión anterior ("Promote to production"). En GitHub, revisar los últimos cambios a `main` y los accesos al repositorio.

**Caída de un proveedor (Supabase, Vercel, Cloudflare).** Mirar su página de estado y esperar; no tocar configuraciones. Avisar a los usuarios si dura más de unas horas.

## 5. Avisar

- **A los usuarios afectados:** sin demora indebida, con lenguaje claro: qué pasó, qué datos, qué hicimos y qué tienen que hacer (por ejemplo, cambiar la contraseña).
- **A la autoridad de datos personales:** si se exponen datos personales de usuarios en la Unión Europea, la normativa (RGPD) pide avisar en un máximo de 72 horas desde que se detecta. Si hay usuarios en Argentina u otros países, revisar la normativa local. Consultar a un abogado cuando haya datos de salud en juego.
- **A las marcas de relojes:** si se filtran sus tokens, avisarles para que los revoquen.

## 6. Después

1. Escribir qué pasó, cuándo, cómo se detectó, qué se hizo y qué falló (sin culpas: se busca arreglar el proceso).
2. Corregir la causa raíz y agregar una prueba automática que la detecte.
3. Actualizar este plan si algo no sirvió.

## 7. Mantenimiento periódico

| Cada | Tarea |
|---|---|
| Año | Renovar `Expires` en `.well-known/security.txt` (hay una prueba que avisa 60 días antes) |
| Trimestre | **Probar una restauración**: crear un proyecto de Supabase de prueba, restaurar la última copia de seguridad (`node scripts/backup-supabase.js` genera los archivos) y comprobar que los conteos de usuarios y carreras coinciden; después borrar el proyecto de prueba |
| Trimestre | Revisar quién tiene acceso a GitHub, Vercel, Supabase, Cloudflare, Sentry y las cuentas de marcas; sacar lo que sobre |
| Semestre | Rotar `CRON_SECRET` y revisar que ninguna clave haya quedado en lugares viejos |
| Antes de crecer mucho | Prueba de penetración externa |
