-- ============================================================================
-- merge_strava_runs: agrega o actualiza carreras de Strava en
-- app_state.data.runs de forma atómica, en vez del viejo patrón "GET
-- app_state -> mergear en memoria en el servidor -> PATCH app_state" que
-- usaban strava-auth.js, strava-webhook.js, strava-resync.js,
-- strava-sync-now.js y sync-strava.js.
--
-- Por qué hace falta: ese patrón viejo tiene una condición de carrera real.
-- Si el cron de sincronización (cada 15 minutos) y una sincronización manual
-- corren casi al mismo tiempo -- o el cron corre mientras el cliente tiene
-- la app abierta con datos viejos en memoria -- el segundo PATCH puede pisar
-- lo que el primero acaba de guardar, porque cada uno leyó el estado ANTES
-- de que el otro terminara de escribir. Esta función hace todo el mergeo
-- adentro de una sola transacción con la fila bloqueada (FOR UPDATE), así
-- que no hay ventana para que se pisen. También actualiza `updated_at`
-- siempre que cambia algo -- antes el PATCH mandaba solo `{ data }` y dejaba
-- `updated_at` sin tocar, por lo que el aviso de "conflicto entre
-- dispositivos" del cliente (checkForRemoteConflict en index.html) nunca se
-- enteraba de que una sincronización de Strava había cambiado los datos.
--
-- Modos:
--   'skip'   (default) -- si la carrera ya existe (mismo stravaId), no la
--            toca. Lo usan strava-auth.js, strava-resync.js,
--            strava-sync-now.js y sync-strava.js: a esos flujos solo les
--            interesa agregar carreras NUEVAS, nunca pisar una que el
--            usuario ya haya editado en la app (por ejemplo, asignado una
--            zapatilla).
--   'upsert' -- si la carrera ya existe, la reemplaza con los datos nuevos
--            de Strava (preservando el shoeId que el usuario haya asignado
--            a mano, porque Strava no sabe nada de eso). Lo usa
--            strava-webhook.js, porque Strava manda el mismo evento tanto
--            para actividades nuevas como para ediciones de una actividad
--            ya sincronizada.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo. Es seguro volver a correrlo (CREATE OR REPLACE) si hace falta
-- ajustar algo después.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merge_strava_runs(
  p_user_id uuid,
  -- Array de runs ya armados por activityToRun() en
  -- api/_lib/strava-activity-helpers.js. Cada uno trae dos campos de "paso"
  -- -- planMonday y planDayIndex -- que esta función usa para saber si la
  -- carrera corresponde a un día del plan de esa semana, y que descarta
  -- antes de guardar el run definitivo (no quedan en el run final).
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

  -- Bloqueamos la fila: si otra sincronización está en medio de su propio
  -- merge_strava_runs para el mismo usuario, esta espera a que termine en
  -- vez de leer un estado a mitad de escribir.
  SELECT data INTO v_data FROM public.app_state WHERE user_id = p_user_id FOR UPDATE;
  IF v_data IS NULL THEN
    RETURN; -- no hay fila de app_state para este usuario todavía: nada que mergear
  END IF;

  v_runs := COALESCE(v_data->'runs', '[]'::jsonb);
  v_plan := v_data->'plan';
  v_week_start := v_data->>'weekStart';

  FOR v_run IN SELECT * FROM jsonb_array_elements(p_new_runs)
  LOOP
    v_monday := v_run->>'planMonday';
    v_day_idx := NULLIF(v_run->>'planDayIndex', '')::int;
    v_run_clean := (v_run - 'planMonday') - 'planDayIndex';

    -- ¿ya existe una carrera con este stravaId?
    v_found_idx := NULL;
    FOR v_idx IN 0 .. jsonb_array_length(v_runs) - 1 LOOP
      IF (v_runs -> v_idx -> 'stravaId') = (v_run -> 'stravaId') THEN
        v_found_idx := v_idx;
        EXIT;
      END IF;
    END LOOP;

    IF v_found_idx IS NOT NULL THEN
      IF p_mode <> 'upsert' THEN
        CONTINUE; -- ya existe y no estamos en modo upsert: no la tocamos
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

    -- El plan solo se marca "hecho" para carreras nuevas (v_found_idx nulo),
    -- nunca al reprocesar una edición de una carrera ya vinculada.
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
    RETURN; -- todas las carreras que mandaron ya estaban guardadas (modo skip)
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
-- directo por /rest/v1/rpc/merge_strava_runs con el p_user_id de OTRO
-- usuario y pisarle las carreras -- ver revoke_merge_runs_execute.sql.
REVOKE EXECUTE ON FUNCTION public.merge_strava_runs(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
