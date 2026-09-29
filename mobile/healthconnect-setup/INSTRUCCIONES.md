# Health Connect — guía de armado (Android)

Esta carpeta tiene el código para traer entrenamientos desde Health Connect (la API
de Android donde escriben apps como Huawei Health, Samsung Health, y varias más) a
Zancada. Cubre relojes que no tienen una conexión propia por marca en la app (por
ejemplo, Huawei).

**Importante: esto no se puede compilar ni probar desde acá**, mismo motivo que el
widget (ver `../widget-setup/INSTRUCCIONES.md`) — es código nativo (Kotlin) que corre
por fuera del WebView, y hace falta Android Studio con un dispositivo o emulador real
para compilarlo y probarlo. Android Studio funciona en Windows, así que a diferencia
de iOS esto no espera a que consigas una Mac.

## Cómo funciona

`app.js` le pide los ejercicios al plugin `HealthConnectBridge` (código nativo local,
no es un paquete de npm) cuando el usuario toca "Conectar" o "Sincronizar". El plugin
lee las sesiones de running de Health Connect de los últimos 30 días, agrega
distancia/FC por sesión, y se las devuelve a `app.js` en JSON. De ahí en más es
idéntico a cómo se guarda cualquier carrera: se mergea en `state.runs` y se persiste
al servidor — a diferencia de Strava/Polar, acá no hay backend ni OAuth de por medio,
todo el permiso y la lectura pasan en el propio teléfono.

## 1. Prerrequisito: generar el proyecto nativo de Android

Si todavía no lo hiciste (puede que ya lo hayas hecho para el widget), desde la
carpeta `mobile/` de tu compu:

```
npm install
npx cap add android
npx cap sync
```

Esto crea `mobile/android/` (no existe hasta que corras esto).

## 2. Instalar Android Studio y el emulador (o usar tu propio Android)

Descargalo de [developer.android.com/studio](https://developer.android.com/studio).
Al abrirlo por primera vez te va a ofrecer instalar el SDK y (opcional) un emulador.
Para probar Health Connect de verdad conviene un dispositivo Android físico con la
app "Health Connect" instalada (viene preinstalada en Android 14+; en versiones
anteriores se instala gratis desde el Play Store) — el emulador también sirve, pero
tenés que instalarle Health Connect a mano desde el Play Store del emulador.

## 3. Agregar la dependencia de Health Connect

Abrí `mobile/android/app/build.gradle` y agregá esta línea dentro del bloque
`dependencies { ... }` que ya tiene (no reemplaces el bloque entero):

```gradle
implementation "androidx.health.connect:connect-client:1.0.0-alpha11"
```

**Usá exactamente esa versión, no una más nueva.** La 1.1.0 estable exige compileSdk
36+/AGP 8.9+, y la 1.2.0-alpha06 exige compileSdk 37+/AGP 9.1+ — este proyecto usa
compileSdk 34/AGP 8.2.1 (`mobile/android/variables.gradle`), y subir esas versiones
es un cambio mucho más grande que agregar Health Connect. Ya se probó con un build
real: 1.1.0 falla en este proyecto tal cual está armado hoy. Si en algún momento se
sube el compileSdk/AGP por otro motivo, ahí sí conviene resubir esta dependencia
también.

Android Studio te va a pedir sincronizar Gradle apenas guardes el archivo — dejalo.

## 4. Agregar el plugin al proyecto

1. Copiá `android/HealthConnectBridgePlugin.kt` (de esta carpeta `healthconnect-setup/`)
   a `mobile/android/app/src/main/java/org/zancada/app/HealthConnectBridgePlugin.kt`
   (el mismo paquete que `MainActivity` y que `WidgetBridgePlugin.kt` si ya armaste el
   widget). Si cambiaste el `appId` en `capacitor.config.json`, usá ese paquete en vez
   de `org.zancada.app` acá y en el archivo `.kt` mismo (la línea `package ...`).
2. Copiá también `android/PermissionsRationaleActivity.kt` (de esta misma carpeta) al
   mismo lugar, `mobile/android/app/src/main/java/org/zancada/app/`. **Este archivo no
   es opcional** — ver el paso 3 para por qué.
3. Pegá el contenido de `android/AndroidManifest-snippet.xml` (de esta carpeta) en
   `mobile/android/app/src/main/AndroidManifest.xml`, en dos partes distintas del
   manifest (el propio snippet lo indica con comentarios):
   - Los `<uses-permission>` y el `<queries>` van sueltos, directo adentro de
     `<manifest>`, al lado de los que ya tenga la app. Si el manifest ya tiene un
     bloque `<queries>` (por ejemplo, del widget), metele el
     `<package android:name="com.google.android.apps.healthdata" />` ahí adentro en
     vez de duplicar la etiqueta.
   - El bloque `<activity android:name=".PermissionsRationaleActivity">` y el
     `<activity-alias>` que le sigue van DENTRO de `<application>...</application>`,
     junto a la de `MainActivity`. **Sin este bloque, Health Connect falla en
     silencio**: su pantalla de permisos abre y cierra en menos de un segundo sin
     mostrar ningún diálogo, y le devuelve a la app "ningún permiso otorgado" como si
     el usuario hubiera dicho que no — aunque nunca vio nada para aceptar o
     rechazar. Este fue justo el bug reportado la primera vez ("me dice que no le
     di permisos") y costó bastante encontrar porque no tira ningún error visible;
     está documentado en developer.android.com/health-and-fitness/health-connect/
     get-started, sección "Cómo mostrar el diálogo de la política de privacidad de
     tu app".
4. Registrá el plugin en `MainActivity` — ver `android/MainActivity-registro.md` para
   el paso exacto (es una línea, junto a la del widget si ya la tenías).

## 5. Compilar y probar

1. Sincronizá Gradle si todavía no lo hizo solo (ícono del elefante con la flecha, o
   "Sync Now" en el banner amarillo que aparece arriba del editor).
2. Corré la app en tu dispositivo o emulador (▶ verde).
3. Andá a Perfil en la app — debería aparecer la card "Health Connect" (en la web no
   aparece nunca, es la gracia). Tocá "Conectar con Health Connect": el sistema te va
   a mostrar la pantalla de permisos de Health Connect (qué apps pueden leer tus datos
   de ejercicio) — aceptá.
4. Si tenés algún entrenamiento de running registrado en Health Connect (por ejemplo,
   sincronizado desde Huawei Health) de los últimos 30 días, debería aparecer solo en
   Historial después de conectar.

## 6. Si algo no compila

Este código lo escribí contra la documentación oficial de Health Connect
(`developer.android.com/health-and-fitness/health-connect`) pero no lo pude compilar
yo mismo — este entorno no tiene Android SDK. Es esperable que la primera compilación
pida algún ajuste chico (nombre de método distinto entre versiones de la librería,
etc.). Si te tira un error, pasame el mensaje completo y lo arreglo.

## 7. Mantenimiento

Cada vez que cambie `app.js` (por ejemplo, la próxima vez que te pase archivos
actualizados), acordate de correr `npx cap sync` desde `mobile/` antes de recompilar
— el plugin en sí (`HealthConnectBridgePlugin.kt`) no necesita tocarse de nuevo salvo
que quieras cambiar qué datos trae.
