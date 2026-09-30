# Zancada — envoltorio nativo (Capacitor)

Esta carpeta vive fuera del repo de Git (ver `.gitignore` en la raíz) a propósito:
el proyecto nativo generado por Capacitor (`ios/`, `android/`) es código pesado y
en buena parte auto-generado, con su propio ciclo de vida (firmas, certificados,
versiones de Xcode/Android Studio) que no tiene sentido versionar junto al sitio
web. `mobile/www/` es una copia sincronizada a mano de `index.html`/`app.js`/
`locales/` — se actualiza corriendo `npx cap sync` desde acá cada vez que esos
archivos cambian en la raíz del repo.

**Bundle ID / Application ID: `org.zancada.app`** — sugerido, no definitivo. Si lo
cambiás, actualizalo en `capacitor.config.json` (`appId`) y en cualquier lugar de
`healthconnect-setup/` que lo mencione (son varios archivos, buscá
"org.zancada.app" en esa carpeta).

## Primer armado

```
cd mobile
npm install
npx cap add ios       # necesita una Mac con Xcode instalado
npx cap add android    # funciona con Android Studio en cualquier sistema operativo
npx cap sync
```

Esto genera `mobile/ios/` y `mobile/android/` (no existen hasta que corras esto).

## Funcionalidad nativa ya armada (código escrito, falta compilar/integrar)

- **`healthconnect-setup/`** — trae los entrenamientos registrados en Health
  Connect (Android) a Zancada, para relojes que no tienen conexión directa
  propia (ej. Huawei, o cualquier otro que escriba en Health Connect). Ver
  `healthconnect-setup/INSTRUCCIONES.md`.
- **`push-setup/`** — notificaciones push nativas (el recordatorio diario de
  "Hoy toca: ...") para la app instalada desde la tienda, donde el service
  worker de la PWA web está desactivado a propósito. Ver
  `push-setup/INSTRUCCIONES.md`.
- **Tracking en segundo plano (Android)** — `@capacitor-community/background-geolocation`
  (en `package.json`, tracked). A diferencia de los dos ítems de arriba, este no
  tiene una carpeta `-setup/` propia porque no hay código nativo escrito a mano,
  es solo el plugin + `capacitor.config.json` (`android.useLegacyBridge: true`,
  ya tracked) + dos strings en
  `android/app/src/main/res/values/strings.xml` que SÍ viven dentro de
  `mobile/android/` (no tracked) y se pierden si esa carpeta se borra y se
  regenera con `npx cap add android`:
  ```xml
  <string name="capacitor_background_geolocation_notification_channel_name">Seguimiento de carrera</string>
  <string name="capacitor_background_geolocation_notification_color">#D6FF3F</string>
  ```
  Sin esto el tracking en segundo plano sigue funcionando igual (son solo el
  nombre del canal de notificación y su color) -- sólo se pierde la marca.
  `npx cap sync android` solo, sin recompilar, alcanza para que el plugin quede
  registrado si `mobile/android/` ya existe.

## Cada vez que cambia el código web

```
cd mobile
npx cap sync
```

Después recompilar desde Xcode/Android Studio como siempre.

## Íconos y splash

`resources/icon.png` es la fuente (1024×1024, el logo real de Zancada -- copiado
de `icon-appstore-1024.png` en la raíz del proyecto padre). Para regenerar los
íconos y splash de Android a partir de ahí:

```
cd mobile
npx capacitor-assets generate --android --splashBackgroundColor '#0A0A0A' --splashBackgroundColorDark '#0A0A0A'
```

El fondo del splash se fuerza a `#0A0A0A` (mismo `--asphalt` que usa la app) a
propósito -- sin esos flags, `@capacitor/assets` usa blanco por default, lo que
se ve como un cuadrado oscuro flotando en una pantalla blanca en vez de una
transición continua.

Esto NO necesita Xcode ni Android Studio, solo Node -- se puede correr en
cualquier momento que cambie el logo, sin depender de tener una Mac a mano.
Para iOS hace falta primero `npx cap add ios` (ver "Primer armado" arriba,
necesita Mac) y después agregar `--ios` al comando de arriba.

Si `resources/icon.png` queda desactualizado respecto al logo real, reemplazalo
por el archivo actual y volvé a correr el comando -- no hay nada más que tocar
a mano en `android/app/src/main/res/`, `capacitor-assets` pisa todo lo que
genera.
