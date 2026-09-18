-- ============================================================================
-- append_chat_message: agrega un mensaje a app_state.data.chat de forma
-- atómica (fila bloqueada con FOR UPDATE), sin tocar el resto de data. Lo usa
-- purgeStravaRunsForUser (api/_lib/strava-activity-helpers.js) para avisarle
-- al usuario, en el chat del coach, que se borraron carreras porque revocó el
-- acceso desde la propia Strava -- antes ese aviso se agregaba como parte del
-- mismo PATCH-de-todo-app_state que tenía la condición de carrera descripta
-- en purge_provider_runs.sql (ver ese archivo). Separarlo en su propia
-- función chica hace que agregar un mensaje del coach nunca dependa de un
-- snapshot de app_state leído momentos antes.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo. Es seguro volver a correrlo (CREATE OR REPLACE) si hace falta
-- ajustar algo después.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.append_chat_message(
  p_user_id uuid,
  p_role text,
  p_text text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data jsonb;
  v_chat jsonb;
  v_msg jsonb;
BEGIN
  SELECT data INTO v_data FROM public.app_state WHERE user_id = p_user_id FOR UPDATE;
  IF v_data IS NULL THEN
    RETURN; -- no hay fila de app_state para este usuario todavía: nada a lo que agregarle un mensaje
  END IF;

  v_chat := CASE WHEN jsonb_typeof(v_data->'chat') = 'array' THEN v_data->'chat' ELSE '[]'::jsonb END;
  v_msg := jsonb_build_object('role', p_role, 'text', p_text, 'ts', (extract(epoch from now()) * 1000)::bigint);
  v_chat := v_chat || jsonb_build_array(v_msg);
  v_data := jsonb_set(v_data, '{chat}', v_chat);

  UPDATE public.app_state SET data = v_data, updated_at = now() WHERE user_id = p_user_id;
END;
$$;

-- Mismo motivo que merge_strava_runs/purge_provider_runs: sin esto, cualquiera
-- con la clave pública podría llamar esta función directo por
-- /rest/v1/rpc/append_chat_message con el p_user_id de OTRO usuario y
-- meterle un mensaje falso en su chat con el coach.
REVOKE EXECUTE ON FUNCTION public.append_chat_message(uuid, text, text) FROM PUBLIC, anon, authenticated;
