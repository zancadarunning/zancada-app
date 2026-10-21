-- ============================================================================
-- Quitar permisos de tabla que la app no usa (defensa en profundidad).
--
-- Supabase da por defecto, a los roles "anon" (sin sesión) y "authenticated" (con sesión), todos los permisos sobre cada tabla nueva de "public",
-- incluidos TRUNCATE, REFERENCES y TRIGGER. Lo único que hoy protege los datos son las reglas RLS (que están bien y se verificaron: ninguna tabla sin
-- RLS). Pero TRUNCATE no pasa por RLS, y un permiso que no se usa es un permiso de más: si algún día alguien desactiva RLS en una tabla por error,
-- o aparece una forma de ejecutar TRUNCATE desde la API, "anon" no tendría que poder hacer nada.
--
-- La app consulta SOLO con la sesión de la persona (rol authenticated) y solo 7 tablas (ver .from('...') en app.js); el servidor usa la clave de
-- servicio. Nada usa "anon" sobre las tablas. No cambia ningún dato ni ninguna regla RLS.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo. Es seguro volver a correrlo.
-- Para comprobarlo después (tiene que dar 0 filas):
--   select table_name, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')));
-- Si algo dejara de andar, para volver atrás:  grant select, insert, update, delete on all tables in schema public to authenticated;
-- ============================================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Lo mismo para las tablas que se creen más adelante (por defecto Supabase les vuelve a dar todo).
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;
