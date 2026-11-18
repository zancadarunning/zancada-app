# Conexión con Huawei Health Kit (relojes y pulseras Huawei)

Estado: **programada y apagada** (2026-11-18). Se activa cuando Huawei aprueba la solicitud de Health Service Kit (enviada el 2026-11-18, revisión de unos 10 días hábiles).

## Cómo funciona
- Es una conexión **por servidor** (Server-to-Server, API REST de Health Kit): la persona inicia sesión con su cuenta de Huawei (HUAWEI ID) y Zancada le pide las carreras a la nube de Huawei. Sirve en **cualquier celular** (Android, iPhone o la web); no hace falta un teléfono Huawei ni publicar la app en AppGallery.
- Archivos: `api/huawei-init.js` (state firmado), `api/huawei-auth.js` (callback OAuth y primera importación de 30 días), `api/huawei-sync-now.js` (sincronizar a pedido, últimas 2 semanas), `api/huawei-disconnect.js` (revoca el permiso y borra lo importado), `api/_lib/huawei-activity-helpers.js` (protocolo, conversión de carreras, renovación del token).
- Las carreras de Huawei **no llegan a Zonda** ni a ninguna IA (igual que Garmin, Wahoo y Polar): `AI_RESTRICTED_SOURCES` en `app.js`, `RESTRICTED_SOURCES` en `notify-new-run.js` y `weekly-summary.js`, y la sección 4 de la política de privacidad.
- Esta primera versión trae solo el **resumen** de cada carrera (distancia, duración, FC promedio y máxima, fecha local). **No trae la ruta GPS ni los parciales**, y **no manda entrenamientos al reloj**: Huawei no documenta una API REST para eso (se pidió el permiso "Schedule and Task Data" en la solicitud, pero no hay endpoint conocido).

## Para activarla (cuando Huawei apruebe)
1. **Hecho el 2026-11-18:** `sql/create_huawei_connections.sql` y `sql/merge_huawei_runs.sql` ya están corridos en Supabase (tabla con RLS, sin lectura de tokens desde el navegador, función solo para el servidor).
2. En Vercel cargar `HUAWEI_CLIENT_ID` (el "ID de la aplicación" del producto de servidor en HUAWEI ID), `HUAWEI_CLIENT_SECRET` (su secreto) y `HUAWEI_STATE_SECRET` (texto largo al azar, nuevo).
3. Verificar en Huawei Developers que la callback declarada sea `https://zancada.org/api/huawei-auth` y la URL de confianza `https://zancada.org`.
4. En `app.js` poner `HUAWEI_ENABLED = true`, publicar y probar con una cuenta de Huawei real con una carrera (el modo de prueba admite hasta 100 usuarios). Cuando funcione, tocar "Verify" en la tarjeta de Health Service Kit de la consola de Huawei para sacar el límite.
5. Si los permisos aprobados no incluyen alguno de los de `HUAWEI_SCOPES` en `app.js`, la autorización falla: ajustar esa lista a lo que Huawei aprobó.

## Sin verificar (se confirma con la primera cuenta de prueba)
- Nombres de los campos de frecuencia cardíaca y calorías dentro de `activitySummary.dataSummary` (se leen de forma defensiva; si faltan, la carrera se importa sin ese dato).
- Los permisos de lectura de historial (`historydata.open`) y de actividad (`activityrecord.read`): salen de guías no oficiales de Huawei.
- Ruta GPS y parciales (endpoint de muestras detalladas).
- Sincronización automática periódica (cron) y avisos por webhook: hoy solo se sincroniza al conectar y con "Sincronizar ahora".

## Fuentes oficiales (leídas el 2026-11-18)
- Autorización y renovación del token: https://developer.huawei.com/consumer/en/doc/HMSCore-Guides/auth-example-0000001054581058
- Listar carreras: https://developer.huawei.com/consumer/en/doc/HMSCore-References/activityrecords_list-0000001050114862
- Tipos de ejercicio y de datos: https://developer.huawei.com/consumer/en/doc/HMSCore-Guides/introduction-fitness-record-data-0000001131831088
- Cancelar la autorización: https://developer.huawei.com/consumer/en/doc/HMSCore-References/cancel-scopes-0000001059462192
