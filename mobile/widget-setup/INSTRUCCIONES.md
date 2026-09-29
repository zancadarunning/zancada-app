# Widget de pantalla de inicio — guía de armado

Esta carpeta tiene el código para un widget de "próxima sesión" en la pantalla de
inicio del celular (iOS y Android). Muestra el tipo de entrenamiento de hoy y la
distancia o el tiempo (según elijas entrenar por km o por minutos en Perfil), tal
como aparece arriba de todo en la pestaña Inicio de la app.

**Importante: esto no se puede compilar ni probar desde acá.** Un widget de pantalla
de inicio es código nativo de verdad (Swift para iOS, Kotlin para Android) que corre
por fuera del WebView de la app — no es algo que se pueda armar solo con HTML/JS como
el resto de Zancada. Lo que dejé en esta carpeta es el código ya escrito y probado en
cuanto a lógica, más estos pasos para integrarlo — pero compilarlo, firmarlo y
probarlo en un dispositivo o simulador lo tenés que hacer vos, con Xcode (para iOS,
necesita una Mac) y/o Android Studio (para Android, funciona en cualquier sistema).

## Cómo funciona (por qué no es "en vivo")

El widget no puede ejecutar el JavaScript de la app — es una vista completamente
aparte. Lo que hicimos es: cada vez que abrís la pestaña Inicio, `app.js` le pasa a
un plugin nativo chiquito (`WidgetBridge`, que armamos especialmente para esto) un
resumen de la sesión de hoy — tipo de entrenamiento, distancia o tiempo, y zona. Ese
plugin lo guarda en un lugar que el sistema operativo comparte entre la app y el
widget (un "App Group" en iOS, un `SharedPreferences` común en Android), y le avisa
al widget que se redibuje. Si no abrís la app en más de 3 días, el widget deja de
mostrar esa sesión (podría estar desactualizada) y en su lugar te invita a abrir la
app.

## 1. Prerrequisito: generar los proyectos nativos

Si todavía no lo hiciste, desde la carpeta `mobile/` de tu compu:

```
npm install
npx cap add ios       # necesita una Mac con Xcode instalado
npx cap add android    # funciona con Android Studio en cualquier sistema
npx cap sync
```

Esto crea las carpetas `mobile/ios/` y `mobile/android/`, que hoy no existen (por
eso el código del widget está acá en `widget-setup/` y no directamente adentro de
esas carpetas — no puedo generarlas yo, porque `cap add ios` necesita una Mac real y
`cap add android` necesita el SDK de Android, y este sandbox no tiene ninguno de
los dos).

## 2. Armar el widget de iOS

Abrí `mobile/ios/App.xcworkspace` en Xcode (`npx cap open ios` lo hace por vos).

1. **Agregá el plugin local a la app**: arrastrá `ios/WidgetBridgePlugin.swift` y
   `ios/MainViewController.swift` (los dos están en esta carpeta `widget-setup/`,
   no confundir con `mobile/ios/`) al target **App** en Xcode (clic derecho en el
   grupo "App" → Add Files to "App"...).
2. **Conectá `MainViewController`**: abrí `App/Base.lproj/Main.storyboard`,
   seleccioná el View Controller (el único que hay), abrí el Identity Inspector
   (ícono de tarjetita, en el panel derecho) y cambiá "Custom Class" de
   `CAPBridgeViewController` a `MainViewController`.
3. **Creá la extensión de widget**: File → New → Target... → buscá "Widget
   Extension" → nombrala `ZancadaWidget`. Cuando te pregunte, NO actives
   "Include Configuration Intent".
4. Xcode va a crear un archivo con contenido de ejemplo dentro de la carpeta
   `ZancadaWidget/` (nueva, del target que acabás de crear). Borrá todo su
   contenido y pegá el de `ios/ZancadaWidget.swift` (de esta carpeta
   `widget-setup/`) en su lugar.
5. **Habilitá App Groups en LOS DOS targets** (App y ZancadaWidget): seleccioná
   cada target → pestaña "Signing & Capabilities" → "+ Capability" → "App Groups"
   → creá uno nuevo con el ID `group.org.zancada.app` (tiene que ser IDÉNTICO en
   los dos targets, y coincidir con la constante `appGroupId` /
   `zancadaAppGroupId` que ya está en el código). Si más adelante cambiás el
   Bundle ID de la app (hoy es `org.zancada.app`, marcado como "sugerido, no
   definitivo" en `mobile/README.md`), actualizá también este App Group ID en
   los dos archivos Swift.
6. Elegí tu Team de Apple Developer en "Signing & Capabilities" de los dos
   targets (App y ZancadaWidget) para que compile.
7. Compilá y corré en un simulador o dispositivo. Para agregar el widget:
   mantené presionada la pantalla de inicio → "+" (arriba a la izquierda) →
   buscá "Zancada" → elegí el tamaño chico o mediano → Agregar Widget.

## 3. Armar el widget de Android

Abrí `mobile/android/` en Android Studio (`npx cap open android` lo hace por vos).

1. Copiá `android/WidgetBridgePlugin.kt` y `android/ZancadaWidgetProvider.kt` (de
   esta carpeta `widget-setup/`) a
   `mobile/android/app/src/main/java/org/zancada/app/` (el mismo paquete que
   `MainActivity`). Si cambiaste el `appId` en `capacitor.config.json`, usá ese
   paquete en vez de `org.zancada.app` en la carpeta de destino y en la línea
   `package ...` de los dos archivos .kt.
2. Copiá `android/zancada_widget.xml` a
   `mobile/android/app/src/main/res/layout/zancada_widget.xml`.
3. Copiá `android/widget_card_bg.xml`, `android/widget_zone_dot.xml` y
   `android/widget_hoy_pill.xml` (de esta carpeta) a
   `mobile/android/app/src/main/res/drawable/` (puede que la carpeta
   `res/drawable/` no exista todavía — creála). Son la card de fondo, el
   puntito de color de zona, y el chip detrás de la etiqueta HOY que usa
   el layout de arriba — **sin estos tres archivos el widget no compila**,
   `zancada_widget.xml` los referencia por nombre.
4. Copiá `android/zancada_widget_info.xml` a
   `mobile/android/app/src/main/res/xml/zancada_widget_info.xml` (puede que la
   carpeta `res/xml/` no exista todavía — creála).
5. Pegá el contenido de `android/AndroidManifest-snippet.xml` DENTRO de la
   etiqueta `<application>` de
   `mobile/android/app/src/main/AndroidManifest.xml` (no reemplaces el manifest
   entero, solo agregá ese bloque `<receiver>`).
6. Registrá el plugin en `MainActivity` — ver `android/MainActivity-registro.md`
   para el paso exacto (es una línea).
7. Sincronizá Gradle (Android Studio te lo va a ofrecer solo al detectar los
   archivos nuevos) y corré la app en un emulador o dispositivo. Para agregar el
   widget: mantené presionada la pantalla de inicio → Widgets → buscá "Zancada" →
   arrastralo a la pantalla.

**Sobre el diseño:** inspirado en cómo arman sus widgets nativos Apple Fitness
y Nike Run Club (Last Run) — el número es el elemento con más peso visual de
la card, no una leyenda chica al pie. `ZancadaWidgetProvider.kt` arma el
texto de distancia/tiempo como un `SpannableString` (`RelativeSizeSpan` +
`StyleSpan` + `ForegroundColorSpan`) para que la cifra salga grande/negrita/
clara y la unidad ("km"/"min") chica y gris, las dos en la MISMA `TextView`
— es la única forma de mezclar dos tamaños en una línea en RemoteViews, no
hay manera de hacerlo solo con atributos XML. Ese número usa
`fontFamily="sans-serif-black"` (no monoespaciada): a este tamaño una
tipografía "black" tiene mucha más presencia que una monoespaciada, que se
ve más angosta/técnica al lado.

El fondo (`widget_card_bg.xml`) es un "mesh gradient" con sombra propia en
capas (`layer-list`): un óvalo oscuro difuso apoyado debajo del borde
inferior (la card está insetBottom para dejarle lugar), un negro casi puro
tipo `--ink`/`--asphalt` de index.html (no un gris carbón genérico) con DOS
resplandores lima apilados arriba a la derecha a distinto radio para que la
caída se sienta gradual en vez de un anillo brusco, y sin ningún borde/
stroke: borde + sombra juntos es justo el combo "card de IA genérica" que
hay que evitar, así que la propia sombra y el contraste del degradé contra
el fondo hacen de borde. La etiqueta "HOY" tiene un fondo tipo chip
(`widget_hoy_pill.xml`, lima al ~15% de opacidad) en vez de texto suelto —
mismo lenguaje que ya usan los tags/badges del resto de la app (ej.
"NATIVO"/"CONECTADO" en Relojes).

El widget NO tiene ningún ícono de marca (se sacó por pedido explícito): la
identidad de Zancada queda en el color lima del texto y del resplandor del
fondo, no en un logo compitiendo con el dato. Tiene además un punto de
color por zona (mismos 5 colores que `ZONE_COLORS` en `app.js`) al lado del
tipo de sesión. Si alguna vez agregás un elemento nuevo al layout, usá solo
clases que RemoteViews sabe inflar (`TextView`, `ImageView`, `FrameLayout`,
`LinearLayout`, etc.) — un `<View>` genérico rompe el widget en tiempo de
ejecución con "Error inflating class android.view.View" (pasó una vez
armando el punto de zona; el layout de esta
carpeta ya usa `ImageView` en su lugar).

**Sobre el tamaño de la card:** si en algún momento vuelve a sentirse
desproporcionado (mucho espacio vacío arriba/abajo del texto), no confíes
en `minHeight`/`targetCellHeight` de `zancada_widget_info.xml` para
arreglarlo solo — probado en un dispositivo real (Moto E6 Plus, launcher de
Motorola) que ese launcher ignora esos valores por completo, tanto al
agregar el widget de cero como después de sacarlo y volver a agregarlo. El
tamaño final de la card lo decide el launcher de cada usuario, así que el
único control real y confiable es agrandar el texto (`textSize` en el
layout, factor del `RelativeSizeSpan` del número hero en el provider) para
que el contenido llene la card con autoridad sea cual sea el tamaño que le
toque.

## 4. Mantenimiento

Cada vez que cambie `app.js` (por ejemplo, la próxima vez que te pase archivos
actualizados), acordate de correr de nuevo `npx cap sync` desde `mobile/` antes de
recompilar, igual que ya hacías para el resto de la app — el widget en sí (los
archivos Swift/Kotlin) no necesita tocarse de nuevo salvo que quieras cambiarle el
diseño o qué información muestra.
