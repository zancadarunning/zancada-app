-- ============================================================================
-- Tablas + RLS para la parte social de la app: nombres de usuario, seguir
-- amigos, un feed de actividad y likes ("me gusta") a las carreras compartidas.
--
-- POR QUÉ SON TABLAS NUEVAS Y NO ALGO ADENTRO DE app_state:
-- app_state guarda TODO lo del usuario -- perfil, plan, y cada carrera con su
-- ruta GPS y su frecuencia cardíaca -- en un único campo JSONB por usuario
-- (ver sql/user_data_rls.sql). Para que un amigo pueda ver "lo que corriste"
-- sin que eso signifique exponerle la ruta exacta por donde corriste o tu
-- frecuencia cardíaca, hace falta que esos datos sensibles NI SIQUIERA EXISTAN
-- en la tabla que un amigo puede leer. Por eso run_feed (la tabla que arma el
-- feed) tiene columnas mínimas a propósito -- distancia, duración y fecha; no
-- hay ninguna columna para puntos de mapa ni para frecuencia cardíaca, así que
-- no hay forma de que ese dato termine ahí ni por un bug del cliente.
--
-- QUÉ TABLAS CREA:
--   usernames   -- un nombre de usuario público por persona (para poder
--                  buscarse y seguirse; no expone nada más del perfil).
--   follows     -- quién sigue a quién.
--   run_feed    -- versión resumida de una carrera, compartida a propósito
--                  por su dueño (acción explícita desde la app, nunca
--                  automática) -- solo distancia/duración/fecha.
--   run_likes   -- los "me gusta" que recibió cada carrera del feed.
--
-- CÓMO SE ESCRIBE: igual que app_state y strava_connections, el CLIENTE
-- (app.js) escribe directo a estas tablas con la clave pública de Supabase
-- (SUPABASE_ANON_KEY) -- no hay un endpoint de api/* en el medio. Lo que
-- decide qué puede leer o tocar cada usuario son las políticas de RLS de acá
-- abajo, no el código de la app.
--
-- IMPORTANTE -- LEER ANTES DE CORRER ESTO:
-- Este archivo se escribió sin poder probarlo contra una base de Supabase
-- real (sin acceso a internet desde donde se armó). Las políticas siguen el
-- mismo patrón conservador que ya viene funcionando en user_data_rls.sql
-- (cada quien toca únicamente lo suyo, con las excepciones puntuales que se
-- explican en cada bloque), pero por tratarse de datos que SÍ se comparten
-- entre usuarios (a diferencia de las tablas anteriores, 100% privadas),
-- vale la pena que las pruebes vos con dos cuentas de prueba antes de darlo
-- por terminado: crear usuario en la cuenta A, seguir desde la cuenta B,
-- compartir una carrera desde A y confirmar que aparece en el feed de B (y
-- NO en el de una cuenta C que no lo sigue), y probar el like en los dos
-- sentidos. Es seguro volver a correr este archivo entero las veces que
-- haga falta -- los "if not exists" y "drop policy if exists" hacen que no
-- falle si algo ya existía.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- usernames ----------
-- Un nombre de usuario público por persona. Se puede buscar por nombre de
-- usuario (para seguir a alguien), así que la política de lectura es abierta
-- a cualquier usuario logueado -- pero esta tabla solo tiene el nombre de
-- usuario, nada más del perfil, así que no hay nada sensible que exponer.
create table if not exists public.usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

alter table public.usernames enable row level security;

drop policy if exists "usernames_select_any" on public.usernames;
create policy "usernames_select_any" on public.usernames
  for select to authenticated using (true);

drop policy if exists "usernames_insert_own" on public.usernames;
create policy "usernames_insert_own" on public.usernames
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "usernames_update_own" on public.usernames;
create policy "usernames_update_own" on public.usernames
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "usernames_delete_own" on public.usernames;
create policy "usernames_delete_own" on public.usernames
  for delete to authenticated using (auth.uid() = user_id);

-- ---------- follows ----------
-- Quién sigue a quién. followee_id apunta a usernames (no directo a
-- auth.users) a propósito -- solo se puede seguir a alguien que ya tiene un
-- nombre de usuario creado, que es justo como se lo busca desde la app.
-- La lectura está permitida tanto al que sigue como al seguido (para poder
-- mostrar, en el futuro, "quién te sigue a vos" sin tener que rediseñar
-- esto) -- no es información sensible, ya que solo relaciona dos ids.
create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references public.usernames(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows(followee_id);

alter table public.follows enable row level security;

drop policy if exists "follows_select_own_or_follower" on public.follows;
create policy "follows_select_own_or_follower" on public.follows
  for select to authenticated using (auth.uid() = follower_id or auth.uid() = followee_id);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own" on public.follows
  for insert to authenticated with check (auth.uid() = follower_id);

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own" on public.follows
  for delete to authenticated using (auth.uid() = follower_id);

-- ---------- run_feed ----------
-- Versión resumida de una carrera, compartida a propósito por su dueño desde
-- el detalle de esa carrera en la app ("Compartir con amigos") -- nunca se
-- llena sola. OJO: a propósito NO tiene columnas para ruta GPS ni frecuencia
-- cardíaca -- si en algún momento se quiere sumar algo más al feed, pensarlo
-- dos veces antes de agregar una columna acá, porque cualquier columna que
-- exista pasa a ser visible para quien te sigue.
create table if not exists public.run_feed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usernames(user_id) on delete cascade,
  run_id text,
  distance_km numeric not null check (distance_km > 0),
  duration_sec integer not null check (duration_sec > 0),
  run_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, run_id)
);
create index if not exists run_feed_user_date_idx on public.run_feed(user_id, run_date desc);

-- Valores razonables: sin esto cualquier usuario podía publicar carreras imposibles (9999 km en 1 segundo) que ven sus seguidores.
-- Ritmo entre 2:00 y 20:00 por km, hasta 500 km y hasta 48 h. NOT VALID: no revisa las filas que ya existen.
alter table public.run_feed drop constraint if exists run_feed_sane;
alter table public.run_feed add constraint run_feed_sane check (
  distance_km <= 500
  and duration_sec <= 172800
  and duration_sec::numeric / distance_km between 120 and 1200
) not valid;

alter table public.run_feed enable row level security;

-- Se puede ver la carrera si es propia, o si el que mira sigue a quien la
-- compartió. No se agrega política de UPDATE -- una carrera compartida no se
-- edita, se borra y se vuelve a compartir si hiciera falta.
drop policy if exists "run_feed_select_own_or_following" on public.run_feed;
create policy "run_feed_select_own_or_following" on public.run_feed
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = run_feed.user_id)
  );

drop policy if exists "run_feed_insert_own" on public.run_feed;
create policy "run_feed_insert_own" on public.run_feed
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "run_feed_delete_own" on public.run_feed;
create policy "run_feed_delete_own" on public.run_feed
  for delete to authenticated using (auth.uid() = user_id);

-- ---------- run_likes ----------
-- Los "me gusta" de una carrera del feed. Solo se puede ver, poner o sacar
-- un like en una carrera que la política de arriba (run_feed) ya te deja ver
-- -- así el conteo de likes no filtra la existencia de una carrera que no
-- deberías poder ver.
create table if not exists public.run_likes (
  run_feed_id uuid not null references public.run_feed(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (run_feed_id, user_id)
);
create index if not exists run_likes_run_feed_idx on public.run_likes(run_feed_id);

alter table public.run_likes enable row level security;

drop policy if exists "run_likes_select_visible_run" on public.run_likes;
create policy "run_likes_select_visible_run" on public.run_likes
  for select to authenticated using (
    exists (
      select 1 from public.run_feed rf
      where rf.id = run_likes.run_feed_id
        and (rf.user_id = auth.uid()
             or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = rf.user_id))
    )
  );

drop policy if exists "run_likes_insert_own_on_visible_run" on public.run_likes;
create policy "run_likes_insert_own_on_visible_run" on public.run_likes
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.run_feed rf
      where rf.id = run_feed_id
        and (rf.user_id = auth.uid()
             or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = rf.user_id))
    )
  );

drop policy if exists "run_likes_delete_own" on public.run_likes;
create policy "run_likes_delete_own" on public.run_likes
  for delete to authenticated using (auth.uid() = user_id);
