-- ============================================================================
-- run_counts_for_session: ¿esta carrera alcanza para dar por hecha la sesión planeada de un día?
--
-- Misma regla que runCountsForSession() en app.js: la carrera tiene que llegar al 30% de la distancia
-- O del tiempo planeado (el Test de nivel cuenta 12 minutos). Un día sin sesión planeada, o sin datos
-- para comparar, no exige nada. Antes cualquier carrera del día valía: una actividad de 400 m que el
-- reloj subió por error marcaba como hecha una tirada larga de 20 km.
--
-- La usan merge_strava_runs, merge_polar_runs, merge_wahoo_runs, merge_coros_runs y merge_suunto_runs
-- cuando vinculan la carrera nueva con el día del plan. La carrera se guarda igual en Historial; lo
-- único que cambia es que no marca el día como "hecho".
--
-- Cómo correrlo: pegar este archivo en el SQL Editor de Supabase ANTES de volver a correr los cinco
-- merge_*_runs.sql (esos la llaman). Es seguro volver a correrlo. No lee ninguna tabla.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_counts_for_session(p_day jsonb, p_run jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_km numeric;
  v_min numeric;
  v_run_km numeric;
  v_run_sec numeric;
BEGIN
  IF p_day IS NULL OR p_run IS NULL THEN
    RETURN true;
  END IF;
  v_km := COALESCE(NULLIF(p_day->>'dist', '')::numeric, 0);
  IF p_day->>'typeKey' = 'test' THEN
    v_min := 12;
  ELSE
    v_min := COALESCE(NULLIF(p_day->>'durMin', '')::numeric, 0);
  END IF;
  IF v_km <= 0 AND v_min <= 0 THEN
    RETURN true;   -- nada planeado para comparar
  END IF;
  v_run_km := COALESCE(NULLIF(p_run->>'distanceKm', '')::numeric, 0);
  v_run_sec := COALESCE(NULLIF(p_run->>'durationSec', '')::numeric, 0);
  RETURN (v_km > 0 AND v_run_km >= v_km * 0.3) OR (v_min > 0 AND v_run_sec >= v_min * 60 * 0.3);
EXCEPTION WHEN OTHERS THEN
  RETURN true;     -- un valor raro en el plan no puede romper la sincronización: se vincula como antes
END;
$$;
