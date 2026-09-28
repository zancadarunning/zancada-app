-- ============================================================================
-- merge_coros_runs: mismo rol que merge_strava_runs/merge_polar_runs/
-- merge_wahoo_runs (ver merge_strava_runs.sql para el porqué de la
-- transacción con FOR UPDATE), acá con el dedupe por corosId.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo. Es seguro volver a correrlo (CREATE OR REPLACE) si hace falta
-- ajustar algo después.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merge_coros_runs(
  p_user_id uuid,
  p_new_runs jsonb,
  p_mode text DEFAULT 'skip'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data jsonb;
  v_runs jsonb;
  v_run jsonb;
  v_run_clean jsonb;
  v_plan jsonb;
  v_week_start text;
  v_monday text;
  v_day_idx int;
  v_changed boolean := false;
  v_idx int;
  v_found_idx int;
  v_old_shoe jsonb;
  -- Dedupe cruzado de fuente (ver el bloque más abajo, y el mismo chequeo del lado del
  -- cliente en isLikelyDuplicateOfExistingRun(), app.js): una carrera nueva sin coincidencia
  -- de corosId puede seguir siendo la MISMA actividad real ya guardada desde otra fuente
  -- (el tracker propio de la app, o el mismo reloj conectado a otra marca a la vez).
  v_is_dup boolean;
  v_existing jsonb;
  v_existing_ms double precision;
  v_new_ms double precision;
  v_existing_km numeric;
  v_new_km numeric;
  v_dist_tol numeric;
  v_existing_dur numeric;
  v_new_dur numeric;
  v_dur_tol numeric;
BEGIN
  IF p_new_runs IS NULL OR jsonb_array_length(p_new_runs) = 0 THEN
    RETURN;
  END IF;

  SELECT data INTO v_data FROM public.app_state WHERE user_id = p_user_id FOR UPDATE;
  IF v_data IS NULL THEN
    RETURN;
  END IF;

  v_runs := COALESCE(v_data->'runs', '[]'::jsonb);
  v_plan := v_data->'plan';
  v_week_start := v_data->>'weekStart';

  FOR v_run IN SELECT * FROM jsonb_array_elements(p_new_runs)
  LOOP
    v_monday := v_run->>'planMonday';
    v_day_idx := NULLIF(v_run->>'planDayIndex', '')::int;
    v_run_clean := (v_run - 'planMonday') - 'planDayIndex';

    v_found_idx := NULL;
    FOR v_idx IN 0 .. jsonb_array_length(v_runs) - 1 LOOP
      IF (v_runs -> v_idx -> 'corosId') = (v_run -> 'corosId') THEN
        v_found_idx := v_idx;
        EXIT;
      END IF;
    END LOOP;

    -- Sin coincidencia por corosId: antes de tratarla como carrera genuinamente nueva,
    -- chequeamos si es la MISMA actividad real ya guardada desde otra fuente (el tracker
    -- propio de Zancada, u otra marca conectada al mismo tiempo), que nunca tuvo un corosId
    -- hasta ahora. Misma tolerancia que isLikelyDuplicateOfExistingRun() en app.js: inicio
    -- dentro de 10 min, distancia dentro del 10% (piso 0.3km), y si ambas tienen duración
    -- cargada, duración dentro del 10% (piso 60s). Ver merge_strava_runs.sql para el porqué
    -- completo -- encontrado en una auditoría de punta a punta.
    v_new_ms := NULL;
    BEGIN
      v_new_ms := extract(epoch FROM (v_run_clean->>'date')::timestamptz) * 1000;
    EXCEPTION WHEN OTHERS THEN
      v_new_ms := NULL;
    END;
    v_is_dup := false;
    IF v_found_idx IS NULL AND v_new_ms IS NOT NULL THEN
      FOR v_idx IN 0 .. jsonb_array_length(v_runs) - 1 LOOP
        v_existing := v_runs -> v_idx;
        v_existing_ms := NULL;
        BEGIN
          v_existing_ms := extract(epoch FROM (v_existing->>'date')::timestamptz) * 1000;
        EXCEPTION WHEN OTHERS THEN
          v_existing_ms := NULL;
        END;
        IF v_existing_ms IS NULL OR abs(v_existing_ms - v_new_ms) > 10*60*1000 THEN CONTINUE; END IF;
        v_existing_km := COALESCE((v_existing->>'distanceKm')::numeric, 0);
        v_new_km := COALESCE((v_run_clean->>'distanceKm')::numeric, 0);
        v_dist_tol := GREATEST(0.3, v_existing_km * 0.1);
        IF abs(v_existing_km - v_new_km) > v_dist_tol THEN CONTINUE; END IF;
        v_existing_dur := COALESCE((v_existing->>'durationSec')::numeric, 0);
        v_new_dur := COALESCE((v_run_clean->>'durationSec')::numeric, 0);
        IF v_existing_dur > 0 AND v_new_dur > 0 THEN
          v_dur_tol := GREATEST(60, v_existing_dur * 0.1);
          IF abs(v_existing_dur - v_new_dur) > v_dur_tol THEN CONTINUE; END IF;
        END IF;
        v_is_dup := true;
        EXIT;
      END LOOP;
    END IF;
    IF v_found_idx IS NULL AND v_is_dup THEN
      CONTINUE; -- misma actividad real ya guardada desde otra fuente -- no duplicar
    END IF;

    IF v_found_idx IS NOT NULL THEN
      IF p_mode <> 'upsert' THEN
        CONTINUE;
      END IF;
      v_old_shoe := v_runs -> v_found_idx -> 'shoeId';
      IF v_old_shoe IS NOT NULL AND v_old_shoe <> 'null'::jsonb THEN
        v_run_clean := jsonb_set(v_run_clean, '{shoeId}', v_old_shoe);
      END IF;
      v_runs := jsonb_set(v_runs, ARRAY[v_found_idx::text], v_run_clean);
    ELSE
      v_runs := v_runs || jsonb_build_array(v_run_clean);
    END IF;
    v_changed := true;

    IF v_found_idx IS NULL
       AND v_plan IS NOT NULL
       AND v_monday IS NOT NULL
       AND v_week_start = v_monday
       AND v_day_idx IS NOT NULL
       AND jsonb_array_length(v_plan) > v_day_idx
       AND (v_plan -> v_day_idx ->> 'status') IS NULL
    THEN
      v_plan := jsonb_set(v_plan, ARRAY[v_day_idx::text, 'status'], '"done"');
      v_plan := jsonb_set(v_plan, ARRAY[v_day_idx::text, 'linkedRunId'], to_jsonb(v_run_clean ->> 'id'));
    END IF;
  END LOOP;

  IF NOT v_changed THEN
    RETURN;
  END IF;

  v_data := jsonb_set(v_data, '{runs}', v_runs);
  IF v_plan IS NOT NULL THEN
    v_data := jsonb_set(v_data, '{plan}', v_plan);
  END IF;

  UPDATE public.app_state
  SET data = v_data, updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Sin esto, cualquiera con la clave pública podría llamar esta función
-- directo por /rest/v1/rpc/merge_coros_runs con el p_user_id de OTRO
-- usuario y pisarle las carreras -- ver revoke_merge_runs_execute.sql.
REVOKE EXECUTE ON FUNCTION public.merge_coros_runs(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
