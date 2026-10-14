# Huawei Health Service Kit: solicitud de acceso

Estado: **borrador (2026-10-14), nada enviado.** Los pasos y plazos salen de la documentación pública de Huawei y de resúmenes de terceros; los detalles exactos (formulario, URLs, nombres de los permisos) están detrás del login del portal y hay que confirmarlos ahí.
Huawei ahora llama al producto "Health Service Kit" (antes "Health Kit").

## Requisitos reales (leídos en developer.huawei.com el 2026-10-14)
- **Persona individual:** solo puede acceder a datos de nivel **básico** (candado abierto en su tabla "Open Data Overview"). Los de nivel **avanzado** (candado cerrado) exigen ser empresa.
- **Empresa fuera de Europa, Japón y China continental:** capital integrado de al menos CNY 500.000 para nivel básico, y más de un año de existencia. Zancada no cumple.
- **Exigencia clave para individuos:** la app tiene que estar **publicada en AppGallery** (la tienda de Huawei); si no, los datos de Health Service Kit no se abren a la app. Además, no tener antecedentes crediticios adversos.
- **Datos que Zancada necesita:** `Exercise records` (resumen), `Exercise record detailed data` (frecuencia cardíaca, velocidad, cadencia y altitud del entrenamiento) y opcionalmente `Activity record location details`: los tres son nivel **básico**. En cambio `Heart rate` suelto (frecuencia cardíaca diaria, en reposo, variabilidad), `Sleep`, presión, glucosa, etc. son **avanzados**: no se piden.
- Fase de prueba: hasta 100 usuarios sin aprobación final. Datos de menores no se abren.
- Se necesitan los formularios Excel/PDF "Application Material" (versión individuo o empresa) que se bajan de la página "Qualifications Requirements for Developers".

## Camino recomendado
Usar la API en la nube (REST) con inicio de sesión HUAWEI ID, igual que Polar/Wahoo: el usuario autoriza una vez y el backend de Zancada trae sus carreras. Funciona en la web y en Android, con o sin servicios de Huawei en el teléfono. El SDK de Android obliga a tener Huawei Health/HMS en el teléfono.
No se escribe código hasta tener credenciales aprobadas.

## Pasos y plazos (aprox. 5 a 6 semanas)
0. **Publicar la app en AppGallery** (requisito para individuos). Hoy Zancada solo está pensada para Google Play y su web.
1. Cuenta de desarrollador en developer.huawei.com y verificación de identidad (la hace el titular).
2. Configurar el servicio **HUAWEI ID** para la app (~3 días hábiles).
3. Pedir **Health Service Kit** y los permisos de lectura (~15 días hábiles).
4. **Verificación** con video de demostración y checklist (~15 días hábiles). Los permisos aprobados se activan en unas 24 h.
5. Recién ahí se construye la integración (api/huawei-*.js, tabla huawei_connections, tarjeta en Perfil → Conectividad, 6 idiomas) y se actualiza privacy.html.

## Antes de enviar
- Completar en `privacy.html` y `terms.html` la entidad legal y la jurisdicción (hoy son marcadores).
- Decidir si las carreras de Huawei pueden llegar al coach IA (ver "Uso con IA" abajo).
- Tener capturas de Historial, detalle de carrera y la tarjeta de conexión, y un video corto del flujo (conectar → importar → ver la carrera).
- Pedir solo los permisos que la app usa de verdad: Huawei exige que coincidan.

## Texto de la solicitud (inglés)

**App name:** Zancada
**Website:** https://www.zancada.org
**Android package:** org.zancada.app
**Contact:** info@zancada.org
**Privacy policy:** https://www.zancada.org/privacy.html
**OAuth redirect URL (propuesta):** https://www.zancada.org/api/huawei-auth

**Description**
Zancada is a training-plan app for runners. It builds a weekly running plan from the user's goal and level, lets them log their runs, and shows their history, personal records and training load. Users can connect their sports watch so that completed runs are imported automatically instead of typed in by hand.

**Use case**
A user with a Huawei watch connects their HUAWEI ID from Profile > Connectivity. Zancada then imports that user's completed running workouts into their own training diary, compares them with the session planned for that day, and uses them to adjust the following weeks. Data is shown only to the user it belongs to. The integration is read-only: we do not write any data to Huawei Health.

**Data scopes requested (read only)**
1. Exercise / activity records, running only: start and end time, duration, distance and calories. Needed to log the run and compare it with the plan.
2. Exercise record detailed data (workout heart rate, speed, cadence and altitude samples, running workouts only): needed to show the heart-rate zones, pace and cadence of the run, which are central to the training plan.

**Not requested:** location/route, all-day heart rate, sleep, blood pressure, blood glucose, blood oxygen, weight, any write scope.

**Data handling**
- Only running workouts are imported; other activity types are ignored.
- Data is stored in the user's own account and is never sold, shared with third parties, or used for advertising.
- Access tokens are stored server-side only and are deleted when the user disconnects.
- The user can disconnect at any time from the app, which also removes the imported runs (or keeps them as manual runs if the user chooses), and can delete all their data or their account from Profile.
- All traffic uses HTTPS.

**Uso con IA (confirmar antes de enviar)**
Zancada's coach is an AI assistant (Zonda) that receives a short summary of the user's recent runs to answer questions. Decision pending: either disclose this in the application, or exclude Huawei runs from the coach context the same way Strava runs are excluded (see aiVisibleRuns in app.js).

## Nota
Si Huawei pide una persona jurídica, se necesita la inscripción de la entidad. Hoy el proyecto no la tiene (ver Contabilidad / notas de negocio).
