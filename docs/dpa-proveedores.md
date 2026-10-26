# Contratos de tratamiento de datos (DPA) con los proveedores

El RGPD (UE), la LGPD (Brasil) y leyes similares exigen tener un contrato por escrito con cada empresa que trata datos personales de tus usuarios por tu cuenta (el "encargado del tratamiento"). Casi todos ofrecen un contrato estándar que **se acepta online** o ya **forma parte de sus términos**. Esta tabla dice dónde mirar. Enlaces verificados el 2026-10-21. **No es asesoramiento legal.** Público: sin claves.

Cómo se hace en cada caso: abrir el enlace, leer qué dice sobre cómo se firma o si ya está incluido, y dejar constancia en la columna "Estado" (fecha y quién lo hizo).

| Proveedor | Qué recibe | Contrato | Cómo se acepta | Estado |
|---|---|---|---|---|
| **Supabase** (base de datos y cuentas) | Todo: perfil, salud, carreras con GPS, charla | https://supabase.com/legal/dpa | Leer en el enlace cómo se acepta (suele ser desde el panel de la organización o pidiendo una copia firmada a su soporte; puede requerir plan de pago). Verificar el trámite actual | **Verificado el 2026-10-26:** el DPA (versión 1, 1/8/2026) "suplementa y forma parte" de los Términos de Servicio y es efectivo desde la fecha del acuerdo; las cláusulas contractuales tipo (SCC) se firman por la sola aceptación del acuerdo. Ya vigente al abrir la cuenta. Guardar una copia del PDF. |
| **Vercel** (hosting y servidor) | Todo lo que pasa por la API, IP | https://vercel.com/legal/dpa | Ya está incorporado en sus términos para clientes; descargar copia firmada si hace falta | **Verificado el 2026-10-26:** su DPA (vigente 31/3/2026) se declara parte del acuerdo Enterprise; el proyecto está en el plan Pro. Escribir a soporte de Vercel pidiendo confirmar que el DPA aplica a la cuenta (o la copia firmada) y archivar la respuesta. |
| **Anthropic** (IA de Zonda) | Contexto del chat: datos de salud y actividad (sin correo, id ni coordenadas) | https://www.anthropic.com/legal/data-processing-addendum | **Verificado el 2026-10-21:** el contrato de tratamiento de datos está incorporado por referencia en los Términos Comerciales (sección C), que aceptaste al crear la cuenta de la API; esos términos (sección B) prohíben entrenar modelos con tu contenido. Retención estándar de la API: hasta 30 días. Pedir retención cero a ventas si querés eliminarla | Verificado: archivar copia |
| **Resend** (correos de cuenta) | Correo y contenido del mensaje | https://resend.com/legal/dpa | Se acepta desde la cuenta o por correo a su soporte | **Verificado el 2026-10-26:** el DPA (actualizado 31/12/2025) "se vuelve vinculante cuando el cliente celebra el acuerdo"; ya vigente. Guardar una copia. |
| **Sentry** (errores) | Metadatos técnicos (datos personales eliminados antes de enviar) | https://sentry.io/legal/dpa/ | Incorporado en sus términos; activar si pide aceptación en Settings → Legal | **Verificado el 2026-10-26:** DPA 5.1.0 (29/5/2024) que complementa el acuerdo de servicio (no modifica sus términos); vigente con la cuenta. Guardar una copia. |
| **Mapbox** (mapas) | La ruta (hasta 200 puntos) de cada carrera cuyo mapa se dibuja, y las coordenadas de los cuadros de mapa que se ven (zona donde corre la persona) | https://www.mapbox.com/legal/dpa | Incorporado en sus términos; descargar copia | El DPA se publica como PDF en el portal legal de Mapbox y forma parte de sus términos; descargar el PDF y archivarlo. |
| **Cloudflare** (DNS, reenvío de `info@`) | Direcciones y contenido de lo que se reenvía | https://www.cloudflare.com/cloudflare-customer-dpa/ | Incorporado automáticamente en el contrato de cliente | Incorporado en el contrato de cliente según su página (no re-verificado el 2026-10-26). Guardar una copia. |
| **Google / Firebase** (notificaciones Android, ingreso con Google) | Token del dispositivo; datos de cuenta si elige Google | https://firebase.google.com/terms/data-processing-terms | Incorporado en los términos de Firebase | Incorporado en los términos de Firebase según su página (no re-verificado el 2026-10-26). Guardar una copia. |
| **Open-Meteo** (clima) | Coordenadas **redondeadas a 2 decimales** (aprox. 1 km) | https://open-meteo.com/en/terms | No ofrecen DPA (API gratuita). Riesgo bajo por el redondeo; si se quiere contrato, cambiar de proveedor | Decidido: aceptado |
| **Strava / Suunto / Wahoo / Polar / COROS** | Tokens y carreras que la propia persona autoriza | Cada marca tiene sus términos de API | Son responsables independientes de lo suyo; revisar sus reglas (Strava: prohíbe IA y pide borrar a los 7 días) | Revisar |
| **Apple** (ingreso con Apple, futuro) | Datos de cuenta | Términos del programa de desarrolladores | Al inscribirse | Futuro |

## Ya no se usan

Google Fonts y cdnjs (Leaflet): desde el 2026-10-21 se sirven desde `/vendor`, así que no reciben la IP de las visitas y no hace falta contrato con ellos.

## Transferencias internacionales

Supabase está en **East US (Ohio)** y casi todos los proveedores en EE. UU.: para usuarios de la UE hace falta una base legal para la transferencia (Marco de Privacidad de Datos UE–EE. UU. si el proveedor está adherido, o cláusulas contractuales tipo, que suelen estar dentro de los DPA de arriba). Decisión pendiente del dueño: mover Supabase a Frankfurt o São Paulo si la mayoría de los usuarios estará en la UE o Latinoamérica (más fácil antes de tener muchos datos).

## Qué conservar

Una carpeta (fuera del repositorio) con la copia aceptada de cada contrato y la fecha. Si un usuario o una autoridad pregunta quién trata sus datos, esta tabla y esa carpeta son la respuesta.
