# Seguridad para el lanzamiento: qué está hecho y qué falta

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

## Falta (depende de personas o del momento)

| Tema | Qué hace falta | Quién |
|---|---|---|
| Textos legales | Entidad legal, jurisdicción, plazos, representante en la UE si corresponde | Dueño + abogado |
| Edad mínima | Confirmar 16 en todos los países de lanzamiento | Abogado |
| Pedidos de datos de las personas | Definir quién y en cuánto tiempo (el botón de descargar se sacó por decisión del dueño) | Dueño |
| Contratos con proveedores (DPA) | Aceptarlos y archivarlos (`docs/dpa-proveedores.md`) | Dueño |
| Región de los datos | Decidir si se mueve Supabase a Europa o Brasil | Dueño |
| Strava | Decidir si se mantiene (prohíbe IA y exige borrar a los 7 días) | Dueño |
| Formularios de las tiendas | Completarlos con `docs/tiendas-formularios-privacidad.md` y cargar la URL de borrado (`/eliminar-cuenta.html`, ya creada) | Dueño |
| Traducciones del consentimiento | Revisión de pt, fr, it, de por hablantes nativos | Externo |
| Plan de pago el día del lanzamiento | Supabase Pro (contraseñas filtradas, tope de sesión, más límites), Resend pago, subir el tope de correos por hora | Dueño |
| Seguridad sobre el celular | Play Integrity en Android una vez publicada; revisión equivalente en iPhone cuando exista | Yo + dueño |
| Prueba de intrusión externa | Contratar a alguien que ataque la app antes del lanzamiento. El alcance, los endpoints, lo ya conocido y las reglas están en `docs/pentest-alcance.md` | Externo |
| Higiene periódica | Cambiar `CRON_SECRET` y claves cada seis meses; simulacro de restauración de un respaldo cada tres; renovar `security.txt` cada año; pasar DMARC a "quarantine" | Dueño |

## Qué no se hizo a propósito

- Guardar la sesión en el Keystore de Android: el almacenamiento de la app ya es privado y sin copias; el beneficio no justifica el riesgo de cerrarle la sesión a todos.
- "Descargar mis datos", "Cambiar contraseña" y "Cerrar sesión en todos los dispositivos" en el perfil: se sacaron por decisión del dueño (la contraseña se cambia solo con "Olvidé mi contraseña").
