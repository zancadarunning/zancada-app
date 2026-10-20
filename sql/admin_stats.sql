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

-- Convierte un texto a fecha SIN romper si viene mal (los datos de app_state los escribe cada cuenta con su propio JWT: una fecha
-- inválida, por ejemplo '2026-13-45', hacía fallar admin_stats() entero). Devuelve NULL si no es una fecha válida.
CREATE OR REPLACE FUNCTION public.safe_date(p text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $
BEGIN
  IF p IS NULL OR p !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN NULL; END IF;
  RETURN p::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.safe_date(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.safe_date(text) TO service_role;

-- Largo de un array jsonb, 0 si no es un array (data.runs lo escribe cada cuenta: podría ser un texto o un número y jsonb_array_length fallaría).
CREATE OR REPLACE FUNCTION public.safe_array_len(j jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $ SELECT CASE WHEN jsonb_typeof(j) = 'array' THEN jsonb_array_length(j) ELSE 0 END $$;
REVOKE ALL ON FUNCTION public.safe_array_len(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.safe_array_len(jsonb) TO service_role;

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
      'users_with_runs',  (SELECT count(*) FROM public.app_state WHERE public.safe_array_len(data->'runs') > 0),
      'total_runs',       (SELECT COALESCE(sum(public.safe_array_len(data->'runs')), 0) FROM public.app_state)
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
    'funnel', jsonb_build_object(
      'registered', (SELECT count(*) FROM auth.users),
      'confirmed',  (SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL),
      'onboarded',  (SELECT count(*) FROM public.app_state WHERE data->>'onboarded' = 'true'),
      'with_runs',  (SELECT count(*) FROM public.app_state WHERE public.safe_array_len(data->'runs') > 0)
    ),
    'activity', (
      WITH r AS (
        SELECT a.user_id, left(e->>'date', 10) AS d
        FROM public.app_state a,
             jsonb_array_elements(CASE WHEN jsonb_typeof(a.data->'runs') = 'array' THEN a.data->'runs' ELSE '[]'::jsonb END) e
        WHERE public.safe_date(left(e->>'date', 10)) IS NOT NULL
      )
      SELECT jsonb_build_object(
        'ran_7d',   (SELECT count(DISTINCT user_id) FROM r WHERE public.safe_date(d) >= current_date - 7),
        'ran_30d',  (SELECT count(DISTINCT user_id) FROM r WHERE public.safe_date(d) >= current_date - 30),
        'runs_7d',  (SELECT count(*) FROM r WHERE public.safe_date(d) >= current_date - 7),
        'runs_30d', (SELECT count(*) FROM r WHERE public.safe_date(d) >= current_date - 30)
      )
    ),
    'db', jsonb_build_object(
      'size_bytes',           pg_database_size(current_database()),
      'app_state_total_bytes', (SELECT COALESCE(sum(pg_column_size(data)), 0) FROM public.app_state),
      'app_state_avg_bytes',   (SELECT COALESCE(avg(pg_column_size(data)), 0)::bigint FROM public.app_state),
      'app_state_max_bytes',   (SELECT COALESCE(max(pg_column_size(data)), 0) FROM public.app_state)
    ),
    'chat', jsonb_build_object(
      -- user_id 0000... es el contador GLOBAL del día (api/chat.js), no una persona: se excluye de los totales por persona
      'today_messages', (SELECT COALESCE(sum(count), 0) FROM public.chat_usage WHERE usage_date = current_date AND user_id <> '00000000-0000-0000-0000-000000000000'),
      'today_users',    (SELECT count(*) FROM public.chat_usage WHERE usage_date = current_date AND user_id <> '00000000-0000-0000-0000-000000000000'),
      'max_user_today', (SELECT COALESCE(max(count), 0) FROM public.chat_usage WHERE usage_date = current_date AND user_id <> '00000000-0000-0000-0000-000000000000'),
      'week_messages',  (SELECT COALESCE(sum(count), 0) FROM public.chat_usage WHERE usage_date >= current_date - 6 AND user_id <> '00000000-0000-0000-0000-000000000000'),
      'global_today',   (SELECT COALESCE(sum(count), 0) FROM public.chat_usage WHERE usage_date = current_date AND user_id = '00000000-0000-0000-0000-000000000000')
    ),
    'notifications_sent', jsonb_build_object(
      'last_7d',  (SELECT count(*) FROM public.sent_notifications WHERE sent_at > now() - interval '7 days'),
      'last_30d', (SELECT count(*) FROM public.sent_notifications WHERE sent_at > now() - interval '30 days')
    ),
    'sync_errors', jsonb_build_object(
      'strava', (SELECT count(*) FROM public.app_state a JOIN public.strava_connections c ON c.user_id = a.user_id
                  WHERE a.data->'stravaSync'->>'lastError' IS NOT NULL)
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
