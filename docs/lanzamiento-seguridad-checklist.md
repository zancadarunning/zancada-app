# Seguridad para el lanzamiento: qué está hecho

Estado a 2026-10-21. Público: sin claves. Este archivo resume; el detalle está en `docs/` y en la carpeta de pruebas (`test/`).

## Hecho (en el código y la infraestructura)

**Cuentas y acceso**
- Contraseñas de 8+ caracteres con mayúscula, minúscula y número (en la app y en Supabase); botón gris hasta cumplirlas.
- Confirmar la contraseña antes de borrar la cuenta o los datos; sesión reciente exigida en el servidor.
- Rechazo de cuentas sin correo confirmado para usar la IA.
- Errores genéricos al cliente (sin detalles internos), sin enumeración de usuarios.
- Edad mínima (16+) y consentimiento explícito para datos de salud, guardado con fecha y versión.
- Sin verificación en dos pasos de la app (se quitó el 2026-10-21). **Planeado para el lanzamiento:** ingreso con datos biométricos (huella / rostro) en el celular.

**Servidor**
- Todos los endpoints exigen sesión, secreto de cron o firma de webhook (un test lo comprueba para cada archivo nuevo).
- Comparaciones de secretos en tiempo constante; webhooks de Strava (secreto en la dirección + número de suscripción) y Suunto (firma HMAC).
- Tokens de relojes cifrados en la base (AES-256-GCM, con rotación de clave posible).
- Topes de uso: mensajes de IA por persona y globales por día, frecuencia de envío de correos y de procesamiento de video.
- Chat de IA: texto de sistema obligado a empezar como el de la app, herramientas acotadas y validadas, reglas fijas del servidor.
- Procesamiento de video acotado (formato, tamaño, tiempo, carpeta temporal privada).
- Dependencias vigiladas (Dependabot, auditoría semanal, revisión de dependencias en cada pull request).

**Web y apps**
- CSP estricto (sin código inline en los scripts), HSTS, X-Frame-Options, Permissions-Policy, COOP, sin exposición de archivos internos.
- Escape de todo texto libre al dibujar pantallas (test automático de XSS).
- Android: R8 activado, sin copias de seguridad automáticas, sin permisos de ubicación en segundo plano.

**Base de datos**
- Seguridad por filas en todas las tablas, funciones sensibles solo para el servidor y con ruta de búsqueda fija (auditado el 2026-10-21).

**Operación**
- Revisión de código automática (CodeQL) en cada cambio; integración continua obligatoria antes de mezclar.
- Alertas de Sentry (problemas nuevos y avisos de seguridad), monitoreo del servidor con UptimeRobot, aviso de estado de Supabase.
- Respaldo semanal de la base a tu computadora (domingo 22:00), **cifrado con clave pública** (la clave privada y su frase viven fuera de la PC), con registro; guía de qué revisar cada semana.
- Sin pedidos a terceros para recursos de la página: tipografías y mapa servidos desde `/vendor` (no se manda la IP a Google Fonts ni a cdnjs).
- Plan de incidentes escrito (`docs/plan-de-incidentes.md`).
- Inventario de datos y proveedores (`docs/privacidad-inventario-de-datos.md`), borrador de formularios de las tiendas y tabla de contratos con proveedores.

## Falta

La lista de pendientes del lanzamiento (legales, contratos, pruebas externas) se mantiene en privado, fuera del repositorio público.

## Qué no se hizo a propósito

- Guardar la sesión en el Keystore de Android: el almacenamiento de la app ya es privado y sin copias; el beneficio no justifica el riesgo de cerrarle la sesión a todos.
- "Descargar mis datos", "Cambiar contraseña" y "Cerrar sesión en todos los dispositivos" en el perfil: se sacaron por decisión del dueño (la contraseña se cambia solo con "Olvidé mi contraseña").
