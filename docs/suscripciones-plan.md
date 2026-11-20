# Cobro por suscripción: plan de trabajo

Escrito el 2026-11-10. Público: sin claves. Decisión del dueño: **9,99 USD por mes o 79,99 USD por año, con 14 días de prueba gratis**, cobrados por Google Play y la App Store. Android usa **Health Connect**; iPhone usará **Apple Salud (HealthKit)**. Los Términos (sección 15 y 19) ya cubren prueba, renovación, cancelación, reembolsos y las reglas de cada tienda; no hace falta tocarlos para este precio, porque dicen que el precio lo informa la tienda.

## Qué hay hecho y qué falta

| Pieza | Estado |
|---|---|
| Términos de suscripción (sección 15) y de iOS/Android (sección 19) | Hechos, en 6 idiomas |
| Tabla `entitlements` (quién paga y hasta cuándo, solo la escribe el servidor) | Hecha (`sql/entitlements.sql`) |
| `api/entitlement.js` (la app lee su plan) | Hecho; mientras la tabla esté vacía todas las cuentas son "free" |
| Comprar dentro de la app (Android: RevenueCat + Google Play Billing) | **Hecho el 2026-11-17, apagado** (`PAYWALL_ENABLED = false`); falta tu cuenta de RevenueCat, los productos en Play Console y probarlo en un teléfono real. iPhone: no existe |
| Pantalla de suscripción (paywall) | **Hecha, apagada** (6 idiomas; precio y prueba salen de la tienda; Restaurar compras; renovación automática y cómo cancelar) |
| Aviso de las tiendas al servidor (renovó, canceló, reembolsó) | **Hecho**: `api/revenuecat-webhook.js` (secreto, orden de avisos, reembolso corta ya, cancelar renovación conserva lo pagado) |
| Qué es gratis y qué es Pro | Decidido: **todo se bloquea** al terminar los 14 días (el servidor corta el chat de IA y el video con `PAYWALL_ENFORCE=1`; la app muestra la pantalla de suscripción) |

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

## Pasos tuyos para prender el cobro en Android (en este orden)
1. **Play Console**: cuenta de desarrollador (25 USD, una vez). Subir una primera versión a una prueba interna (hace falta para crear productos). Crear la suscripción **Zancada Pro** con dos planes base: `zancada_pro_monthly` (9,99 USD por mes) y `zancada_pro_yearly` (79,99 USD por año), cada uno con una oferta de **prueba gratis de 14 días** para usuarios nuevos.
2. **RevenueCat** (revenuecat.com): crear el proyecto, conectar Google Play (credenciales de servicio de Play Console), importar los dos productos, crear el **entitlement `pro`**, un **offering "default"** con los paquetes mensual y anual. Copiar la **clave pública del SDK de Android** (empieza con `goog_`).
3. **Webhook**: en RevenueCat > Integrations > Webhooks, URL `https://www.zancada.org/api/revenuecat-webhook` y en "Authorization header value" un secreto largo con el formato `Bearer <secreto>`. El mismo secreto va en Vercel como `REVENUECAT_WEBHOOK_SECRET` (solo el valor, sin "Bearer").
4. **Tabla**: correr en el SQL Editor de Supabase `sql/entitlements_billing.sql` (agrega una columna, es seguro).
5. **Probar con testers de licencia** de Play Console: poner `REVENUECAT_ALLOW_SANDBOX=1` en Vercel mientras se prueba; comprar, renovar, cancelar y restaurar en un teléfono real. Sacar esa variable después.
6. **Prender el cobro (el día del lanzamiento)**: (a) correr `sql/entitlements_gift_existing.sql` (regala Pro a las cuentas que ya existen; sin vencimiento), (b) poner la clave `goog_...` en `REVENUECAT_ANDROID_KEY` y `PAYWALL_ENABLED = true` en app.js, (c) `PAYWALL_ENFORCE=1` en Vercel, (d) subir la versión a Play.

## Hecho el 2026-11-17 (apagado con el resto)
- Aviso al borrar la cuenta si hay suscripción paga vigente (la tienda sigue cobrando).
- Tarjeta "Tu suscripción" en Perfil (vencimiento + botón a Google Play); no aparece en cuentas regaladas.

## Auditoría del cobro (2026-11-20) y ajustes de RevenueCat que hay que hacer en su panel
Arreglado en el código (rama fix/cobros-auditoria-2026-11-20):
- **Comprar sin estar identificado**: si fallaba el `logIn` de RevenueCat, la pantalla igual ofrecía comprar como usuario anónimo: se cobraba y el servidor ignoraba el aviso (pagó y no tenía acceso). Ahora nunca se compra sin confirmar con `getAppUserID` que RevenueCat identificó la cuenta.
- **Pagar dos veces**: antes de cobrar se consulta el plan al servidor (si ya hay plan, no se compra); "producto ya comprado" sincroniza en vez de volver a cobrar; el botón queda bloqueado mientras se procesa.
- **Confirmación demorada**: si el aviso de la tienda tarda, si el pago queda pendiente o se corta la red justo después de pagar, la app sigue consultando hasta 10 minutos y activa sola.
- **Aviso viejo pisando a uno nuevo**: antes se leía y después se escribía (dos avisos casi simultáneos podían pisarse); ahora es una actualización condicional atómica en la base.
- **Suscriptor al día mandado a pagar**: si la base fallaba, el servidor respondía 402 y la app mostraba la pantalla de pago aunque la persona hubiera pagado; ahora responde 503 (no se manda a pagar). Y hay un margen de 6 horas después del vencimiento (la renovación llega con retraso); un reembolso o un vencimiento confirmado cortan en el acto.

**Ajustes en el panel de RevenueCat (los hace el dueño):**
1. Project settings > General > **Restore behavior** (comportamiento al restaurar compras): elegir **mantener con el usuario original / no transferir** a otra cuenta. Con "transferir", una misma cuenta de Google podría mover la suscripción de una cuenta de Zancada a otra, y el aviso TRANSFER no le da acceso a la cuenta nueva (el servidor lo ignora a propósito).
2. Integrations > Webhooks: URL y secreto (ver los pasos de arriba); mandar eventos de **Production** (y Sandbox solo mientras se prueba).
3. Una **suscripción compartida por dos cuentas de Zancada** no es posible: es lo buscado (la segunda ve el mensaje "ya está asociada a otra cuenta").

**Límite conocido, no es un bug:** la pantalla de suscripción vive en la app instalada. Quien modifique su propia copia del código en un teléfono con root podría ver las pantallas, pero **todo lo que cuesta plata (chat de IA y video) lo corta el servidor** con `PAYWALL_ENFORCE=1`. Lo que corre solo en el teléfono (planes, registro de carreras) no se puede proteger del todo y no cuesta nada.

**Decisión pendiente con `PAYWALL_ENFORCE=1`:** corta el chat y el video para **todo** cliente, también la web. Las cuentas nuevas en zancada.org (o iPhone antes de que exista la app) no tendrían forma de pagar. Hay que decidir: cerrar el registro web al lanzar, o dejar el chat sin cobro en la web.

### Tercera pasada (2026-11-20): respaldo si se pierde el aviso de la tienda
- **Problema:** el acceso dependía solo del webhook. Si Vercel caía justo cuando alguien pagaba y RevenueCat agotaba los reintentos, esa persona quedaba con la compra hecha y sin acceso.
- **Arreglo:** si la tabla `entitlements` dice "sin plan", el servidor le pregunta directo a RevenueCat (`GET /v1/subscribers/{id}`, `api/_lib/revenuecat-lookup.js`) tanto en `api/entitlement.js` (lo que ve la app) como en `require-plan.js` (el corte del chat y el video). RevenueCat es la fuente de verdad; no escribe nada en la base; cualquier error cae a "sin plan"; cache de 30 s.
- **Para activarlo (lo hace el dueño):** en RevenueCat, Project settings > **API keys** > crear una **Secret API key** (empieza con `sk_`, permiso de solo lectura si deja elegir) y cargarla en Vercel como `REVENUECAT_SECRET_KEY` (tipo Sensitive, Production). Sin la variable, todo funciona como antes (solo por webhook).
- Cuando el servidor dice "falta suscripción" (402) la app ahora vuelve a preguntar el plan antes de mostrar la pantalla de pago (si se acaba de activar, no se la muestra).
- "Producto ya comprado" que no llega a la cuenta (la suscripción es de otra cuenta de Zancada) muestra el mensaje correcto en vez de "se está procesando".

**Decisión pendiente, relojes:** el servidor NO corta las conexiones con relojes (Garmin, Suunto, Wahoo, Polar, COROS, Huawei) a quien no paga; solo la pantalla de la app los tapa. Cortarlos por servidor agrava el conflicto con los acuerdos de Garmin y Wahoo sobre cobrar por funciones que usan su API (ver más arriba). No se hizo a propósito: decidir junto con el permiso escrito de esas marcas.

## Pendiente del cobro (no hecho)
- Al quedar una cuenta sin plan: desconectar relojes y borrar las carreras importadas de cada marca (hoy solo se corta el chat de IA y el video).
- Huawei: Huawei IAP, aparte (RevenueCat no lo soporta). iPhone: StoreKit.
