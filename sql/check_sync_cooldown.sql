-- ============================================================================
-- check_sync_cooldown: límite de frecuencia por usuario y por proveedor ("Sincronizar ahora", reprocesado de video, feedback, envío
-- de planes a Suunto/Wahoo). VERSIÓN SEGURA: el estado vive en public.sync_cooldowns, una tabla que SOLO el servidor puede tocar
-- (RLS activada y sin políticas). La versión anterior guardaba el estado dentro de app_state.data, que el propio usuario puede editar
-- o borrar con su sesión, así que cualquiera podía saltearse el límite -- por eso este archivo ya no la contiene: volver a ejecutarlo
-- no puede reintroducir esa vulnerabilidad.
--
-- p_provider: un namespace por endpoint ('strava', 'polar', 'wahoo', 'coros', 'suunto', 'remux', 'feedback', 'suunto-plan', 'wahoo-plan',
-- 'wahoo-workout'). p_cooldown_ms: ventana mínima entre intentos. Devuelve true si se permite seguir (y queda registrado el intento).
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo. Es seguro volver a correrlo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sync_cooldowns (
  user_id  uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text   NOT NULL,
  last_ms  bigint NOT NULL,
  PRIMARY KEY (user_id, provider)
);
ALTER TABLE public.sync_cooldowns ENABLE ROW LEVEL SECURITY;      -- sin políticas: nadie con sesión de usuario la ve ni la escribe
REVOKE ALL ON public.sync_cooldowns FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_sync_cooldown(
  p_user_id uuid,
  p_provider text,
  p_cooldown_ms bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
BEGIN
  -- Inserta el intento, o lo actualiza SOLO si ya pasó el tiempo de espera. Si no tocó ninguna fila, sigue en cooldown.
  INSERT INTO public.sync_cooldowns AS c (user_id, provider, last_ms)
  VALUES (p_user_id, p_provider, v_now)
  ON CONFLICT (user_id, provider) DO UPDATE SET last_ms = v_now
    WHERE c.last_ms <= v_now - p_cooldown_ms;
  RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_sync_cooldown(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
