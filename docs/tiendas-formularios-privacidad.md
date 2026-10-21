# Formularios de privacidad de las tiendas (borrador para copiar)

Respuestas redactadas a partir de `docs/privacidad-inventario-de-datos.md` y del código a 2026-10-21. **Es un borrador, no asesoramiento legal**: revisalo con quien firme el formulario y volvé a revisarlo cada vez que se agregue un dato nuevo o un proveedor nuevo. Mentir u omitir en estos formularios puede hacer que la tienda baje la app. Público: sin claves.

## Antes de empezar: lo que las tiendas exigen además del formulario

| Requisito | Estado |
|---|---|
| Política de privacidad pública (URL) | `https://www.zancada.org/privacy.html`. **Pendiente**: completar entidad legal y jurisdicción (marcadores de posición) |
| Forma de borrar la cuenta **dentro de la app** | Hecho: Perfil → "Borrar cuenta" (pide la contraseña) |
| URL web para pedir el borrado (Google Play lo exige) | **Pendiente**: una página o un correo claro. Propuesta: sección en la política de privacidad con `info@zancada.org` y un plazo de respuesta (ej. 30 días) |
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
| Identificadores de dispositivo | Token de notificaciones (Firebase / Web Push) | Sí | No | Sí | Funcionamiento (avisos) |

Notas:
1. Anthropic recibe nombre, edad, peso, altura, objetivo, plan, resumen de carreras recientes, molestias, notas y la charla. **No** recibe las carreras de Strava ni la ruta GPS. Verificar su contrato de tratamiento de datos y su política de retención antes de declarar "no se usa para otros fines".
2. Mapbox recibe hasta 200 puntos de la ruta en la dirección de la imagen del mapa. Open-Meteo recibe las coordenadas aproximadas para el clima.
3. **No** se declara: fotos/videos (el video del recorrido se arma y se guarda en el teléfono, no se sube), contactos, archivos, calendario (los entrenamientos se agregan al calendario del teléfono pero los datos no salen del dispositivo), SMS, historial de navegación, información financiera, datos de compra.
4. **No** hay publicidad ni venta de datos ni SDK de anuncios. No hay "seguimiento" entre apps.

**Permisos sensibles: justificaciones para la declaración**
- *Ubicación (precisa y aproximada)*: calcular distancia, ritmo y ruta de las carreras mientras el usuario las registra, y mostrar el clima local. Solo en primer plano; **no** se usa ubicación en segundo plano.
- *Health Connect (leer ejercicio, distancia, frecuencia cardíaca, elevación, calorías, pasos)*: traer al historial las carreras registradas por el reloj o por otras apps, solo con permiso explícito del usuario.
- *Calendario (leer/escribir)*: agregar los entrenamientos del plan a un calendario propio "Zancada" y quitarlos al borrar el plan.
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
| Diagnósticos: datos de fallos | Sí | No (se eliminan datos personales antes de enviarlos) | No | Análisis |

**Cuando exista la app de iPhone:** si se lee Apple Salud (HealthKit), hay que agregar el uso de HealthKit con su texto de propósito y **no** se pueden usar esos datos para publicidad ni para fines de IA no declarados. Inicio de sesión con Apple: ya soportado en el código (nunca probado en un dispositivo iPhone).

## Antes de enviar a revisión: lista corta

- [ ] Completar entidad legal y jurisdicción en `privacy.html` y `terms.html`.
- [ ] Publicar la URL de pedido de borrado de cuenta (Google Play).
- [ ] Aceptar los DPA de los proveedores (ver `docs/dpa-proveedores.md`).
- [ ] Verificar la política de retención y el uso de datos de Anthropic antes de marcar "no se usan para entrenar".
- [ ] Decidir sobre Strava (sus reglas prohíben datos con IA y piden borrarlos a los 7 días).
- [ ] Revisión de las traducciones del consentimiento (pt, fr, it, de) por hablantes nativos.
- [ ] Probar el flujo completo en un dispositivo limpio: registro → consentimiento → onboarding → borrar cuenta.
