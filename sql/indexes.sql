-- ============================================================================
-- Índices para las búsquedas del servidor (api/*.js) que filtran por una columna que NO es la clave primaria.
-- Sin índice, Postgres lee la tabla ENTERA (cada fila, y para app_state cada documento JSON) en cada búsqueda.
--
-- Cómo correrlo: pegar TODO en el SQL Editor de Supabase y ejecutar. Es seguro volver a correrlo (se fija si el índice
-- ya existe) y no bloquea la app: son tablas chicas hoy.
--
--  1) strava_connections(athlete_id): api/strava-webhook.js busca por athlete_id en CADA evento que manda Strava.
--  2) push_subscriptions(user_id): lo usan send-reminders.js (borrar suscripciones muertas) y los endpoints de push.
--
-- Después de correrlo, el control de abajo (SELECT) tiene que listar los 2 índices.
-- ============================================================================

-- 1 y 2) Solo si no hay ya un índice (o clave primaria) que arranque por esa columna.
DO $$
BEGIN
  IF to_regclass('public.strava_connections') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'strava_connections'
      AND indexdef ~* '\(athlete_id[,)]'
  ) THEN
    CREATE INDEX strava_connections_athlete_id_idx ON public.strava_connections (athlete_id);
  END IF;

  IF to_regclass('public.push_subscriptions') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'push_subscriptions'
      AND indexdef ~* '\(user_id[,)]'
  ) THEN
    CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions (user_id);
  END IF;
END $$;

-- Control (solo lectura): índices de las tablas que consulta el servidor.
-- SELECT tablename, indexname, indexdef FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename IN ('app_state','strava_connections','push_subscriptions',
--   'suunto_connections','polar_connections','wahoo_connections','coros_connections')
-- ORDER BY tablename, indexname;
