# Notificaciones push nativas — guía de armado (Android)

Esta carpeta tiene lo que hace falta para que el recordatorio diario ("Hoy toca: Rodaje
suave · 8km") llegue de verdad a la app instalada desde la tienda, no solo a la web.

**Por qué hacía falta esto.** El service worker (lo que hace andar las notificaciones push
en la PWA web) está desactivado a propósito dentro del wrapper nativo — ver el comentario en
`app.js`, junto al registro del SW: "adentro del wrapper nativo no tiene sentido, ahí las
actualizaciones llegan por la tienda, no por la red". Consecuencia real: activar el toggle
de notificaciones desde la app instalada no hacía nada, aunque el toggle mismo se viera
igual que en la web.

**Importante: esto no se puede compilar ni probar desde acá**, mismo motivo que
`../healthconnect-setup/` y `../widget-setup/` — hace falta Android Studio con un
dispositivo o emulador real. Android Studio funciona en Windows, así que a diferencia de
iOS esto no espera a que consigas una Mac (iOS queda fuera de esta guía por ahora, por el
mismo motivo que el resto de la app nativa: necesita Xcode).

## Cómo funciona

1. `app.js` (código ya escrito, ver `enableNativePushNotifications`/
   `initNativePushListeners` cerca de donde estaba el registro del service worker) le pide
   permiso al plugin oficial de Capacitor `PushNotifications` y se registra contra Firebase
   Cloud Messaging (FCM) — a diferencia de `HealthConnectBridge`/`WidgetBridge`, este plugin
   **sí es un paquete de npm** (`@capacitor/push-notifications`), no hay que escribir Kotlin
   a mano.
2. El token de FCM que devuelve el registro se guarda en la misma tabla `push_subscriptions`
   que ya usa la web (una columna nueva, `platform`, distingue `'web'` de `'android'`/`'ios'`
   — ver `sql/push_subscriptions_add_platform.sql`, correlo en el SQL Editor de Supabase si
   todavía no lo hiciste).
3. El cron `api/send-reminders.js` (ya actualizado) manda por Web Push como siempre a las
   filas `platform:'web'`, y por Firebase Admin (`api/_lib/fcm.js`, código nuevo) a las
   filas `platform:'android'`/`'ios'`.

## 1. Prerrequisito: generar el proyecto nativo de Android

Si todavía no lo hiciste (puede que ya lo hayas hecho para el widget o Health Connect),
desde la carpeta `mobile/` de tu compu:

```
npm install
npx cap add android
npx cap sync
```

## 2. Crear el proyecto de Firebase

1. Andá a [console.firebase.google.com](https://console.firebase.google.com) y creá un
   proyecto nuevo (cualquier nombre, por ejemplo "Zancada").
2. Adentro del proyecto, "Agregar app" → Android. Como nombre de paquete usá
   **exactamente** el `appId` de `capacitor.config.json` (`org.zancada.app`, salvo que lo
   hayas cambiado).
3. Firebase te va a ofrecer descargar `google-services.json` — descargalo y copialo a
   `mobile/android/app/google-services.json` (al lado de `build.gradle`, no en cualquier
   otro `app/`).
4. No hace falta agregar el SDK de Firebase a mano ni seguir el resto del asistente de
   Firebase (eso es para cuando se integra el SDK de cliente directo) — el plugin de
   Capacitor ya trae lo necesario, solo hace falta el archivo de configuración.

## 3. Agregar el plugin y el plugin de Gradle de Google Services

Desde `mobile/`:

```
npm install @capacitor/push-notifications
npx cap sync
```

Después, dos cambios chicos en los archivos de Gradle que Capacitor ya generó:

**`mobile/android/build.gradle`** (el de la RAÍZ del proyecto, no el de `app/`) — agregá esta
línea dentro del bloque `dependencies` de `buildscript { ... }` que ya tiene:

```gradle
classpath 'com.google.gms:google-services:4.4.2'
```

**`mobile/android/app/build.gradle`** — agregá esta línea AL FINAL del archivo (fuera de
cualquier bloque `{ }`):

```gradle
apply plugin: 'com.google.gms.google-services'
```

Android Studio te va a pedir sincronizar Gradle apenas guardes — dejalo.

## 4. Generar las credenciales para que el SERVIDOR pueda mandar los avisos

Esto es aparte del `google-services.json` de arriba (ese es para que el TELÉFONO reciba
avisos; esto es para que Vercel pueda *mandarlos*):

1. En la consola de Firebase: ícono de engranaje → **Configuración del proyecto** →
   pestaña **Cuentas de servicio**.
2. Botón **Generar nueva clave privada** — descarga un archivo `.json`.
3. Abrí ese archivo, copiá TODO su contenido (el JSON completo, con las llaves `{ }`).
4. En Vercel → tu proyecto → Settings → Environment Variables, creá una variable
   `FIREBASE_SERVICE_ACCOUNT_JSON` y pegá ahí ese JSON completo como valor (todo en una
   sola variable, no hace falta escaparlo a mano — Vercel lo guarda como texto tal cual).
5. Guardá el archivo `.json` descargado en algún lugar seguro fuera del repo (no lo subas a
   Git ni lo compartas) y podés borrarlo de tus Descargas después de cargarlo en Vercel.

## 5. Correr la migración de base de datos

Si todavía no lo hiciste: pegá el contenido de `sql/push_subscriptions_add_platform.sql`
(en la raíz del repo, no en esta carpeta) en el SQL Editor de Supabase y ejecutalo. Agrega
la columna `platform` a la tabla que ya existe — es seguro correrlo aunque ya lo hayas hecho
antes.

## 6. Compilar y probar

1. Sincronizá Gradle si todavía no lo hizo solo.
2. Corré la app en tu dispositivo o emulador (▶ verde). Un emulador sin Google Play Services
   instalado NO puede recibir push de verdad — para probar esto de punta a punta conviene un
   Android físico, o un emulador de los que Android Studio marca con el ícono de Play Store.
3. Andá a Perfil → activá el toggle de notificaciones. Te va a pedir el permiso del sistema
   (Android 13+ lo pide en tiempo real, versiones más viejas lo dan por otorgado solo).
4. Confirmá en Supabase que apareció una fila en `push_subscriptions` para tu usuario con
   `platform` en `'android'` y `subscription` con un `token` adentro.
5. Para probar el envío real sin esperar a las 8am de tu huso horario, podés llamar a mano
   al cron desde una terminal (reemplazá `TU_CRON_SECRET` por el valor real de la variable
   de entorno `CRON_SECRET` en Vercel):
   ```
   curl -X POST https://zancada.org/api/send-reminders -H "Authorization: Bearer TU_CRON_SECRET"
   ```
   Ojo: el cron solo manda si hoy tenés una sesión planeada (no descanso) y son las 8am en
   tu huso horario guardado — si querés forzarlo para probar, lo más simple es cambiar
   `REMINDER_HOUR` en `api/send-reminders.js` a la hora actual, probar, y volverlo a `8`
   después (no hace falta redeployar dos veces si lo cambiás y probás en la misma sesión de
   trabajo con el equipo).

## 7. Si algo no compila

Este código lo escribí contra la documentación oficial de `@capacitor/push-notifications` y
de Firebase Admin, pero no lo pude compilar yo mismo — este entorno no tiene Android SDK ni
un proyecto de Firebase real para probar contra él. Es esperable que la primera compilación
o el primer envío real pidan algún ajuste chico. Si te tira un error, pasame el mensaje
completo (o el log de Vercel si el error es en el envío, no en la compilación) y lo arreglo.

## 8. iOS

Queda pendiente — necesita Xcode (Mac) para generar `mobile/ios/` y el proyecto en sí, más
un certificado APNs desde tu cuenta de Apple Developer. El mismo backend (`api/_lib/fcm.js`)
ya sirve para iOS también (Firebase Admin manda por FCM, que a su vez le habla a APNs por
vos) — cuando tengas la Mac, la parte del servidor no hay que tocarla de nuevo, solo agregar
la plataforma iOS en Capacitor y subir el certificado APNs a Firebase.

## 9. Mantenimiento

Cada vez que cambie `app.js` (por ejemplo, la próxima vez que te pase archivos
actualizados), acordate de correr `npx cap sync` desde `mobile/` antes de recompilar.
