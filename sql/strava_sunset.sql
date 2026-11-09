-- ============================================================================
-- strava_sunset: pasa TODAS las carreras que llegaron por la API de Strava a carga manual, para las cuentas que no vuelven a abrir la app (el cliente lo hace solo para quien sí la abre).
--
-- Cuándo: al lanzar, con STRAVA_SUNSET=1 ya puesto en Vercel y ANTES de revocar las conexiones de Strava (el borrado por revocación quita las carreras con source = 'strava').
-- Qué hace: a cada carrera con source = 'strava' le saca source y stravaId y le pone origin = 'strava' y aiExcluded = true, igual que "Conservar mis carreras" al desconectar un reloj:
-- queda en el Historial como carga manual y NUNCA llega a Zonda (la IA). No toca otras carreras ni otros campos.
-- Cómo correrlo: pegar este archivo en el SQL Editor de Supabase. Primero el SELECT de control (cuántas cuentas y carreras), después el UPDATE.
-- Es seguro volver a correrlo: sin carreras con source = 'strava' no cambia nada.
-- ============================================================================

-- 1) Control: cuántas cuentas y carreras se van a convertir
SELECT count(*) AS cuentas,
       coalesce(sum((SELECT count(*) FROM jsonb_array_elements(data->'runs') r WHERE r->>'source' = 'strava')), 0) AS carreras
FROM public.app_state
WHERE jsonb_typeof(data->'runs') = 'array' AND data->'runs' @> '[{"source":"strava"}]'::jsonb;

-- 2) Conversión
UPDATE public.app_state
SET data = jsonb_set(
      data,
      '{runs}',
      (SELECT jsonb_agg(
                CASE WHEN r->>'source' = 'strava'
                     THEN (r - 'source' - 'stravaId') || '{"origin":"strava","aiExcluded":true}'::jsonb
                     ELSE r END
                ORDER BY ord)
         FROM jsonb_array_elements(data->'runs') WITH ORDINALITY AS t(r, ord))
    ),
    updated_at = now()
WHERE jsonb_typeof(data->'runs') = 'array' AND data->'runs' @> '[{"source":"strava"}]'::jsonb;
