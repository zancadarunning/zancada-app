-- ============================================================================
-- entitlements: qué plan tiene cada cuenta (gratis / de pago) y hasta cuándo.
--
-- Por qué una tabla aparte y NO un campo dentro de app_state.data: app_state lo escribe la propia persona desde la app (con su sesión), así que cualquiera podría
-- ponerse "premium" editando su estado. Esta tabla solo la escribe el servidor (clave de servicio), a partir de lo que confirmen Google Play / App Store, y la app
-- solo la LEE a través de api/entitlement.js.
--
-- Todavía nada escribe acá (los pagos no están en marcha): mientras la tabla esté vacía todas las cuentas son "free". Cuando se active el cobro, la verificación de
-- compras (notificaciones de Google Play / App Store) hará el upsert acá; la app nunca decide por su cuenta si alguien pagó.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo una sola vez. Es seguro volver a correrlo.
-- Acceso: solo el backend (service role). RLS activada SIN políticas -> ningún usuario de la app puede leerla ni escribirla.
-- Borrado: se borra sola al eliminar la cuenta (ON DELETE CASCADE). "Borrar mis datos" NO la toca a propósito: es un registro de facturación, no un dato de la app.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',            -- 'free' | 'pro' (se amplía cuando se definan los planes)
  status text NOT NULL DEFAULT 'active',        -- 'active' | 'grace' | 'expired' | 'cancelled' | 'refunded'
  source text,                                  -- 'google_play' | 'app_store' | 'manual'
  product_id text,                              -- identificador del producto en la tienda
  expires_at timestamptz,                       -- null = sin vencimiento
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.entitlements FROM anon, authenticated;
