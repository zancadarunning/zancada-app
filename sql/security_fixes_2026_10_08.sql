-- ============================================================================
-- Correcciones del escaneo de seguridad (2026-10-08). Pegar TODO en el SQL Editor de Supabase y ejecutar.
-- Es seguro correrlo más de una vez.
--
-- 1) LÍMITE DE FRECUENCIA (hallazgos F3/F11/F16): check_sync_cooldown guardaba el último intento dentro de
--    app_state.data->'syncCooldown', que el propio usuario puede editar o borrar con su sesión (RLS "update/delete own"),
--    así que cualquiera podía saltearse el límite de feedback (emails), remux (ffmpeg) y los "Sincronizar ahora".
--    Ahora el estado vive en una tabla que SOLO el servidor puede tocar (RLS activada y sin políticas, como chat_usage),
--    y la decisión es atómica (un solo INSERT ... ON CONFLICT).
--
-- 2) TABLAS DE CONEXIONES (hallazgo F12): el cliente podía INSERTAR/ACTUALIZAR filas de strava_connections (y las otras
--    cuatro marcas) con cualquier athlete_id, falseando el mapa "athlete -> usuario" en el que confía el webhook de Strava.
--    La app solo LEE (user_id) y BORRA su propia fila; todo lo demás lo hace el servidor con la service key.
-- ============================================================================

-- 1) Estado del limitador, solo para el servidor ---------------------------------------------------------------------
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

-- 2) El cliente ya no escribe en las tablas de conexiones (solo lee user_id y borra la suya) ---------------------------
DROP POLICY IF EXISTS "strava_connections_insert_own" ON public.strava_connections;
DROP POLICY IF EXISTS "strava_connections_update_own" ON public.strava_connections;
REVOKE INSERT, UPDATE ON public.strava_connections FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.polar_connections  FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.wahoo_connections  FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.coros_connections  FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.suunto_connections FROM anon, authenticated;

-- Control (solo lectura), correr después:
--   select grantee, table_name, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name like '%_connections' and grantee in ('anon','authenticated')
--   order by 2, 1, 3;
--   -> no tiene que aparecer INSERT ni UPDATE.
