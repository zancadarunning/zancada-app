# Lanzamiento de Zancada en Android, con suscripción (lista de trabajo)

Escrito el 2026-11-20. Público: sin claves. Decisión del dueño: **Android primero**; iPhone después (hace falta una Mac). Precio: **9,99 USD por mes o 79,99 USD por año, 14 días de prueba**. Detalle técnico del cobro: `docs/suscripciones-plan.md`.

## Estado

| # | Paso | Quién | Estado |
|---|---|---|---|
| 1 | Alta fiscal (monotributo; consultar si corresponde el Social) | Dueño | Pendiente. Guía: carpeta privada, `Legal\06-Alta-fiscal`. Va ANTES de crear las suscripciones |
| 2 | Cuenta en dólares en el banco (para cobrar de Google) | Dueño | Pendiente |
| 3 | Play Console: identidad verificada (el comprobante de domicilio fue rechazado) | Dueño | Bloqueado |
| 4 | Play Console: verificación del dispositivo (con el A33, Android 10 o más) | Dueño | Bloqueado: falta el teléfono |
| 5 | Play Console: perfil de pagos con datos fiscales (W-8BEN) | Dueño | Después del 1 y del 3 |
| 6 | Subir la primera versión (AAB 1.0.3 o más nueva) a prueba interna | Claude arma, dueño sube | AAB listo; hay que regenerarlo con los cambios del cobro |
| 7 | Crear la suscripción Zancada Pro (mensual 9,99 y anual 79,99, prueba de 14 días) | Dueño | Después del 6 |
| 8 | RevenueCat: proyecto, app Play Store, clave `goog_`, webhook con secreto, "mantener con el ID original" | Dueño y Claude | **Hecho el 2026-11-20** (webhook probado: 200) |
| 9 | RevenueCat: credenciales de servicio de Google (JSON), importar productos, asociarlos a Zancada Pro, offering default con Monthly y Yearly | Dueño, Claude guía | Después del 7 |
| 10 | Probar con testers de licencia: comprar, renovar, cancelar, reembolsar, restaurar; `REVENUECAT_ALLOW_SANDBOX=1` solo mientras se prueba | Dueño y Claude | Después del 9 |
| 11 | Supabase Pro y Resend de pago (antes de cobrar) | Dueño | Pendiente |
| 12 | Fichas de la tienda: textos, capturas, formularios de privacidad y datos de salud (Health Connect) | Claude prepara, dueño sube | Textos en `docs/tiendas-formularios-privacidad.md` |
| 13 | Día del lanzamiento: correr `sql/entitlements_gift_existing.sql`, `PAYWALL_ENABLED = true`, `PAYWALL_ENFORCE=1`, quitar Sandbox del webhook, subir a producción en Play | Claude prepara, dueño aprueba | Ver `docs/suscripciones-plan.md` |

## Decisiones tomadas (2026-11-20, delegadas por el dueño a Claude)

1. **Web y chat de IA:** con `PAYWALL_ENFORCE=1` el chat y el video se cortan para toda cuenta sin plan, también en la web y en iPhone (no hay forma de pagar ahí hasta que exista la app de iPhone). Motivo: regalarlos cuesta plata sin ingresos, y la web pasa a ser solo una página de presentación. Las cuentas existentes tienen Pro de regalo. Al lanzar, avisar en la ficha y en la página que Zonda y el video requieren la suscripción de la app Android.
2. **Relojes:** NO se cortan por servidor por ahora; se decide junto con el permiso escrito de Garmin y Wahoo (ver `docs/suscripciones-plan.md`).
3. **Respaldo si se pierde el aviso de la tienda:** crear la Secret API key de RevenueCat (V1) y cargarla en Vercel como `REVENUECAT_SECRET_KEY`.

## Decisiones abiertas (del dueño)

1. **Marcas de relojes:** pedir permiso escrito a Garmin y Wahoo antes de cobrar.
2. **Facturación a las tiendas:** si corresponde Factura E o C a Google (consultar a ARCA o a un contador puntual).
3. **Ingresos Brutos de La Pampa:** consultar a la DGR.

## Qué no se puede probar sin Google

Comprar de verdad, el restore y las renovaciones. Todo lo demás del cobro (servidor, webhook, pantalla, reglas de acceso) está probado con pruebas automáticas.
