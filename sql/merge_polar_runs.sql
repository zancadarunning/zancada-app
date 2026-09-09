-- ============================================================================
-- merge_polar_runs: mismo rol que merge_strava_runs (ver ese archivo para el
-- porqué de la transacción con FOR UPDATE) pero para carreras que vienen de
-- Polar AccessLink -- la única diferencia real es que el dedupe usa
-- polarId en vez de stravaId, porque los runs de Polar traen ese campo en
-- vez del otro (ver activityToRun() en api/_lib/polar-activity-helpers.js).
--
-- Modos: 'skip' (default, no pisa una carrera ya guardada) o 'upsert'
-- (la reemplaza, preservando el shoeId que el usuario haya asignado a mano).
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo. Es seguro volver a correrlo (CREATE OR REPLACE) si hace falta
-- ajustar algo después.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merge_polar_runs(
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
      IF (v_runs -> v_idx -> 'polarId') = (v_run -> 'polarId') THEN
        v_found_idx := v_idx;
        EXIT;
      END IF;
    END LOOP;

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
