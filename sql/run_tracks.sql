-- ============================================================================
-- run_tracks: el recorrido GPS y las series (pulso / ritmo) de cada carrera salen de app_state.
--
-- Por que: el GPS era ~80% de lo que pesa app_state (una carrera ~10 KB; 100 carreras ~1 MB). Cada guardado subia TODO el estado y cada apertura lo bajaba entero.
--
-- Como funciona (todo en la base, asi cualquier escritor sigue mandando carreras completas: la app, versiones viejas, los crons de los relojes):
--   * trigger BEFORE INSERT/UPDATE en app_state: por cada carrera con recorrido completo (mas de 80 puntos) o con series, guarda el recorrido completo en run_tracks
--     y deja en app_state una version liviana (hasta ~60 puntos, sin series) con dos marcas: trkN (cuantos puntos tiene el guardado) y trkS (hay series).
--   * una escritura liviana (de un cliente que solo conoce la version liviana) NO pisa lo guardado: solo se reemplaza con algo igual o mas largo.
--   * si la carrera ya no esta en app_state (se borro), su recorrido se borra tambien. Si se borra la fila de app_state, se borran todos sus recorridos.
--   * run_tracks tiene RLS: cada persona solo LEE lo suyo. Nadie escribe desde un cliente: escribe el trigger (SECURITY DEFINER) y el backend (clave de servicio).
--   * tracks_enabled(): la app la consulta para saber si la separacion esta activa antes de mandar versiones livianas (sin esto, un cliente nuevo contra una base sin el trigger perderia GPS).
--
-- Migrar lo que ya existe: despues de crear el trigger, `update public.app_state set data = data;` (el trigger separa cada fila).
-- Es seguro volver a correrlo (create or replace / if not exists / drop trigger if exists).
-- ============================================================================

create table if not exists public.run_tracks (
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id text not null,
  points jsonb,
  series jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, run_id)
);

alter table public.run_tracks enable row level security;
drop policy if exists run_tracks_select_own on public.run_tracks;
create policy run_tracks_select_own on public.run_tracks for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.run_tracks from anon, authenticated;
grant select on public.run_tracks to authenticated;

-- Deja a lo sumo ~maxn puntos repartidos parejo; siempre conserva el primero, el ultimo y los que vienen de una pausa (gap).
create or replace function public.downsample_points(p jsonb, maxn int)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  with n as (select jsonb_array_length(p) as c),
       e as (select value, ord from jsonb_array_elements(p) with ordinality as t(value, ord))
  select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb)
  from e, n
  where n.c <= maxn
     or e.ord = 1 or e.ord = n.c
     or ((e.ord - 1) % greatest(1, ceil((n.c - 1)::numeric / (maxn - 1))::int)) = 0
     or (e.value ->> 'gap') = 'true'
$$;

create or replace function public.app_state_split_tracks()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  lean_keep constant int := 60;     -- puntos que quedan en app_state (alcanza para miniaturas y siluetas; el detalle baja el recorrido completo)
  full_over constant int := 80;     -- mas puntos que esto = recorrido completo, se guarda aparte (margen sobre lean_keep: una version liviana nunca se vuelve a recortar)
  runs jsonb; r jsonb; out_runs jsonb := '[]'::jsonb;
  rid text; pts jsonb; n int; has_series boolean;
  ids text[] := '{}'; kept_n int; kept_s boolean;
begin
  runs := NEW.data -> 'runs';
  if runs is null or jsonb_typeof(runs) <> 'array' then return NEW; end if;
  for r in select value from jsonb_array_elements(runs) loop
    rid := case when jsonb_typeof(r) = 'object' then r ->> 'id' end;
    if rid is null then out_runs := out_runs || jsonb_build_array(r); continue; end if;
    ids := ids || rid;
    pts := r -> 'points';
    n := case when jsonb_typeof(pts) = 'array' then jsonb_array_length(pts) else 0 end;
    has_series := jsonb_typeof(r -> 'series') = 'object';
    if n > full_over or has_series then
      insert into public.run_tracks as t (user_id, run_id, points, series)
      values (NEW.user_id, rid, case when n > 0 then pts end, case when has_series then r -> 'series' end)
      on conflict (user_id, run_id) do update set
        -- nunca se reemplaza algo mas largo por algo mas corto (un cliente o un cron que solo conoce la version liviana)
        points = case when excluded.points is not null and jsonb_array_length(excluded.points) >= coalesce(jsonb_array_length(t.points), 0) then excluded.points else t.points end,
        series = coalesce(excluded.series, t.series),
        updated_at = now()
      returning coalesce(jsonb_array_length(t.points), 0), (t.series is not null) into kept_n, kept_s;
      r := (r - 'series') || jsonb_build_object('trkN', kept_n, 'trkS', kept_s);
      if n > full_over then r := jsonb_set(r, '{points}', public.downsample_points(pts, lean_keep)); end if;
    end if;
    out_runs := out_runs || jsonb_build_array(r);
  end loop;
  NEW.data := jsonb_set(NEW.data, '{runs}', out_runs);
  delete from public.run_tracks where user_id = NEW.user_id and not (run_id = any(ids));
  return NEW;
end $$;

create or replace function public.app_state_drop_tracks()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.run_tracks where user_id = OLD.user_id;
  return OLD;
end $$;

-- true SOLO si el trigger existe y esta activo: un cliente nuevo contra una base sin el trigger mandaria versiones livianas y perderia GPS.
create or replace function public.tracks_enabled()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from pg_trigger where tgname = 'app_state_split_tracks_trg' and tgrelid = 'public.app_state'::regclass and not tgisinternal and tgenabled <> 'D')
$$;

revoke all on function public.downsample_points(jsonb, int) from public, anon, authenticated;
revoke all on function public.app_state_split_tracks() from public, anon, authenticated;
revoke all on function public.app_state_drop_tracks() from public, anon, authenticated;
revoke all on function public.tracks_enabled() from public, anon;
grant execute on function public.tracks_enabled() to authenticated;

drop trigger if exists app_state_split_tracks_trg on public.app_state;
create trigger app_state_split_tracks_trg before insert or update of data on public.app_state
  for each row execute function public.app_state_split_tracks();

drop trigger if exists app_state_drop_tracks_trg on public.app_state;
create trigger app_state_drop_tracks_trg after delete on public.app_state
  for each row execute function public.app_state_drop_tracks();
