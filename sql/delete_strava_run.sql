-- ============================================================================
-- delete_strava_run: borra de app_state.data.runs la carrera de Strava con
-- este stravaId puntual (si existe) y recalcula el km de cada zapatilla, de
-- forma atómica -- mismo patrón que purge_provider_runs.sql (fila bloqueada
-- con FOR UPDATE), pero para UNA sola carrera en vez de todas las de un
-- proveedor.
--
-- Por qué hace falta: Strava manda un evento de webhook con aspect_type
-- 'delete' cuando el usuario borra una actividad DESDE Strava (por ejemplo,
-- si la subió por error, o la borra después de editarla) -- distinto de
-- 'create'/'update', que sí se manejan en strava-webhook.js. Sin esto, ese
-- evento no hacía nada (ver el bloque if/else de module.exports en
-- strava-webhook.js, que solo mira 'create'/'update' y el caso aparte de
-- 'athlete'/authorized=false) -- la carrera borrada en Strava se quedaba en
-- el Historial de Zancada para siempre, mostrando una actividad que el
-- usuario ya no tiene del otro lado.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo. Es seguro volver a correrlo (CREATE OR REPLACE) si hace falta
-- ajustar algo después.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_strava_run(
  p_user_id uuid,
  p_strava_id bigint
)
RETURNS TABLE(removed_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data jsonb;
  v_runs jsonb;
  v_kept jsonb;
  v_removed int;
  v_shoes jsonb;
BEGIN
  -- Bloqueamos la fila: mismo motivo que purge_provider_runs/merge_strava_runs
  -- -- si un guardado normal del cliente o cualquier otra sincronización está
  -- en medio de su propio cambio para este usuario, esta espera a que termine
  -- en vez de leer un estado a mitad de escribir.
  SELECT data INTO v_data FROM public.app_state WHERE user_id = p_user_id FOR UPDATE;
  IF v_data IS NULL THEN
    RETURN QUERY SELECT 0;
    RETURN;
  END IF;

  v_runs := COALESCE(v_data->'runs', '[]'::jsonb);
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_kept
  FROM jsonb_array_elements(v_runs) elem
  WHERE (elem->>'stravaId') IS DISTINCT FROM p_strava_id::text;

  v_removed := jsonb_array_length(v_runs) - jsonb_array_length(v_kept);
  IF v_removed = 0 THEN
    RETURN QUERY SELECT 0;
    RETURN;
  END IF;

  v_data := jsonb_set(v_data, '{runs}', v_kept);

  IF jsonb_typeof(v_data->'shoes') = 'array' THEN
    SELECT COALESCE(jsonb_agg(
      shoe || jsonb_build_object('km',
        (SELECT COALESCE(SUM((r->>'distanceKm')::numeric), 0)
         FROM jsonb_array_elements(v_kept) r
         WHERE (r->>'shoeId') = (shoe->>'id'))
      )
    ), '[]'::jsonb) INTO v_shoes
    FROM jsonb_array_elements(v_data->'shoes') shoe;
    v_data := jsonb_set(v_data, '{shoes}', v_shoes);
  END IF;

  UPDATE public.app_state SET data = v_data, updated_at = now() WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_removed;
END;
$$;

-- Mismo motivo que merge_strava_runs/purge_provider_runs: sin esto,
-- cualquiera con la clave pública podría llamar esta función directo por
-- /rest/v1/rpc/delete_strava_run con el p_user_id de OTRO usuario y borrarle
-- una carrera a mano.
REVOKE EXECUTE ON FUNCTION public.delete_strava_run(uuid, bigint) FROM PUBLIC, anon, authenticated;
