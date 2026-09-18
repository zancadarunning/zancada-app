-- ============================================================================
-- purge_provider_runs: borra de app_state.data.runs todas las carreras de un
-- proveedor (source = p_source) y recalcula el km de cada zapatilla, de forma
-- atómica -- reemplaza al viejo patrón "GET app_state -> filtrar en memoria
-- en el servidor -> PATCH app_state" que tenían purgeStravaRunsForUser,
-- purgePolarRunsForUser, purgeWahooRunsForUser y purgeCorosRunsForUser
-- (api/_lib/*-activity-helpers.js).
--
-- Por qué hace falta: mismo problema que ya se había arreglado para
-- merge_strava_runs (ver ese archivo) pero que había quedado sin arreglar acá
-- -- si el usuario guarda algo (chat, plan, perfil) desde la app justo
-- mientras se procesa una desconexión o un webhook de "revocaste el acceso",
-- ese guardado se perdía en silencio, porque el PATCH viejo mandaba de vuelta
-- TODO app_state.data tal como lo había leído momentos antes, pisando
-- cualquier cambio que hubiera llegado en el medio. Esta función hace todo
-- (filtrar runs, recalcular zapatillas, y opcionalmente limpiar
-- stravaSync) adentro de una sola transacción con la fila bloqueada
-- (FOR UPDATE), igual que merge_strava_runs.
--
-- Devuelve cuántas carreras se sacaron y el idioma del usuario (data.lang),
-- para que el que llama pueda armar (si corresponde) el mensaje de aviso
-- traducido y agregarlo con append_chat_message -- este función en sí no
-- arma texto, porque los mensajes multi-idioma viven en JS (ver
-- REVOKED_MSGS en api/strava-webhook.js).
--
-- p_clear_strava_sync: true solo lo usa el flujo de Strava (purgeStravaRunsForUser)
-- -- borra también app_state.data.stravaSync, para que alguien que desconecta
-- y vuelve a conectar más adelante no vea en el Historial el aviso de "la
-- sincronización falló" de la conexión vieja.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo. Es seguro volver a correrlo (CREATE OR REPLACE) si hace falta
-- ajustar algo después.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.purge_provider_runs(
  p_user_id uuid,
  p_source text,
  p_clear_strava_sync boolean DEFAULT false
)
RETURNS TABLE(removed_count integer, lang text)
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
  v_will_clear_sync boolean;
BEGIN
  -- Bloqueamos la fila: si un guardado normal del cliente o cualquier otra
  -- sincronización está en medio de su propio cambio para este usuario, esta
  -- espera a que termine en vez de leer un estado a mitad de escribir.
  SELECT data INTO v_data FROM public.app_state WHERE user_id = p_user_id FOR UPDATE;
  IF v_data IS NULL THEN
    RETURN QUERY SELECT 0, NULL::text;
    RETURN;
  END IF;

  v_runs := COALESCE(v_data->'runs', '[]'::jsonb);
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_kept
  FROM jsonb_array_elements(v_runs) elem
  WHERE (elem->>'source') IS DISTINCT FROM p_source;

  v_removed := jsonb_array_length(v_runs) - jsonb_array_length(v_kept);
  v_will_clear_sync := p_clear_strava_sync AND (v_data ? 'stravaSync');

  IF v_removed = 0 AND NOT v_will_clear_sync THEN
    RETURN QUERY SELECT 0, v_data->>'lang';
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

  IF v_will_clear_sync THEN
    v_data := v_data - 'stravaSync';
  END IF;

  UPDATE public.app_state SET data = v_data, updated_at = now() WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_removed, v_data->>'lang';
END;
$$;

-- Mismo motivo que merge_strava_runs: sin esto, cualquiera con la clave
-- pública podría llamar esta función directo por /rest/v1/rpc/purge_provider_runs
-- con el p_user_id de OTRO usuario y borrarle las carreras.
REVOKE EXECUTE ON FUNCTION public.purge_provider_runs(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
