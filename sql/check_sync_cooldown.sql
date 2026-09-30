-- ============================================================================
-- check_sync_cooldown: auditoría de costos -- strava-sync-now.js/polar-sync-now.js/
-- wahoo-sync-now.js/coros-sync-now.js/remux-video.js (el botón "Sincronizar ahora"
-- de cada proveedor, y el reprocesado de video con ffmpeg) no tenían NINGÚN límite
-- de cuántas veces por minuto un usuario logueado podía dispararlos -- solo pedían
-- estar logueado. Un script (o alguien tocando muy seguido) podía disparar muchas
-- invocaciones seguidas; lo más grave no es el costo de Vercel en sí, sino que
-- golpear demasiado rápido a Strava/Polar/Wahoo/COROS puede hacer que esas
-- plataformas empiecen a limitar o suspender temporalmente las credenciales de la
-- app entera -- rompiendo la sincronización para TODOS los usuarios, no solo el
-- que abusó.
--
-- Esta función es un "check-and-set" atómico: en una sola transacción (FOR UPDATE)
-- mira cuándo fue el último intento de ESTE usuario para ESTE proveedor, y si ya
-- pasó el cooldown, deja pasar y anota el intento actual; si no, lo rechaza sin
-- tocar nada. Mismo patrón que set_strava_sync_status.sql: solo toca la clave
-- `syncCooldown` de app_state.data, deja runs/plan/chat/etc. tal cual estén.
--
-- p_provider: 'strava' | 'polar' | 'wahoo' | 'coros' | 'remux' (un namespace por
-- endpoint, para que sincronizar Strava no bloquee sincronizar Polar).
-- p_cooldown_ms: ventana mínima entre intentos permitidos, en milisegundos.
-- Devuelve true si se permite seguir (y ya quedó registrado el intento), false si
-- todavía está en cooldown.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo. Seguro de volver a correr (CREATE OR REPLACE).
-- ============================================================================

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
  v_data jsonb;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_last bigint;
  v_cooldowns jsonb;
BEGIN
  SELECT data INTO v_data FROM public.app_state WHERE user_id = p_user_id FOR UPDATE;
  IF v_data IS NULL THEN
    -- no hay fila de app_state para este usuario todavía -- no hay nada contra qué
    -- limitar, dejamos pasar (no debería pasar en la práctica: para llegar hasta acá
    -- ya tuvo que haber pasado el onboarding, que crea la fila).
    RETURN true;
  END IF;

  v_cooldowns := COALESCE(v_data->'syncCooldown', '{}'::jsonb);
  v_last := NULLIF(v_cooldowns->>p_provider, '')::bigint;

  IF v_last IS NOT NULL AND (v_now - v_last) < p_cooldown_ms THEN
    RETURN false; -- todavía en cooldown, no tocamos nada
  END IF;

  v_cooldowns := jsonb_set(v_cooldowns, ARRAY[p_provider], to_jsonb(v_now));
  v_data := jsonb_set(v_data, '{syncCooldown}', v_cooldowns);

  -- A propósito NO actualizamos updated_at (mismo criterio que set_strava_sync_status.sql)
  -- -- esto no es un dato real del usuario, no debería disparar el aviso de "conflicto
  -- entre dispositivos" en ningún otro dispositivo abierto.
  UPDATE public.app_state SET data = v_data WHERE user_id = p_user_id;
  RETURN true;
END;
$$;

-- Sin esto, cualquiera con la clave pública podría llamar esta función directo por
-- /rest/v1/rpc/check_sync_cooldown con el p_user_id de OTRO usuario y resetearle
-- (o pisarle) el cooldown -- ver revoke_merge_runs_execute.sql.
REVOKE EXECUTE ON FUNCTION public.check_sync_cooldown(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
