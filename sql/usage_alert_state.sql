-- ============================================================================
-- usage_alert_state: el último nivel de alerta (70 / 90 / 100 %) que ya se avisó por correo de cada límite de uso, para no repetir el mismo
-- aviso todos los días (api/usage-alert.js). Solo la usa el servidor con la clave de servicio: ningún rol de la app puede leerla ni escribirla.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo una sola vez (es seguro correrlo de nuevo).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.usage_alert_state (
  key text PRIMARY KEY,
  level integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usage_alert_state ENABLE ROW LEVEL SECURITY;   -- sin políticas: nadie con la clave pública la ve
REVOKE ALL ON public.usage_alert_state FROM anon, authenticated;
