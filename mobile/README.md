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
`widget-setup/` o `healthconnect-setup/` que lo mencione (son varios archivos,
buscá "org.zancada.app" en esas carpetas).

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

- **`widget-setup/`** — widget de "próxima sesión" para la pantalla de inicio
  (iOS y Android). Ver `widget-setup/INSTRUCCIONES.md`.
- **`healthconnect-setup/`** — trae los entrenamientos registrados en Health
  Connect (Android) a Zancada, para relojes que no tienen conexión directa
  propia (ej. Huawei, o cualquier otro que escriba en Health Connect). Ver
  `healthconnect-setup/INSTRUCCIONES.md`.

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
