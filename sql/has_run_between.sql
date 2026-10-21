-- ============================================================================
-- has_run_between: pregunta barata para el aviso de la noche "hoy tenías una salida planeada y todavía no aparece cargada"
-- (api/send-reminders.js, api/_lib/missing-run-nudge.js).
--
-- Por qué hace falta: saber si alguien ya tiene una carrera hoy obligaba a bajar app_state.data.runs entero (con todos los puntos GPS, varios
-- MB en cuentas con historial) solo para mirar fechas. Esta función lo contesta adentro de la base y devuelve un booleano.
--
-- Recibe el usuario, el comienzo y el final de "hoy" en ISO UTC (p_from, p_to) y la fecha local (p_day, 'YYYY-MM-DD') para las carreras
-- cargadas a mano que solo guardan el día. Las fechas ISO se comparan como texto (mismo formato y misma zona, así que el orden coincide).
--
-- Seguridad: SECURITY DEFINER y recibe p_user_id suelto, así que se le saca el permiso a anon/authenticated: solo el backend (clave de
-- servicio) puede llamarla. Mientras no exista, el aviso simplemente no se manda (el cron lo trata como "no se pudo saber").
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo. Seguro de volver a correr (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_run_between(
  p_user_id uuid,
  p_from text,
  p_to text,
  p_day text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app_state a,
         jsonb_array_elements(CASE WHEN jsonb_typeof(a.data->'runs') = 'array' THEN a.data->'runs' ELSE '[]'::jsonb END) AS r(value)
    WHERE a.user_id = p_user_id
      AND jsonb_typeof(r.value) = 'object'
      AND (
        (length(COALESCE(r.value->>'date', '')) > 10 AND (r.value->>'date') >= p_from AND (r.value->>'date') < p_to)
        OR (length(COALESCE(r.value->>'date', '')) = 10 AND (r.value->>'date') = p_day)
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_run_between(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_run_between(uuid, text, text, text) TO service_role;
