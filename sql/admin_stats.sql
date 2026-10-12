-- ============================================================================
-- admin_stats: números globales para el panel de administración (api/admin-stats.js).
--
-- Devuelve UN solo jsonb con: cuentas, altas por semana, actividad, onboarding, idiomas,
-- objetivos, notificaciones push, conexiones por reloj y carreras. Se ejecuta con
-- SECURITY DEFINER para poder leer auth.users, y por eso queda cerrada para todos los roles
-- salvo service_role: el cliente (anon / authenticated) NO puede llamarla.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo.
-- Es seguro volver a correrlo (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'generated_at', now(),
    'users', jsonb_build_object(
      'total',            (SELECT count(*) FROM auth.users),
      'confirmed',        (SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL),
      'new_7d',           (SELECT count(*) FROM auth.users WHERE created_at > now() - interval '7 days'),
      'new_30d',          (SELECT count(*) FROM auth.users WHERE created_at > now() - interval '30 days'),
      'signed_in_7d',     (SELECT count(*) FROM auth.users WHERE last_sign_in_at > now() - interval '7 days'),
      'signed_in_30d',    (SELECT count(*) FROM auth.users WHERE last_sign_in_at > now() - interval '30 days')
    ),
    'signups_by_week', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('week', w.week, 'n', w.n) ORDER BY w.week)
      FROM (
        SELECT to_char(gs.week, 'YYYY-MM-DD') AS week,
               (SELECT count(*) FROM auth.users u
                 WHERE u.created_at >= gs.week AND u.created_at < gs.week + interval '7 days') AS n
        FROM generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') AS gs(week)
      ) w
    ), '[]'::jsonb),
    'app', jsonb_build_object(
      'with_data',        (SELECT count(*) FROM public.app_state),
      'onboarded',        (SELECT count(*) FROM public.app_state WHERE data->>'onboarded' = 'true'),
      'data_saved_7d',    (SELECT count(*) FROM public.app_state WHERE updated_at > now() - interval '7 days'),
      'data_saved_30d',   (SELECT count(*) FROM public.app_state WHERE updated_at > now() - interval '30 days'),
      'users_with_runs',  (SELECT count(*) FROM public.app_state WHERE jsonb_typeof(data->'runs') = 'array' AND jsonb_array_length(data->'runs') > 0),
      'total_runs',       (SELECT COALESCE(sum(jsonb_array_length(data->'runs')), 0) FROM public.app_state WHERE jsonb_typeof(data->'runs') = 'array')
    ),
    'languages', COALESCE((
      SELECT jsonb_object_agg(l.lang, l.n)
      FROM (SELECT COALESCE(data->>'lang', 'sin dato') AS lang, count(*) AS n FROM public.app_state GROUP BY 1) l
    ), '{}'::jsonb),
    'goals', COALESCE((
      SELECT jsonb_object_agg(g.goal, g.n)
      FROM (SELECT COALESCE(data->'profile'->>'goal', 'sin dato') AS goal, count(*) AS n FROM public.app_state GROUP BY 1) g
    ), '{}'::jsonb),
    'push', jsonb_build_object(
      'users',   (SELECT count(DISTINCT user_id) FROM public.push_subscriptions),
      'devices', (SELECT count(*) FROM public.push_subscriptions),
      'by_platform', COALESCE((
        SELECT jsonb_object_agg(p.platform, p.n)
        FROM (SELECT COALESCE(platform, 'web') AS platform, count(*) AS n FROM public.push_subscriptions GROUP BY 1) p
      ), '{}'::jsonb)
    ),
    'watches', jsonb_build_object(
      'strava', (SELECT count(*) FROM public.strava_connections),
      'suunto', (SELECT count(*) FROM public.suunto_connections),
      'wahoo',  (SELECT count(*) FROM public.wahoo_connections),
      'polar',  (SELECT count(*) FROM public.polar_connections),
      'coros',  (SELECT count(*) FROM public.coros_connections),
      'users_with_any', (
        SELECT count(*) FROM (
          SELECT user_id FROM public.strava_connections
          UNION SELECT user_id FROM public.suunto_connections
          UNION SELECT user_id FROM public.wahoo_connections
          UNION SELECT user_id FROM public.polar_connections
          UNION SELECT user_id FROM public.coros_connections
        ) x
      )
    )
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_stats() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO service_role;
