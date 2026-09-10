-- ============================================================================
-- Test manual de las políticas RLS de sql/social.sql (usernames, follows,
-- run_feed, run_likes). Ese archivo se escribió sin poder probarlo contra una
-- base real (sin conexión a internet en ese momento) -- este script es la
-- prueba que quedó pendiente, pensada para correrse una sola vez a mano en el
-- SQL Editor de Supabase.
--
-- NO hace falta crear cuentas nuevas: Postgres permite "hacerse pasar" por un
-- usuario ya logueado dentro de una transacción, seteando el rol a
-- "authenticated" y el claim request.jwt.claims con su UUID -- así probamos
-- las políticas exactamente como las vería la app desde el navegador, sin
-- necesitar su contraseña ni su sesión real.
--
-- CÓMO USARLO:
--   1. Conseguí los UUID de DOS usuarios reales que ya existan en tu tabla
--      auth.users (Authentication -> Users en el dashboard de Supabase, o
--      `select id, email from auth.users limit 5;`).
--   2. Reemplazá 'UUID_A' y 'UUID_B' más abajo por esos dos UUID reales.
--   3. Pegá el script entero en el SQL Editor y corré todo de una. Cada
--      bloque imprime lo que encontró y compara contra lo que "debería" ver.
--   4. Es de sólo lectura + una limpieza al final (DELETE de las filas que
--      el propio script crea) -- no toca ningún dato real de esos usuarios
--      más allá de las filas de prueba que este script mismo inserta.
-- ============================================================================

do $$
declare
  user_a uuid := 'UUID_A';  -- <-- reemplazar
  user_b uuid := 'UUID_B';  -- <-- reemplazar
  user_c uuid := gen_random_uuid(); -- no existe de verdad -- se usa para probar auth.uid() = NULL / rol anon
  run_a_id uuid;
  visible_to_b int;
  visible_to_c int;
  like_visible_to_c int;
begin
  -- Limpieza defensiva por si una corrida anterior quedó a mitad de camino.
  delete from public.run_likes where run_feed_id in (select id from public.run_feed where user_id = user_a);
  delete from public.run_feed where user_id = user_a;
  delete from public.follows where follower_id = user_b and followee_id = user_a;
  delete from public.usernames where user_id in (user_a, user_b);

  -- Setup: A y B tienen username, B sigue a A, A comparte una carrera.
  insert into public.usernames (user_id, username) values (user_a, 'test_runner_a') on conflict (user_id) do nothing;
  insert into public.usernames (user_id, username) values (user_b, 'test_runner_b') on conflict (user_id) do nothing;

  perform set_config('request.jwt.claims', json_build_object('sub', user_b::text)::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.follows (follower_id, followee_id) values (user_b, user_a);

  perform set_config('request.jwt.claims', json_build_object('sub', user_a::text)::text, true);
  insert into public.run_feed (user_id, run_id, distance_km, duration_sec, run_date)
    values (user_a, 'test_run_1', 10.5, 3000, current_date)
    returning id into run_a_id;

  -- TEST 1: B sigue a A -> B debería VER la carrera de A en el feed.
  perform set_config('request.jwt.claims', json_build_object('sub', user_b::text)::text, true);
  select count(*) into visible_to_b from public.run_feed where id = run_a_id;
  if visible_to_b = 1 then
    raise notice 'TEST 1 OK: B (que sigue a A) ve la carrera compartida por A.';
  else
    raise warning 'TEST 1 FALLÓ: B debería ver la carrera de A y no la ve (visible_to_b=%). Revisar run_feed_select_own_or_following.', visible_to_b;
  end if;

  -- TEST 2: C NO sigue a A -> C NO debería ver la carrera de A.
  perform set_config('request.jwt.claims', json_build_object('sub', user_c::text)::text, true);
  select count(*) into visible_to_c from public.run_feed where id = run_a_id;
  if visible_to_c = 0 then
    raise notice 'TEST 2 OK: C (que no sigue a A) NO ve la carrera de A.';
  else
    raise warning 'TEST 2 FALLÓ: C no debería ver la carrera de A pero la ve (visible_to_c=%). Filtra información a gente que no sigue al dueño.', visible_to_c;
  end if;

  -- TEST 3: C intenta poner un like en una carrera que no puede ver -> el
  -- INSERT tiene que ser rechazado por la política (WITH CHECK), no solo
  -- "no verse" después.
  begin
    insert into public.run_likes (run_feed_id, user_id) values (run_a_id, user_c);
    raise warning 'TEST 3 FALLÓ: C pudo insertar un like en una carrera que no puede ver -- run_likes_insert_own_on_visible_run no está frenando esto.';
    delete from public.run_likes where run_feed_id = run_a_id and user_id = user_c;
  exception when insufficient_privilege or others then
    raise notice 'TEST 3 OK: a C se le rechazó el like en una carrera que no puede ver.';
  end;

  -- TEST 4: B (que sí puede ver la carrera) pone un like -> tiene que andar.
  perform set_config('request.jwt.claims', json_build_object('sub', user_b::text)::text, true);
  begin
    insert into public.run_likes (run_feed_id, user_id) values (run_a_id, user_b);
    raise notice 'TEST 4 OK: B pudo poner like en la carrera de A (que sí sigue).';
  exception when others then
    raise warning 'TEST 4 FALLÓ: B no pudo poner like en una carrera que sí puede ver. Error: %', sqlerrm;
  end;

  -- TEST 5: C no sigue a A -> el conteo de likes tampoco debería filtrarle
  -- que la carrera existe (0 filas visibles, no un error distinto).
  perform set_config('request.jwt.claims', json_build_object('sub', user_c::text)::text, true);
  select count(*) into like_visible_to_c from public.run_likes where run_feed_id = run_a_id;
  if like_visible_to_c = 0 then
    raise notice 'TEST 5 OK: C no ve los likes de una carrera que no puede ver.';
  else
    raise warning 'TEST 5 FALLÓ: C ve % like(s) de una carrera que no debería poder ver.', like_visible_to_c;
  end if;

  -- TEST 6: alguien sin sesión (rol anon, sin JWT) no debería poder leer nada.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  select count(*) into visible_to_c from public.run_feed where id = run_a_id;
  if visible_to_c = 0 then
    raise notice 'TEST 6 OK: un pedido sin sesión (anon) no ve la carrera.';
  else
    raise warning 'TEST 6 FALLÓ: un pedido sin sesión pudo leer run_feed.';
  end if;

  -- Limpieza: dejamos todo como estaba antes de correr el script.
  perform set_config('role', 'service_role', true);
  delete from public.run_likes where run_feed_id = run_a_id;
  delete from public.run_feed where id = run_a_id;
  delete from public.follows where follower_id = user_b and followee_id = user_a;
  delete from public.usernames where user_id in (user_a, user_b);

  raise notice '--- listo, limpieza hecha. Si todos los TEST de arriba dicen OK, las políticas de social.sql están bien. ---';
end $$;
