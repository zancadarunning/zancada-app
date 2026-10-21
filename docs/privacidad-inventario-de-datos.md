# Inventario de datos personales y proveedores

Base para los textos legales y para el cumplimiento de privacidad en un lanzamiento mundial (RGPD en Europa, LGPD en Brasil, CCPA en California, la ley argentina de datos personales y las reglas de las tiendas de aplicaciones). **No es asesoramiento legal**: sirve para que un abogado revise con datos concretos. Este archivo es público: sin claves ni datos de personas.

## 1. Qué datos se guardan de cada persona

| Categoría | Ejemplos | Sensible | Dónde |
|---|---|---|---|
| Cuenta | correo, contraseña (guardada como hash por Supabase), método de ingreso (correo, Google, Apple), fecha de alta | No | Supabase Auth |
| Perfil | nombre, nacimiento, género, peso, altura, nivel, objetivo, días y terreno de entrenamiento, idioma, zona horaria | **Sí, por ser datos de salud/físicos** | `app_state` (Supabase) |
| Salud y bienestar | frecuencia cardíaca máxima y zonas, molestias y lesiones, embarazo o posparto, chequeos de sueño y ánimo, notas del coach | **Sí (datos de salud)** | `app_state` |
| Entrenamientos | cada carrera con fecha, distancia, ritmo, pulso, **ruta GPS completa**, zapatillas | **Sí (ubicación, salud)** | `app_state` |
| Charla con Zonda | mensajes del usuario y respuestas de la IA | Puede incluir salud | `app_state` y, mientras se procesa, Anthropic |
| Conexiones con relojes | tokens de acceso de Strava, Suunto, Wahoo, Polar y COROS (cifrados en la base) | Credencial | `*_connections` (Supabase) |
| Notificaciones | suscripción push (web) o token de Firebase (Android) | No | `push_subscriptions` |
| Social (opcional) | nombre de usuario público, a quién sigue, carreras compartidas (solo distancia, duración y fecha) | No | `usernames`, `follows`, `run_feed`, `run_likes` |
| Técnicos | límites de uso del chat, avisos enviados | No | `chat_usage`, `sent_notifications`, `sync_cooldowns` |
| Registros de errores | errores del servidor, con datos personales eliminados antes de enviarse (`scrubEvent`) | Mínimo | Sentry |

Lo que **no** se guarda: contraseñas en claro, datos de tarjetas, documentos de identidad.

## 2. A quién se le envían (encargados del tratamiento)

| Proveedor | Para qué | Qué datos recibe | Ubicación / nota |
|---|---|---|---|
| **Supabase** | Base de datos y autenticación | Todo lo de la sección 1 | Proyecto en **East US (Ohio)**: para usuarios de la UE hay una transferencia internacional (cláusulas contractuales tipo o Marco UE-EE. UU.) |
| **Vercel** | Hosting y funciones del servidor | Todo lo que pasa por la API, direcciones IP en sus registros | EE. UU. |
| **Anthropic** | La IA de Zonda | Contexto del chat: nombre, edad, peso, altura, objetivo, plan, últimas carreras (resumen), molestias, embarazo/posparto, notas del coach y la conversación. **No** recibe las carreras de Strava ni la ruta GPS | EE. UU. Verificar su política vigente de retención y el uso para entrenamiento (por defecto, los datos de la API comercial no se usan para entrenar) y si conviene activar retención cero |
| **Resend** | Correos de confirmación y restablecer contraseña | Dirección de correo y el contenido del mensaje | EE. UU. |
| **Sentry** | Errores | Metadatos técnicos, sin datos personales | EE. UU. |
| **Cloudflare** | DNS, reenvío de correo (`info@`) | Direcciones y contenido de lo que se reenvía | Global |
| **Mapbox** | Mapas de las rutas | **La ruta** (hasta 200 puntos) de cada carrera cuyo mapa se dibuja, y las coordenadas de los cuadros de mapa que se ven (zona donde corre la persona) | EE. UU. |
| **Open-Meteo** | Clima en la pantalla de inicio | Las coordenadas **redondeadas a 2 decimales** (aprox. 1 km) | Europa |
| **Google (Firebase)** | Notificaciones en Android; ingreso con Google | Token de dispositivo; datos de la cuenta si elige Google | EE. UU. |
| **Apple** | Ingreso con Apple (cuando exista la app de iPhone) | Datos de la cuenta si elige Apple | EE. UU. |
| **Strava, Suunto, Wahoo, Polar, COROS** | Importar carreras y enviar el plan al reloj | Tokens de acceso; carreras; plan semanal (a Suunto y Wahoo) | Según cada marca; **Strava prohíbe usar sus datos con IA y exige borrarlos a los 7 días**: ver `docs/` y la memoria del proyecto |

Falta, para cada uno: firmar o aceptar el **contrato de tratamiento de datos (DPA)** que ofrecen en sus paneles o sitios.

## 3. Derechos de las personas y cómo se atienden hoy

| Derecho | Estado |
|---|---|
| Acceso y portabilidad | **Por correo** a `info@zancada.org` (se exporta a mano desde la base). El botón "Descargar mis datos" se sacó de la app el 2026-10-21 por decisión del dueño; la ley (RGPD, LGPD) exige poder atender el pedido, así que hace falta definir un plazo de respuesta (por ejemplo 30 días) y quién lo ejecuta |
| Borrado | **Hecho**: Perfil → "Borrar mis datos" y "Borrar cuenta" (borra todo, revoca las conexiones con relojes donde la marca lo permite (Strava, Polar, Wahoo, COROS) y exige confirmar la contraseña) |
| Rectificación | **Hecho**: el perfil, el plan y las carreras se editan en la app |
| Limitación y oposición | Por correo a `info@zancada.org`; sin automatizar |
| Retirar el consentimiento | Desconectar cada reloj; borrar los datos |
| Reclamo ante la autoridad | A indicar en la política de privacidad según el país |

## 4. Decisiones que tiene que tomar el dueño (y un abogado)

1. **Entidad legal y jurisdicción** que figuran en la política de privacidad y los términos (hoy son marcadores de posición).
2. **Edad mínima**: **hecho el 2026-10-21 con 16 años** (el valor habitual en Europa; en EE. UU. el mínimo legal es 13 con permiso de los padres, así que 16 cubre ambos). Antes de usar la app, cuenta nueva o existente, hay que tildar "Tengo 16 años o más"; no hay verificación de edad real (es una declaración). Un abogado tiene que confirmar si el mínimo es 16 en todos los países donde se lance.
3. **Base legal del tratamiento de datos de salud**: **hecho el 2026-10-21**: pantalla de consentimiento explícito (con aviso de que Zonda no es consejo médico y de que los datos se envían a un proveedor de IA), guardado en `state.consent` con versión y fecha (`CONSENT_VERSION` en `app.js`; subirla vuelve a pedirlo). Rechazar cierra la sesión. Revisar el texto con un abogado.
4. **Región de los datos**: si la mayoría de los usuarios estarán en la UE o Latinoamérica, evaluar mover Supabase a Frankfurt o São Paulo (no es urgente, pero es más fácil hacerlo antes de tener muchos datos).
5. **Representante en la UE** si se ofrece el servicio allí (RGPD, art. 27), según el tamaño y la actividad.
6. **Formularios de las tiendas**: "Seguridad de los datos" de Google Play y "Etiquetas de privacidad" de Apple (salen de las tablas de arriba).
7. **Retención**: definir cuánto tiempo se conservan las cuentas inactivas (por ejemplo, avisar y borrar a los 24 meses).
8. **Strava**: la regla de los 7 días contradice guardar las carreras indefinidamente; decidir si se mantiene la integración.
