-- ============================================================================
-- sync_probe: pregunta barata para los crons de sincronización (Strava, Wahoo,
-- Polar, COROS), que corren cada 15 minutos.
--
-- Por qué hace falta: cada corrida de esos crons bajaba el app_state.data
-- COMPLETO de cada cuenta conectada (decenas de KB, y crece con cada carrera
-- guardada) solo para saber si había algo nuevo que agregar y si quedaba
-- alguna carrera sin completar -- dos lecturas enteras por cuenta cada 15
-- minutos, aunque no hubiera nada nuevo. Eso es lo que más "datos salientes"
-- (egress) gasta de Supabase y crece con cada usuario conectado a un reloj.
-- Esta función contesta lo mismo adentro de la base y devuelve unos pocos
-- bytes.
--
-- Recibe el usuario, la marca (p_source: 'strava', 'wahoo', 'polar' o
-- 'coros'), el nombre del campo con el id de esa marca dentro de cada carrera
-- (p_id_field: 'stravaId', 'wahooId', ...) y los ids que la marca acaba de
-- devolver (p_ids). Devuelve:
--   { "exists":  true/false,    -- ¿el usuario tiene fila en app_state?
--     "unknown": ["123", ...],  -- ids de p_ids que todavía NO están guardados
--     "pending": true/false }   -- ¿hay carreras de esa marca sin completar?
--                               -- (sin parciales/ruta; el mismo criterio que
--                               -- ya usa cada cron al completarlas)
-- Los ids se comparan como texto.
--
-- Seguridad: es SECURITY DEFINER y recibe p_user_id suelto, así que se le
-- saca el permiso a anon/authenticated (mismo criterio que
-- revoke_merge_runs_execute.sql): solo el backend, con la clave de servicio,
-- puede llamarla. Si la función no existe todavía, los crons siguen como
-- siempre (leen el estado completo): ver api/_lib/sync-probe.js.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo. Seguro de volver a correr (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_probe(
  p_user_id uuid,
  p_source text,
  p_id_field text,
  p_ids jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH st AS (
    SELECT CASE WHEN jsonb_typeof(a.data->'runs') = 'array' THEN a.data->'runs' ELSE '[]'::jsonb END AS runs
    FROM app_state a
    WHERE a.user_id = p_user_id
  ),
  ids AS (
    SELECT e.value #>> '{}' AS id
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_ids) = 'array' THEN p_ids ELSE '[]'::jsonb END) AS e(value)
  ),
  runs AS (
    SELECT r.value AS r,
           (CASE WHEN jsonb_typeof(r.value->'points') = 'array' THEN jsonb_array_length(r.value->'points') ELSE 0 END) > 1 AS has_points
    FROM st, jsonb_array_elements(st.runs) AS r(value)
  )
  SELECT jsonb_build_object(
    'exists', EXISTS (SELECT 1 FROM st),
    'unknown', COALESCE(
      (SELECT jsonb_agg(i.id) FROM ids i
       WHERE NOT EXISTS (SELECT 1 FROM runs WHERE runs.r->>p_id_field = i.id)),
      '[]'::jsonb),
    'pending', EXISTS (
      SELECT 1 FROM runs
      WHERE runs.r->>'source' = p_source
        AND (runs.r->>p_id_field) IS NOT NULL
        AND CASE
          -- COROS: solo las que devuelve la marca ahora (p_ids), sin ruta, y con menos de 3 intentos
          WHEN p_source = 'coros' THEN
            (runs.r->>p_id_field) IN (SELECT id FROM ids)
            AND NOT runs.has_points
            AND COALESCE(runs.r->>'noGps', 'false') <> 'true'
            AND COALESCE((runs.r->>'corosBackfillTries')::numeric, 0) < 3
          -- Wahoo / Polar: sin parciales, o sin ruta (salvo que ya se sepa que no tiene GPS)
          WHEN p_source IN ('wahoo', 'polar') THEN
            (runs.r->>'splitsV') IS DISTINCT FROM '3'
            OR (NOT runs.has_points AND COALESCE(runs.r->>'noGps', 'false') <> 'true')
          -- Strava: sin parciales
          ELSE (runs.r->>'splitsV') IS DISTINCT FROM '3'
        END
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.sync_probe(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_probe(uuid, text, text, jsonb) TO service_role;
