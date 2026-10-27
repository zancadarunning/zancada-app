# Formularios de privacidad de las tiendas (borrador para copiar)

Respuestas redactadas a partir de `docs/privacidad-inventario-de-datos.md` y del código a 2026-10-21. **Es un borrador, no asesoramiento legal**: revisalo con quien firme el formulario y volvé a revisarlo cada vez que se agregue un dato nuevo o un proveedor nuevo. Mentir u omitir en estos formularios puede hacer que la tienda baje la app. Público: sin claves.

## Antes de empezar: lo que las tiendas exigen además del formulario

| Requisito | Estado |
|---|---|
| Política de privacidad pública (URL) | `https://www.zancada.org/privacy.html`. **Pendiente**: completar entidad legal y jurisdicción (marcadores de posición) |
| Forma de borrar la cuenta **dentro de la app** | Hecho: Perfil → "Borrar cuenta" (pide la contraseña) |
| URL web para pedir el borrado (Google Play lo exige) | **Hecho**: `https://www.zancada.org/eliminar-cuenta.html` (6 idiomas; por correo a `info@zancada.org`, respuesta en 5 días hábiles, según la política de privacidad). Falta que esté publicada (mergeada) y cargarla en Play Console |
| Declaración de permisos sensibles (ubicación, Health Connect) | Ver más abajo, justificaciones listas |
| Edad / público objetivo | La app exige 16+ al entrar (pantalla de consentimiento). Declarar "no dirigida a menores de 16" |
| Funciones de IA | Zonda envía contexto a un proveedor de IA: está dicho en el consentimiento y en la política |

## Google Play: "Seguridad de los datos" (Data safety)

**Preguntas generales**
- ¿La app recopila o comparte datos de usuario? **Sí.**
- ¿Todos los datos se cifran en tránsito? **Sí** (HTTPS en todo; CSP y HSTS en el sitio).
- ¿Podés pedir el borrado de datos? **Sí** (en la app y por correo; ver URL pendiente).

**Datos recopilados** ("Recopilado" = sale del dispositivo hacia nosotros o nuestros encargados). "Compartido" en Google **no** incluye a los proveedores que tratan los datos por nuestra cuenta (Supabase, Vercel, Sentry, etc.) pero **sí** incluye a quienes los usan para sus propios fines.

| Categoría de Google | Dato | ¿Recopilado? | ¿Compartido? | ¿Opcional? | Finalidad |
|---|---|---|---|---|---|
| Información personal | Correo | Sí | No | No (es la cuenta) | Funcionamiento de la app, gestión de la cuenta |
| Información personal | Nombre | Sí | No | Sí | Funcionamiento de la app, personalización |
| Información personal | Identificadores de usuario (id de cuenta) | Sí | No | No | Funcionamiento, gestión de la cuenta |
| Salud y estado físico | Información de salud (molestias, lesiones, embarazo/posparto, frecuencia cardíaca, notas) | Sí | **Sí** (contexto enviado a un proveedor de IA para que Zonda responda; ver nota 1) | Sí | Funcionamiento de la app, personalización |
| Salud y estado físico | Información de estado físico (carreras, distancia, ritmo, peso, altura, edad) | Sí | **Sí** (igual, nota 1) | Parte sí | Funcionamiento de la app, personalización, análisis |
| Ubicación | Ubicación precisa (ruta GPS de las carreras; coordenadas del lugar para el clima) | Sí | **Sí** (la ruta se envía a Mapbox para dibujar el mapa; las coordenadas a Open-Meteo para el clima; nota 2) | Sí (solo al usar el registro de carreras o el clima) | Funcionamiento de la app |
| Mensajes | Otros mensajes en la app (charla con Zonda) | Sí | **Sí** (proveedor de IA) | Sí | Funcionamiento de la app |
| Actividad en apps | Interacciones / otro contenido (plan, notas del coach, respuestas) | Sí | No | Sí | Funcionamiento, personalización |
| Info y rendimiento de la app | Registros de fallos y diagnósticos | Sí | No (Sentry actúa por nuestra cuenta, con datos personales eliminados antes de enviar) | No | Análisis, estabilidad |
| Identificadores de dispositivo | Token de notificaciones (Firebase) y un identificador aleatorio de la instalación (se guarda solo su resumen irreversible) para avisar por correo de inicios de sesión desde un dispositivo nuevo | Sí | No | El token sí (opcional); el identificador de la instalación no | Funcionamiento (avisos), seguridad de la cuenta |
| Ubicación | Ubicación aproximada (solo el país desde el que se inicia sesión, sin guardar la IP; para el aviso de dispositivo nuevo) | Sí | No | No | Seguridad de la cuenta |

Notas:
1. **Anthropic** (verificado el 2026-10-21 en sus términos comerciales y su centro de privacidad): recibe nombre, edad aproximada, peso, altura, objetivo, plan, resumen de carreras recientes, molestias, notas, nombres de zapatillas, zona horaria y la charla. **No** recibe correo, id de cuenta, coordenadas, ruta GPS ni las carreras de Strava. Sus Términos Comerciales (sección B) dicen que no entrena modelos con el contenido de los clientes de la API, y (sección C) incorporan su contrato de tratamiento de datos; la retención estándar de la API es de hasta 30 días (hasta 2 años si el contenido es marcado por violar su política de uso, y lo que la ley exija). Existe retención cero bajo pedido (contactar a ventas). Aun así, Google no cuenta como "compartir" a un proveedor que trata los datos por tu cuenta: se declara "Sí" de forma conservadora por tratarse de datos de salud con consentimiento explícito; confirmar el criterio con asesoría.
2. **Mapbox** recibe la ruta (hasta 200 puntos) en la dirección de la imagen del mapa y, además, las coordenadas de los cuadros de mapa (tiles) que se ven en el mapa en vivo, en el detalle de cada carrera y en el video: eso revela la zona por donde corre la persona, junto con su IP. **Open-Meteo** recibe las coordenadas **redondeadas a 2 decimales** (aprox. 1 km) para el clima.
3. **Terceros de recursos:** desde el 2026-10-21 las tipografías y el mapa (Leaflet) se sirven desde `/vendor` (copias propias): la app ya **no** le manda la IP de cada visita a Google Fonts ni a cdnjs.
4. **No** se declara: fotos/videos (el video del recorrido se arma y se guarda en el teléfono, no se sube), contactos, archivos, calendario, SMS, historial de navegación, información financiera, datos de compra.
5. **No** hay publicidad ni venta de datos ni SDK de anuncios. No hay "seguimiento" entre apps.

**Permisos sensibles: justificaciones para la declaración**
- *Ubicación (precisa y aproximada)*: calcular distancia, ritmo y ruta de las carreras mientras el usuario las registra, y mostrar el clima local. Durante una carrera la app sigue la ubicación con un **servicio en primer plano de tipo ubicación** (con una notificación visible, para que siga funcionando con la pantalla apagada); la app **no** declara el permiso de ubicación en segundo plano (`ACCESS_BACKGROUND_LOCATION`) y no sigue la ubicación fuera de una carrera ni del clima.
- *Health Connect (leer ejercicio, distancia, frecuencia cardíaca, elevación, calorías, pasos)*: traer al historial las carreras registradas por el reloj o por otras apps, solo con permiso explícito del usuario.
- *Notificaciones*: recordatorios del día, aviso de carrera cargada y resumen semanal.
- *Vibración / almacenamiento (Android 9 o menos)*: respuesta táctil y guardar el video del recorrido.

## App Store (Apple): "Etiquetas de privacidad" (App Privacy)

**¿Se usan datos para rastrear al usuario (tracking)?** **No.** (No hay publicidad, ni intercambio con corredores de datos, ni SDK de seguimiento.)

| Tipo de dato (Apple) | ¿Se recopila? | ¿Vinculado a la persona? | ¿Se usa para rastrear? | Finalidad |
|---|---|---|---|---|
| Información de contacto: dirección de correo | Sí | Sí | No | Funcionalidad de la app, gestión de la cuenta |
| Información de contacto: nombre | Sí | Sí | No | Funcionalidad de la app, personalización |
| Salud y estado físico: Salud | Sí | Sí | No | Funcionalidad de la app, personalización |
| Salud y estado físico: Estado físico (ejercicio) | Sí | Sí | No | Funcionalidad de la app, personalización |
| Ubicación: ubicación precisa | Sí | Sí | No | Funcionalidad de la app |
| Contenido del usuario: otro contenido (charla con Zonda, notas) | Sí | Sí | No | Funcionalidad de la app |
| Identificadores: ID de usuario | Sí | Sí | No | Funcionalidad de la app |
| Identificadores: ID de dispositivo (identificador aleatorio de la instalación, solo su resumen irreversible; y token de notificaciones) | Sí | Sí | No | Funcionalidad de la app, seguridad de la cuenta |
| Ubicación: ubicación aproximada (país desde el que se inicia sesión, sin guardar la IP) | Sí | Sí | No | Funcionalidad de la app (seguridad de la cuenta) |
| Diagnósticos: datos de fallos | Sí | No (se eliminan datos personales antes de enviarlos) | No | Análisis |

**Cuando exista la app de iPhone:** si se lee Apple Salud (HealthKit), hay que agregar el uso de HealthKit con su texto de propósito y **no** se pueden usar esos datos para publicidad ni para fines de IA no declarados. Inicio de sesión con Apple: ya soportado en el código (nunca probado en un dispositivo iPhone).

## Antes de enviar a revisión: lista corta

- [ ] Completar entidad legal y jurisdicción en `privacy.html` y `terms.html`.
- [ ] Cargar la URL de borrado (`https://www.zancada.org/eliminar-cuenta.html`) en Play Console.
- [ ] Aceptar los DPA de los proveedores (ver `docs/dpa-proveedores.md`).
- [x] Anthropic verificado el 2026-10-21 (no entrena con datos de la API, retención estándar de hasta 30 días, contrato de tratamiento incorporado). Volver a mirar si cambian sus términos; evaluar retención cero por tratarse de datos de salud.
- [ ] Google Play: completar la declaración de **permisos de servicios en primer plano** (`FOREGROUND_SERVICE_LOCATION`) con su descripción y, si lo piden, un video corto que muestre la notificación durante una carrera.
- [ ] Decidir sobre Strava (sus reglas prohíben datos con IA y piden borrarlos a los 7 días).
- [ ] Revisión de las traducciones del consentimiento (pt, fr, it, de) por hablantes nativos.
- [ ] Probar el flujo completo en un dispositivo limpio: registro → consentimiento → onboarding → borrar cuenta.
