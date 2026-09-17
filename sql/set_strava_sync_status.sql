-- ============================================================================
-- set_strava_sync_status: guarda en app_state.data.stravaSync el resultado de
-- cada intento de sincronización con Strava (cron cada 15' en sync-strava.js,
-- o el botón "Sincronizar ahora" en strava-sync-now.js), para que la app
-- pueda avisarle al usuario cuando la sincronización está fallando o quedó
-- desactualizada -- hoy sync-strava.js atrapa cualquier error por usuario
-- (catch (e) { errors++ }) y no guarda nada de eso en ningún lado, así que ni
-- el usuario ni la propia app se enteran nunca de que algo viene fallando.
--
-- Por qué una función SQL aparte (en vez de un PATCH directo a app_state
-- desde el backend, como purgeStravaRunsForUser): un PATCH directo tendría
-- que mandar el objeto `data` COMPLETO, y si en el medio otra escritura (el
-- merge de carreras nuevas de esta misma sincronización, o el guardado normal
-- del cliente) ya cambió `data`, ese PATCH la pisaría sin darse cuenta -- el
-- mismo problema de fondo que ya resolvió merge_strava_runs.sql (ver ese
-- archivo para la explicación completa). Esta función usa el mismo patrón:
-- todo dentro de una sola transacción con la fila bloqueada (FOR UPDATE), y
-- solo toca la clave `stravaSync` de `data`, dejando `runs`/`plan`/etc. tal
-- cual estén en ese momento.
--
-- p_status trae:
--   { "ok": true }                          -- sincronización exitosa
--   { "ok": false, "error": "mensaje..." }   -- sincronización fallida
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo (junto a merge_strava_runs.sql si todavía no está). Seguro de
-- volver a correr (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_strava_sync_status(
  p_user_id uuid,
  p_status jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data jsonb;
  v_now text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_sync jsonb;
BEGIN
  SELECT data INTO v_data FROM public.app_state WHERE user_id = p_user_id FOR UPDATE;
  IF v_data IS NULL THEN
    RETURN; -- no hay fila de app_state para este usuario todavía (no debería pasar si ya tiene strava_connections, pero por las dudas)
  END IF;

  v_sync := COALESCE(v_data->'stravaSync', '{}'::jsonb);
  v_sync := jsonb_set(v_sync, '{lastAttemptAt}', to_jsonb(v_now));

  IF COALESCE((p_status->>'ok')::boolean, false) THEN
    v_sync := jsonb_set(v_sync, '{lastSuccessAt}', to_jsonb(v_now));
    v_sync := v_sync - 'lastError';
  ELSE
    v_sync := jsonb_set(v_sync, '{lastError}', to_jsonb(COALESCE(p_status->>'error', 'Error desconocido')));
    -- lastSuccessAt NO se toca en el error -- es justo lo que el cliente necesita
    -- para saber hace cuánto fue la última sincronización que sí funcionó.
  END IF;

  v_data := jsonb_set(v_data, '{stravaSync}', v_sync);

  -- A propósito NO actualizamos updated_at acá (a diferencia de
  -- merge_strava_runs) -- ese campo dispara el aviso de "conflicto entre
  -- dispositivos" del cliente, pensado para cuando cambian datos reales
  -- (carreras, plan). Un simple estado de sincronización no debería generar
  -- ese aviso en ningún dispositivo abierto.
  UPDATE public.app_state SET data = v_data WHERE user_id = p_user_id;
END;
$$;

-- Sin esto, cualquiera con la clave pública podría llamar esta función
-- directo por /rest/v1/rpc/set_strava_sync_status con el p_user_id de OTRO
-- usuario y pisarle el estado de sincronización -- ver revoke_merge_runs_execute.sql.
REVOKE EXECUTE ON FUNCTION public.set_strava_sync_status(uuid, jsonb) FROM PUBLIC, anon, authenticated;
