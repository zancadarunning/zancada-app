# Monitoreo, alertas y respaldos

Público: sin claves. Qué mirar para enterarse rápido si algo se rompe o alguien ataca, y cómo se respalda la base.

## 1. Respaldo semanal de la base (el plan gratis de Supabase no trae copias)

- **Instalar (una sola vez):** correr `scripts/instalar-respaldo-semanal.ps1` (clic derecho → "Ejecutar con PowerShell"). Pide la clave de servicio de Supabase, la guarda cifrada con tu usuario de Windows y programa un respaldo todos los domingos a las 22:00 (si la PC estaba apagada, corre al encenderse).
- **Dónde quedan:** `C:\Users\<vos>\Backups\zancada\supabase-AAAA-MM-DD` (fuera de OneDrive y del repo). Se conservan los últimos 12. El registro está en `respaldo.log` de la misma carpeta.
- **Contienen datos personales** (salud, GPS, correos): tratarlos como un secreto, no subirlos a ningún lado sin cifrar.
- **No incluyen** los tokens de relojes (cada persona vuelve a conectar su reloj si hay que restaurar) ni las contraseñas.
- **Simulacro de restauración (cada 3 meses):** abrir un respaldo, revisar que `app_state.json` tiene las cuentas y las carreras que se esperan, y anotar la fecha acá.
- Con el plan Pro de Supabase hay copias diarias y recuperación a un punto en el tiempo: ahí este respaldo pasa a ser un extra.

## 2. Alertas de Sentry (te llega un correo)

Ya existe la regla "Zancada: problemas nuevos". Falta una para los avisos de seguridad (intentos con clave equivocada, webhooks falsos, tope global del chat):

1. Sentry → Alerts → Create Alert → **Issues**.
2. Entorno: `production`. Condición: "A new issue is created" **y** filtro `level:warning`.
3. Acción: enviar correo a vos. Nombre: "Zancada: avisos de seguridad".
4. Guardar.

Los avisos de seguridad salen con el mensaje "Intento de acceso…", "Webhook de … forjado", "Chat: se alcanzó el tope global…", "Verificación GET del webhook de Strava rechazada".

## 3. Aviso si el servidor se cae

Las apps de Android e iPhone (y la web mientras exista) usan el mismo servidor: si no responde, el chat con Zonda, las notificaciones y la conexión con los relojes dejan de funcionar. Un chequeo externo gratuito (UptimeRobot u otro; tiene app para el celular) avisa por correo o por el celular:

1. Crear cuenta en UptimeRobot → **Add New Monitor**.
2. Tipo **HTTP(s)**, nombre "Zancada servidor", URL `https://www.zancada.org/api/health` (responde 200 `{"status":"ok"}`), cada 5 minutos.
3. Segundo monitor, "Zancada página", URL `https://www.zancada.org/` (la landing cuando la web se cierre).
4. Contacto de alerta: tu correo y la app del celular.
5. Supabase (las cuentas y los datos) tiene su propio estado público: https://status.supabase.com — suscribirse a los avisos por correo.

## 4. Qué mirar una vez por semana (5 minutos)

- Sentry: ¿hay problemas nuevos sin resolver? ¿Cuántos avisos de seguridad?
- GitHub → Security: alertas de CodeQL y de Dependabot abiertas.
- Vercel: ¿falló algún despliegue o cron?
- Supabase: uso de datos salientes (Settings → Usage) para ver si se acerca al tope del plan.
- `respaldo.log`: ¿el último respaldo dice OK?
