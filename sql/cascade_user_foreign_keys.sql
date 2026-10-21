-- ============================================================================
-- Borrar la cuenta: dos tablas impedían borrar el usuario.
--
-- push_subscriptions y strava_connections se crearon a mano en Supabase con la clave hacia auth.users SIN "on delete cascade" (la base lo muestra como
-- NO ACTION). Mientras una persona tuviera una fila en cualquiera de las dos (notificaciones activadas o Strava conectado), la base se negaba a borrar
-- su usuario y "Eliminar cuenta" respondía error. El resto de las tablas con datos de personas ya borran en cascada.
--
-- api/delete-account.js ya vacía estas dos tablas antes de pedir el borrado, así que funciona aunque este archivo no se haya corrido; esto deja la
-- restricción bien definida en la base (y cubre cualquier otro camino que borre un usuario, por ejemplo desde el panel de Supabase).
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo. Es seguro volver a correrlo. No cambia ningún dato.
-- Para comprobarlo después:
--   select conrelid::regclass as tabla, pg_get_constraintdef(oid) as regla
--   from pg_constraint where contype = 'f' and conname in ('push_subscriptions_user_id_fkey', 'strava_connections_user_id_fkey');
--   -- las dos reglas tienen que terminar en "ON DELETE CASCADE"
-- ============================================================================

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_user_id_fkey,
  add constraint push_subscriptions_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.strava_connections
  drop constraint if exists strava_connections_user_id_fkey,
  add constraint strava_connections_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;
