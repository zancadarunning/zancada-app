# Límites y costos de cada servicio: cuándo conviene pagar cada uno

Público: sin claves. Los números salen de las páginas oficiales de cada servicio, leídas el **2026-11-18**. Lo que figura como **no verificado** no estaba en la fuente o no se pudo leer. **Los precios cambian: confirmarlos en cada sitio antes de decidir.**

## Resumen: qué hace falta pagar y cuándo

| Servicio | Para qué lo usa Zancada | Hoy | Cuándo pagar | Costo aprox. |
|---|---|---|---|---|
| **Vercel** | Servidor y procesos automáticos | **Pro (ya está)** | Ya hecho (el gratis no permite uso comercial ni procesos más de 1 vez por día) | 20 USD/mes |
| **Supabase** | Base de datos y cuentas | Gratis | Antes de cobrar, o a los pocos cientos de usuarios activos | 25 USD/mes |
| **Resend** | Correos (registro, recuperar clave, avisos) | Gratis | Cuando se pase de 100 correos por día | 20 USD/mes |
| **Open-Meteo** | Clima | Gratis | **Antes de cobrar** (el gratis es solo no comercial) | no verificado |
| **Anthropic** | Zonda (la IA) | Por uso | No es suscripción: poner tope de gasto | por uso |
| **Mapbox** | Mapas | Gratis | Cuando se pase de 50.000 imágenes de mapa por mes | por uso |
| **Sentry** | Errores | Gratis | Con un segundo usuario o muchos errores | 29 USD/mes |
| **Google Play** | Publicar en Android | Pagado | Ya hecho | 25 USD una vez |
| **Apple Developer** | Publicar en iPhone | No | Solo cuando haya app para iPhone | 99 USD/año |

Costo fijo mensual estimado al lanzar: **Vercel 20 + Supabase 25 + Resend 20 = 65 USD/mes**, más el clima (Open-Meteo, a confirmar), Sentry si hace falta (29) y lo que se use de Anthropic y Mapbox.

## Supabase (https://supabase.com/pricing)
| | Gratis | Pro |
|---|---|---|
| Precio | 0 | desde 25 USD/mes |
| Base de datos | 500 MB | 8 GB (excedente 0,125 USD/GB) |
| Tráfico de salida | 5 GB | 250 GB (excedente 0,09 USD/GB) |
| Personas activas por mes | 50.000 | 100.000 |
| Copias de seguridad | **No** | Diarias, 7 días |
| Pausa | **Se pausa tras 1 semana sin actividad** | No se pausa |
| Correos de acceso | Con el servicio propio de Supabase, solo **2 por hora**; con correo propio (Resend) se configura en Authentication, Rate Limits (valor por defecto: no verificado) | igual |
- Lo primero que se agota en el plan gratis es el **tráfico de salida (5 GB)**, no la base de datos. Hoy la app usa 14 MB de base con 9 usuarios.
- Con Pro el "tope de gasto" viene activado: no cobra de más hasta que lo apagues.

## Vercel (https://vercel.com/pricing)
- Pro: 20 USD/mes, con 20 USD de crédito de uso incluido, 1 TB de transferencia y procesos automáticos hasta 1 vez por minuto (el gratis, solo 1 vez por día).
- **Alertas:** Team Settings → Billing → **Spend Management** → Add Budget. Avisa por correo al **50 %, 75 % y 100 %** del presupuesto. **No activar "Pause production deployments"**: al llegar al tope, la app devuelve error 503 a todos hasta reactivarla a mano.

## Resend (https://resend.com/pricing)
| Plan | Precio | Correos por mes | Tope diario |
|---|---|---|---|
| Gratis | 0 | 3.000 | **100 por día** (si se pasa, se corta) |
| Pro | 20 USD | 50.000 | sin tope |
| Pro | 35 USD | 100.000 | sin tope |
- Un pico de registros o de recuperaciones de clave pasa los 100 por día fácilmente. Al subir de plan, subir también el tope por hora en Supabase.

## Anthropic (Zonda) (https://platform.claude.com/docs/en/api/rate-limits)
- Los niveles son Start, Build y Scale (ya no "Tier 1 a 4"); la cuenta sube sola según el uso (no verificado: cuánto depósito pide).
- **Tope de gasto mensual por nivel: Start 500 USD, Build 1.000 USD.** Al llegar, la API se **corta hasta el día 1 del mes siguiente** (error 429 `enforced_spend_limit_reached`). Por eso conviene fijar un tope propio más bajo y mirar el gasto.
- Dónde: https://platform.claude.com/settings/spend-limits (tope de gasto) y https://platform.claude.com/usage (uso). Alertas por correo: no verificado.
- Precio de Haiku 5.5: 0,10 USD (entrada) y 0,50 USD (salida) por millón de tokens (según la página de precios de Anthropic al 2026-11-18; confirmarlo en la consola). **Zonda usa Haiku 5.5 desde el 2026-11-18** (antes, Haiku 4.5 a 1 USD y 5 USD por millón); las 14 conversaciones de prueba de evals/coach pasan igual con los dos.
- Zancada ya limita los mensajes por persona (60 por día) y en total (2.000 por día).

## Mapbox (https://www.mapbox.com/pricing)
| Producto | Gratis por mes | Después (por cada 1.000) |
|---|---|---|
| Imágenes estáticas (miniaturas de las carreras) | **50.000** | 1 USD |
| Mosaicos de mapa (mapas interactivos) | 750.000 | 0,25 USD |
- Uso comercial: el plan gratis no es "solo no comercial"; la licencia comercial aparte solo se exige a ciertos rubros (analítica de negocio, inmobiliario, vehículos, etc.). Una app de correr no parece caer ahí. Las reglas del logo y de atribución están en los "Product Terms" (no verificado).
- Lo que se agota primero son las **imágenes estáticas** (cada tarjeta del historial pide una).

## Open-Meteo (https://open-meteo.com/en/pricing)
- Gratis: 600 pedidos por minuto, 5.000 por hora, 10.000 por día, 300.000 por mes, **solo uso no comercial**.
- **Con una app de pago hay que contratar un plan comercial** (Standard: 1 millón de pedidos por mes). Precio: no verificado ("precio fijo mensual", se consulta en su panel o en info@open-meteo.com). **Es un requisito antes de cobrar.**

## Sentry (https://sentry.io/pricing/)
- Gratis (Developer): 5.000 errores (por mes, no aclarado), 30 días de historial, **1 solo usuario**.
- Team: 29 USD/mes (26 anual): 50.000 errores, usuarios ilimitados, 90 días.

## Otros
- **Firebase Cloud Messaging (notificaciones push):** cuota de 600.000 envíos por minuto; sin riesgo a esta escala. Costo: no verificado.
- **Cloudflare (reenvío de correo `info@zancada.org`):** hasta 200 reglas y 200 destinos; sin tope de volumen documentado.
- **Google Play:** 25 USD una vez. Suscripciones: 15 % (con el programa de 15 %); en algunos países (UE, EE. UU., Reino Unido, Japón, Australia) 10 % + 5 % de costo de facturación.
- **Apple:** 99 USD/año. Suscripciones: 30 % el primer año y 15 % después; con el programa de pequeños desarrolladores, 15 % desde el primer día (hasta 1 millón de USD de ganancias). La prueba gratis de 14 días no cuenta como tiempo pago.

## Qué avisa Zancada sola y qué no
- **Aviso diario por correo** (`api/usage-alert.js`, todos los días a las 10:00 de Argentina): mira lo que se puede medir desde la base y manda un correo cuando un límite sube al **70 %, 90 % o 100 %**: tamaño de la base, personas activas, mensajes a Zonda (por persona y total) y altas por día. No repite el aviso todos los días: solo cuando el nivel sube. Al cambiar de plan hay que cargar el límite nuevo en Vercel (variables `SUPABASE_DB_LIMIT_MB`, `SUPABASE_MAU_LIMIT`, `RESEND_DAILY_LIMIT`).
- **Lo que hay que configurar a mano en cada panel (no se puede medir desde la app):**
  1. Vercel: Spend Management (50/75/100 %), sin "pausar producción".
  2. Anthropic: tope de gasto propio, y mirar el uso.
  3. Supabase: avisos de uso y suscripción a su estado (https://status.supabase.com).
  4. Mapbox: revisar el uso mensual de imágenes estáticas.
  5. Sentry: la regla de alertas ya existe (ver `docs/monitoreo-y-respaldos.md`).

## Cuando se cambie de plan
| Variable en Vercel | Gratis (por defecto) | Cuando se pase a Pro |
|---|---|---|
| `SUPABASE_DB_LIMIT_MB` | 500 | 8192 |
| `SUPABASE_MAU_LIMIT` | 50000 | 100000 |
| `RESEND_DAILY_LIMIT` | 100 | 1600 (50.000 al mes) |
