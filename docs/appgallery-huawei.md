# Publicar Zancada en Huawei AppGallery

Escrito el 2026-11-17. Público: sin claves. Las cifras de tamaños y formatos salen de guías de terceros (Huawei no publica una hoja única): **confirmarlas en la consola** al subir.

## Por qué Huawei primero
Para que una persona física pueda abrir los datos de **Huawei Health Service Kit** (carreras de relojes Huawei), la app tiene que estar **publicada en AppGallery** (ver `docs/huawei-health-kit-solicitud.md`). Publicar es el paso 0 de esa solicitud.

## ¿Se puede publicar para obtener el acceso y después quitar la app?
**No lo recomiendo, y no está confirmado que Huawei lo permita.** El acceso a Health Service Kit se aprueba para una app publicada; si se retira, Huawei puede suspender los permisos (sin confirmar: preguntarlo a Huawei Developer Support antes). Además, quienes ya la instalaron quedan sin actualizaciones. Lo más seguro es dejarla publicada, gratis, y mantenerla.

## Qué cambió en el código para Huawei (hecho)
- **GPS sin servicios de Google:** los Huawei nuevos no traen Google Play Services y el plugin de ubicación usaba el servicio de Google, así que no habría registrado el recorrido. Ahora, si el teléfono no tiene servicios de Google, usa el GPS del propio Android (`LocationManager`), con la misma notificación de "Registrando tu carrera". En teléfonos con Google no cambia nada. El cambio es un parche (`mobile/patches/`, se reaplica solo con `npm install`).
- **Probar ese camino en un teléfono con Google:** compilar el APK de **depuración**, instalarlo y crear el archivo `force_nogms` en la carpeta de la app (`adb shell run-as org.zancada.app touch files/force_nogms`). Solo funciona en depuración. Borrarlo para volver al camino normal.
- Ya estaba bien sin cambios: guardado de contraseñas (si no hay servicio de Google responde "no guardada"), Health Connect (avisa que no está disponible), mapas (Mapbox), ingreso con correo y contraseña, y con Google (se hace por navegador).

## Limitaciones conocidas en Huawei (sin servicios de Google)
| Función | Estado en Huawei |
|---|---|
| Recordatorios y avisos push | **No llegan** (usan Firebase, que es de Google). Hace falta **Huawei Push Kit**: trabajo aparte. |
| Health Connect | No existe en Huawei: esa tarjeta no sirve. Las carreras vendrán por **Huawei Health Service Kit** cuando Huawei lo apruebe. |
| Compra / suscripción | Google Play Billing no existe: el cobro necesita **Huawei IAP**. Por ahora sale gratis. |
| Ingreso con Google | Funciona por el navegador del teléfono. |
| Voz del coach (TTS) | Depende del motor de voz del teléfono; probar. |

## Antes de subir
1. **Cuenta de desarrollador (la hacés vos, con tu identidad):** entrar a developer.huawei.com, crear un HUAWEI ID, registrarse como **Individual** y completar la verificación de identidad (DNI, nombre real y una tarjeta). Puede tardar unos días. Sin verificar no se puede publicar ni pedir Health Service Kit.
2. **Crear el proyecto y la app** en AppGallery Connect: nombre `Zancada`, paquete `org.zancada.app`, plataforma Android.
3. Países donde se publica y precio: **gratis**.

## Paquete
- Se puede subir **APK** (firmado con nuestra clave de subida) o **AAB** (necesita activar App Signing de Huawei). Recomendado: **APK**, más simple.
- Archivos generados: `mobile/android/app/build/outputs/apk/release/app-release.apk` y `.../bundle/release/app-release.aab`.
- `versionCode` hay que subirlo en cada envío a la tienda (hoy 1).

## Ficha
- **Icono:** 216×216 PNG, ya está en `brand/icon-appgallery-216.png`.
- **Capturas:** mínimo 3 de teléfono (pendiente: se sacan con una cuenta de prueba con datos ficticios).
- **Textos:** usar los de `docs/play-store-listing.md`, **quitando** la mención a Health Connect y a "plan de pago / suscripción" (por ahora gratis).
- **Política de privacidad:** `https://www.zancada.org/privacy.html`. **Borrar cuenta:** `https://www.zancada.org/eliminar-cuenta.html`. **Contacto:** `info@zancada.org`.
- **Edad:** 16+. Categoría: Salud y fitness / Deportes.
- Cuestionario de contenido y de datos: usar `docs/tiendas-formularios-privacidad.md`.

## Después de publicar
1. Pedir **Health Service Kit** (nivel básico) con `docs/huawei-health-kit-solicitud.md`.
2. Hacer **Huawei Push Kit** para los recordatorios.
3. Cuando haya cobro: **Huawei IAP** (o decidir que Huawei queda gratis).
4. Una persona con un Huawei real tiene que probar el GPS y la notificación durante una carrera: es lo único que no pude verificar sin un equipo.
