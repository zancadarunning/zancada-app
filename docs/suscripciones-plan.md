# Cobro por suscripción: plan de trabajo

Escrito el 2026-11-10. Público: sin claves. Decisión del dueño: **9,99 USD por mes o 79,99 USD por año, con 14 días de prueba gratis**, cobrados por Google Play y la App Store. Android usa **Health Connect**; iPhone usará **Apple Salud (HealthKit)**. Los Términos (sección 15 y 19) ya cubren prueba, renovación, cancelación, reembolsos y las reglas de cada tienda; no hace falta tocarlos para este precio, porque dicen que el precio lo informa la tienda.

## Qué hay hecho y qué falta

| Pieza | Estado |
|---|---|
| Términos de suscripción (sección 15) y de iOS/Android (sección 19) | Hechos, en 6 idiomas |
| Tabla `entitlements` (quién paga y hasta cuándo, solo la escribe el servidor) | Hecha (`sql/entitlements.sql`) |
| `api/entitlement.js` (la app lee su plan) | Hecho; mientras la tabla esté vacía todas las cuentas son "free" |
| **Comprar dentro de la app (Google Play Billing / StoreKit)** | **No existe** |
| **Pantalla de suscripción (paywall)** | **No existe** |
| **Aviso de las tiendas al servidor (renovó, canceló, reembolsó)** | **No existe**: nada escribe en `entitlements` |
| Qué es gratis y qué es Pro | **Sin decidir** (ver abajo) |

## Decisiones del dueño (2026-11-10)

1. **Al terminar los 14 días gratis se bloquea todo** hasta suscribirse (coincide con la sección 15 de los Términos).
2. **Las cuentas que ya existen reciben la suscripción de regalo.** Se marcan en `entitlements` como plan Pro con origen `manual`, sin pasar por las tiendas. Falta confirmar si el regalo es **sin vencimiento** o por un tiempo (se asume sin vencimiento).

## Cómo construirlo (recomendado)

1. **RevenueCat** como puente con las dos tiendas: un solo SDK para Android e iPhone, valida los recibos, sabe si el usuario ya usó la prueba, restaura compras y avisa a nuestro servidor por webhook. Alternativa sin intermediario: Play Billing + StoreKit 2 + validación propia (más código y más riesgo de errores de cobro). Verificar el costo vigente de RevenueCat antes de elegir.
2. **Productos** (los crea el dueño en cada consola): grupo "Zancada Pro" con `zancada_pro_monthly` (9,99 USD) y `zancada_pro_yearly` (79,99 USD); oferta de prueba gratis de 14 días en los dos.
3. **`api/revenuecat-webhook.js`**: valida un secreto en el encabezado, y hace `upsert` en `entitlements` (plan, estado, fechas, tienda). La app nunca decide sola si alguien pagó. Pasa por la lista de `docs/checklist-cambios-seguros.md` (endpoint con secreto, sin datos personales en logs, pruebas).
4. **Pantalla de suscripción** en la app: precio y período tomados de la tienda (no escritos a mano), texto de la prueba, botón **"Restaurar compras"** (Apple lo exige), enlaces a Términos y Privacidad, cómo cancelar.
5. **Control de acceso** leyendo `api/entitlement.js`, con un margen de gracia si falla el pago.
6. **Borrar la cuenta con suscripción activa**: avisar que la tienda sigue cobrando hasta que la cancele (los Términos ya lo dicen; falta el aviso en la pantalla).
7. **Pruebas**: testers de licencia en Play Console y cuentas "sandbox" de Apple; probar compra, renovación, cancelación, reembolso y restaurar en un teléfono real.

Necesita: cuenta de Play Console (ya prevista), **cuenta de Apple Developer (99 USD por año)**, y un Mac con Xcode o un servicio de compilación en la nube para iPhone (no hay Mac hoy).

## Lo que cambia entre tiendas

| Tema | Google Play | App Store |
|---|---|---|
| Cobro dentro de la app | Obligatorio usar Play Billing para contenido digital | Obligatorio usar compras dentro de la app |
| Comisión (verificar vigente) | Suscripciones: 15% | 30% el primer año de cada suscriptor y 15% después, o 15% si entrás al **Programa para pequeños desarrolladores** (inscripción aparte) |
| Información previa a la compra | Precio, período, renovación y cómo cancelar a la vista | Igual, y además enlaces a Términos (EULA) y Privacidad en la ficha y en la app |
| Restaurar compras | Se hace solo con la cuenta de Google | **Botón obligatorio** |
| Cancelar | Play Store → Suscripciones | Ajustes → Apple ID → Suscripciones |
| Prueba gratis | Por cuenta de Google | Una vez por grupo de suscripción y cuenta de Apple |
| Cobrar por fuera de la tienda | Prohibido dentro de la app para contenido digital | Prohibido enlazar a pagos externos dentro de la app (hay excepciones por país; verificar) |
| Datos de salud | Health Connect: declarar cada permiso y su política | HealthKit: texto de propósito por permiso; **no** usar datos de salud para publicidad ni minería de datos; no guardarlos en iCloud; avisar y pedir permiso antes de mandarlos a una IA de terceros (ya está en el consentimiento) |

Como la web pasa a ser solo una página de presentación (la PWA se retira), no hay pagos web que cruzar con las tiendas.

## Pendiente para iPhone: Apple Salud

No hay ningún código de HealthKit en la app. Falta: activar la capacidad HealthKit en Xcode, los textos de propósito (`NSHealthShareUsageDescription`), un plugin de Capacitor para leer ejercicios, distancia, pulso, elevación, calorías y pasos (igual que el puente de Health Connect en Android), y las etiquetas de privacidad (ya redactadas en `docs/tiendas-formularios-privacidad.md`). Sin Mac, depende de un servicio de compilación en la nube. Inicio de sesión con Apple ya está en el código, nunca probado en iPhone.

## Antes de cobrar: acuerdos de las marcas de relojes

Leídos el 2026-11-10; el detalle está en la carpeta privada (no se publica). Resumen:
- **Garmin:** el acuerdo prohíbe obtener ingresos por el uso de la API sin permiso escrito de Garmin (cláusula 5.2(e)). Hay que pedirlo **antes** de cobrar.
- **Wahoo:** prohíbe cobrar por funciones "relacionadas con" su API y exige borrar los datos de un usuario cuando su suscripción termina. Riesgo alto; pedir confirmación escrita.
- **Polar:** ambiguo ("comercializar"); pide revocar el acceso y borrar los tokens cuando el usuario deja la app.
- **Suunto y COROS:** sin leer (el acuerdo de Suunto no es público; el sitio de COROS bloqueó la lectura).

**Consecuencia técnica:** cuando una cuenta queda sin suscripción (pasado un margen de gracia), hay que desconectar los relojes, revocar los tokens y borrar las carreras importadas de cada marca. Es parte del trabajo del cobro.

## Orden sugerido

1. ~~Decidir qué se bloquea y qué pasa con las cuentas actuales~~ (hecho).
2. Pedir permiso escrito a Garmin y a Wahoo para operar una app de pago; leer los acuerdos de Suunto y COROS.
3. Crear cuentas (Play Console y Apple Developer) y los productos.
4. Construir webhook, pantalla y control de acceso; probarlo en Android primero.
5. Sumar HealthKit y la compra en iPhone cuando haya forma de compilar.
