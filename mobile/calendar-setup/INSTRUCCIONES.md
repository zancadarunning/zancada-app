# Calendario del teléfono — guía de armado

Con esto, el botón **"Agregar a mi calendario"** de Plan funciona igual que en Huawei
Health: un toque, el sistema pide permiso de calendario una sola vez, y aparece un
calendario **"Zancada"** con los entrenamientos de esta semana y la próxima. Se actualiza
solo cada vez que cambia el plan (coach, sesión hecha/salteada, cambio de semana), y al
tocar el botón de nuevo ("En tu calendario ✓" → Quitar), al cerrar sesión o al borrar los
datos, se borra el calendario entero con todos sus eventos.

El código JS ya está en `app.js` (buscá `syncDeviceCalendar`). Usa el plugin de npm
`@ebarooni/capacitor-calendar` (ya agregado a `mobile/package.json`) — no hay código nativo
escrito a mano. Si la app se compila SIN este plugin, el botón sigue funcionando como antes
(enlace de suscripción / archivo .ics), así que no rompe nada.

## 1. Instalar y sincronizar

```
cd mobile
npm install
npx cap sync
```

## 2. Android: permisos en el manifest

En `mobile/android/app/src/main/AndroidManifest.xml`, adentro de `<manifest>` (al lado de
los otros `<uses-permission>`):

```xml
<uses-permission android:name="android.permission.READ_CALENDAR" />
<uses-permission android:name="android.permission.WRITE_CALENDAR" />
```

`READ_CALENDAR` hace falta para detectar si el usuario borró el calendario "Zancada" a mano
(y volver a crearlo). Compilá y probá: Plan → "Agregar a mi calendario" → aceptar permiso →
abrí Google Calendar: tiene que aparecer el calendario "Zancada" (verde lima) con las
sesiones como eventos de todo el día.

## 3. iOS (cuando exista el build nativo)

En `mobile/ios/App/App/Info.plist`:

```xml
<key>NSCalendarsUsageDescription</key>
<string>Zancada agrega tus entrenamientos a tu calendario.</string>
<key>NSCalendarsFullAccessUsageDescription</key>
<string>Zancada agrega tus entrenamientos a tu calendario y los mantiene actualizados.</string>
```

Se pide acceso completo (no "solo escritura") porque para actualizar y borrar los eventos
que creamos hace falta poder verlos.

## Nota

Los eventos de semanas ya pasadas quedan en el calendario como registro (no se tocan más);
solo se borran al quitar el calendario entero.

## Si algo no compila

El plugin está escrito en Kotlin (igual que Health Connect, así que el proyecto ya tiene
Kotlin configurado) y usa el `compileSdkVersion`/`minSdkVersion` de
`mobile/android/variables.gradle`. Si Gradle se queja de la versión de Kotlin o de AGP,
pasame el error completo y lo ajusto.
