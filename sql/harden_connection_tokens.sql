-- ============================================================================
-- Endurecimiento: que el navegador/app NUNCA pueda leer los tokens de las marcas.
--
-- Hoy cada usuario puede hacer SELECT de su propia fila en strava/polar/wahoo/coros/
-- suunto_connections, columnas access_token y refresh_token incluidas (la política RLS
-- "select_own" lo permite). Si alguna vez hubiera un XSS en la app, un script podría leerlos
-- y mandarlos afuera. El navegador solo necesita saber SI hay conexión (user_id) y, para
-- Strava/Polar, un id visible: los tokens los usa únicamente el servidor (api/, con la
-- service key, que se saltea estos permisos).
--
-- Verificado en app.js: las únicas lecturas del cliente son
--   strava_connections  -> user_id, athlete_id
--   polar_connections   -> user_id, polar_user_id
--   wahoo/coros/suunto  -> user_id
-- (y los .delete() por user_id, que solo necesitan poder leer user_id).
--
-- Cómo correrlo: pegar TODO en el SQL Editor de Supabase y ejecutar. Es seguro correrlo
-- más de una vez. Para deshacerlo: GRANT SELECT ON public.<tabla> TO authenticated;
-- ============================================================================

REVOKE SELECT ON public.strava_connections FROM anon, authenticated;
GRANT  SELECT (user_id, athlete_id) ON public.strava_connections TO authenticated;

REVOKE SELECT ON public.polar_connections FROM anon, authenticated;
GRANT  SELECT (user_id, polar_user_id) ON public.polar_connections TO authenticated;

REVOKE SELECT ON public.wahoo_connections FROM anon, authenticated;
GRANT  SELECT (user_id) ON public.wahoo_connections TO authenticated;

REVOKE SELECT ON public.coros_connections FROM anon, authenticated;
GRANT  SELECT (user_id) ON public.coros_connections TO authenticated;

REVOKE SELECT ON public.suunto_connections FROM anon, authenticated;
GRANT  SELECT (user_id) ON public.suunto_connections TO authenticated;

-- ---------------------------------------------------------------------------
-- Controles para correr DESPUÉS (solo lectura, no cambian nada):
--
-- 1) Tablas de public SIN row level security (tendría que devolver 0 filas):
--      select tablename from pg_tables
--      where schemaname = 'public' and not rowsecurity;
--
-- 2) Qué columnas de las tablas de conexiones puede leer 'authenticated'
--    (tendría que listar solo las de arriba, sin access_token ni refresh_token):
--      select table_name, column_name
--      from information_schema.column_privileges
--      where grantee = 'authenticated' and privilege_type = 'SELECT'
--        and table_name like '%_connections'
--      order by 1, 2;
-- ---------------------------------------------------------------------------
