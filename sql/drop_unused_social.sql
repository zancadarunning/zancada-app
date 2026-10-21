-- ============================================================================
-- Quita las tablas de la parte social (usernames, follows, run_feed, run_likes), que la app ya no usa.
--
-- Por qué: el cliente (app.js) no las lee ni las escribe desde que se sacó la función social; lo único que las nombra es api/delete-account.js,
-- que ya tolera que no existan (un 404 al borrar no cuenta como error). Seguir teniéndolas es superficie de ataque sin beneficio:
-- usernames tiene una política "usernames_select_any" que deja a cualquier persona con sesión listar todos los nombres de usuario.
-- Auditoría de la base del 2026-10-21: 2 filas en usernames y 2 en follows, ninguna en run_feed ni run_likes.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo UNA vez. Es DESTRUCTIVO (borra esas 4 tablas y sus
-- filas), así que correlo solo si no vas a volver a usar la función social. Si la querés de nuevo, sql/social.sql las recrea vacías.
-- ============================================================================

DROP TABLE IF EXISTS public.run_likes CASCADE;
DROP TABLE IF EXISTS public.run_feed CASCADE;
DROP TABLE IF EXISTS public.follows CASCADE;
DROP TABLE IF EXISTS public.usernames CASCADE;
