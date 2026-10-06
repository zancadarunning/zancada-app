# Suunto: pasar de la Developer API a la Production API

Estado al 6 de octubre de 2026. Fuente: apizone.suunto.com (home, /how-to-start, /faq) y su formulario de
contenido. Lo que Suunto no publica está marcado como **sin confirmar**.

## Qué pide Suunto (los pasos 4, 5 y 6 de su proceso)

1. **Completar el perfil de la aplicación en API Zone** (apizone.suunto.com/profile → "OAuth application
   settings" y "Application / service description"). Los campos: Client name, Redirect URI, URLs de
   notificación, Name, Description, Read more URL, Connect URL, Icon (300×300), Image (1135 px de ancho),
   Publishing status y Tags.
2. **Suscribirse a la Production API** (producto "unlimited"):
   https://suunto-api.developer.azure-api.net/product-details#product=unlimited
3. **Enviar el formulario de contenido para socios** (Suunto lo usa para publicar Zancada en Suunto.com y en
   la app de Suunto). La URL que figuraba en el mail daba 404; la que funciona es
   https://survey.alchemer.eu/s3/90553909/Suunto-Content-submit-for-Partners
   Primera página: Company, Email del contacto, Product name, Contact person. Las páginas siguientes no se
   pueden ver sin completar el formulario (sin confirmar qué piden: textos, imágenes, idiomas).
4. **Esperar**: Suunto no publica un plazo de revisión para la producción (**sin confirmar**). La
   solicitud de socio original tardó pocos días.
5. **Promocionar la compatibilidad** usando sus logos oficiales. Los materiales están en media.suunto.com
   (requiere cuenta) y se reciben por mail tras la aceptación. Las reglas de uso del logo y el nombre
   ("Works with Suunto") **no son públicas**: hay que pedirlas.

Criterios de revisión que sí publican: ajuste a la marca, interés de los clientes de Suunto y "mentalidad de
innovación". El acceso es para empresas/organizaciones, no para uso personal.

## Textos para copiar y pegar (en inglés, es lo que ve Suunto)

**Name:** Zancada

**Description (profile, 1–2 sentences):**
Zancada is an AI running coach with personalized training plans. It syncs your Suunto runs automatically and
sends each week's planned workouts, with intervals and heart-rate targets, to your Suunto account as
SuuntoPlus Guides.

**Read more URL / Connect URL:** https://zancada.org

**Tags:** Training planning, Sports Diary, Synchronisation, Coaching Tool, Training analysis

**Icon (300×300):** `brand/suunto/zancada-icon-300.png`
**Image (1135 px wide):** `brand/suunto/zancada-banner-1135.png`

**Content form:**
- Company: *(nombre legal de la empresa u organización: completar)*
- Email address of the contact person: info@zancada.org
- Product name: Zancada
- Contact person: *(nombre de quien atiende a Suunto)*

## Antes de enviar (lo que depende de vos)

- [ ] **Nombre legal de la empresa/organización.** Suunto solo da acceso a empresas y organizaciones. Las
      páginas `privacy.html` y `terms.html` todavía tienen datos legales de ejemplo para completar.
- [ ] Revisar con el equipo que la integración cumple lo que Suunto espera de una integración "bien
      hecha": conectar, desconectar (borra las guías), mostrar de dónde vienen los datos.
- [ ] **Logo de Suunto**: la tarjeta de Suunto en Perfil hoy muestra solo el texto "Suunto". Hay que
      reemplazarlo con el logo oficial que manden (no usar uno propio ni bajado de internet).
- [ ] Pedir por mail las reglas de marca y el checklist de revisión (borrador abajo).

## Borrador de mail para partners@suunto.com (lo enviás vos)

> Subject: Zancada – moving to the Production API: brand guidelines and review checklist
>
> Hello Suunto Partnership team,
>
> We are Zancada (https://zancada.org), an AI running coach app. We were accepted into the Suunto Partner
> Program and our integration with the Cloud API is working in the Developer API: users connect with
> OAuth, runs arrive through the workout webhook, and we upload each week's planned workouts as SuuntoPlus
> Guides (including updates and deletions when the plan changes).
>
> We would like to move to the Production API. Could you please share:
> 1. The review checklist or criteria for the Production API subscription.
> 2. The brand and compatibility guidelines (logo usage, "Works with Suunto" wording, and whether we may
>    name the integration "Suunto" in our app).
> 3. Access to the marketing assets in media.suunto.com for our account.
> 4. Anything else the content submit form requires beyond its first page (texts, image sizes, languages).
>
> Our contact is info@zancada.org. Thank you!
>
> Zancada team

## Qué cambia en Zancada al aprobarse

- Ya no hay límite de 200 llamadas por semana: se puede dejar de frenar el envío por cuota.
- Reemplazar el texto "Suunto" por el logo oficial en la tarjeta de Perfil.
- Actualizar este documento con lo que Suunto responda.
